// The shared machinery behind the rules walkthroughs (`_walk-*.js`).
//
// Each walk drives the real board in a real browser against the real engine and checks a
// handful of Comprehensive Rules. What differs between them is the rules and the decks; what
// does not is all of this — reading the board, pressing its buttons, laying a mana base one
// drop per turn, and running the opponent's seat over the wire.
//
// It lives here because the second walk is the copy to catch, not the third. `_walk-the-stack`
// grew this harness while it was the only one; pasting it into `_walk-combat` would have
// duplicated the two things most likely to need fixing in both at once — the turn-advancing
// loop and the opponent's play routine.
const NL = String.fromCharCode(10);
const { By, until } = require('selenium-webdriver');
const { baseUrl } = require('../config');
const {
  sleep,
  api,
  signIn,
  userIdFromToken,
  deckFor,
  signInThroughTheForm,
  seat,
} = require('./board-driver');

/** A running tally that prints as it goes and reports at the end. */
function makeChecker() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(
      '  ' + (ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(54) + (detail === undefined ? '' : detail),
    );
  };
  const section = (title) => console.log(NL + '--- ' + title + ' ---' + NL);
  const summary = () => {
    const failed = results.filter((r) => !r.ok);
    console.log(NL + results.length + ' checks, ' + failed.length + ' failed' + NL);
    return failed.length;
  };
  return { check, section, summary, results };
}

/**
 * Two accounts, two decks, an invite and an accepted game.
 *
 * `deckFor` reuses a deck by name and never rewrites its list, so a walk that changes its deck
 * must change the name with it — hence the names being arguments rather than constants.
 */
async function setUpGame({ a, b, deckA, deckB, deckNameA, deckNameB, startingLife = 60 }) {
  const tokenA = await signIn(a);
  const tokenB = await signIn(b);
  const deckAId = await deckFor(tokenA, deckNameA, deckA);
  const deckBId = await deckFor(tokenB, deckNameB, deckB);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckAId,
    opponentUserId: userIdFromToken(tokenB),
    startingLife,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckBId })
  ).gameId;

  return { gameId, tokenA, tokenB };
}

/** Everything that reads or presses the board, bound to one driver. */
function boardTools(d) {
  const read = (script) => d.executeScript('return (function(){' + script + '})();');

  const press = (pattern) =>
    d.executeScript(
      [
        'var want = new RegExp(arguments[0], "i");',
        'var b = [].slice.call(document.querySelectorAll(".status-actions .action-btn, .stack-actions .action-btn"))',
        '  .filter(function (x) { return want.test(x.textContent) && !x.disabled; })[0];',
        'if (!b) return null;',
        'b.click();',
        'return b.textContent.trim();',
      ].join(''),
      pattern,
    );

  /** What the board says, with the stack read exactly as it is drawn. */
  const boardState = () =>
    read(
      [
        'var text = function (s) { var el = document.querySelector(s); return el ? el.textContent.trim().replace(/[ ]+/g, " ") : null; };',
        'var names = function (s) { return [].slice.call(document.querySelectorAll(s)).map(function (n) { return n.textContent.trim(); }); };',
        'return {',
        '  status: text(".status-message"),',
        '  buttons: names(".status-actions .action-btn"),',
        '  turn: text(".turn-badge"),',
        '  activePip: text(".phase-pip.active .pip-label"),',
        '  panel: [].slice.call(document.querySelectorAll(".stack-item")).map(function (n) {',
        '    return {',
        '      name: (n.querySelector(".stack-item-name") || {}).textContent,',
        '      index: (n.querySelector(".stack-item-index") || {}).textContent,',
        '      top: n.classList.contains("stack-item-top"),',
        '    };',
        '  }),',
        '  panelShown: !!document.querySelector(".stack-panel"),',
        '  hand: names(".hand-card-wrapper .card-name"),',
        '  castable: document.querySelectorAll(".hand-card-wrapper .card.castable").length,',
        '  mana: document.querySelectorAll(".self-sidebar .mana-pip-icon:not(.empty)").length,',
        '  life: names(".life-number"),',
        '  myLands: names(".self-field .lands-row .card-name"),',
        '  myCreatures: names(".self-field .permanents-row .card-name"),',
        '  theirCreatures: names(".opponent-field .permanents-row .card-name"),',
        '  myTapped: document.querySelectorAll(".self-field .card.tapped").length,',
        '  attacking: document.querySelectorAll(".self-field .card.attacking, .self-field .card.is-attacking, .self-field .card.pending-attacker").length,',
        '  theirAttacking: document.querySelectorAll(".opponent-field .card.attacking, .opponent-field .card.is-attacking").length,',
        '  refusals: (window.__refusals || []).slice(-4),',
        '};',
      ].join(''),
    );

  /** How the stack panel is actually laid out on screen, top-to-bottom. */
  const panelAsDrawn = () =>
    read(
      [
        'var items = [].slice.call(document.querySelectorAll(".stack-item"));',
        'return items',
        '  .map(function (n) {',
        '    return {',
        '      name: (n.querySelector(".stack-item-name") || {}).textContent.trim(),',
        '      y: Math.round(n.getBoundingClientRect().top),',
        '      top: n.classList.contains("stack-item-top"),',
        '    };',
        '  })',
        '  .sort(function (a, b) { return a.y - b.y; });',
      ].join(''),
    );

  const playFromHand = (pattern) =>
    d.executeScript(
      [
        'var want = new RegExp(arguments[0], "i");',
        'var w = [].slice.call(document.querySelectorAll(".hand-card-wrapper"))',
        '  .filter(function (x) {',
        '    var n = x.querySelector(".card-name");',
        '    return n && want.test(n.textContent);',
        '  })[0];',
        'if (!w) return null;',
        'var face = w.querySelector(".card");',
        'var castable = face.classList.contains("castable");',
        'face.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));',
        'return { name: w.querySelector(".card-name").textContent.trim(), castable: castable };',
      ].join(''),
      pattern,
    );

  /** Clicks one of your own permanents by name — how a creature is picked or a land tapped. */
  const clickMine = (pattern) =>
    d.executeScript(
      [
        'var want = new RegExp(arguments[0], "i");',
        'var c = [].slice.call(document.querySelectorAll(".self-field app-card"))',
        '  .filter(function (x) {',
        '    var n = x.querySelector(".card-name");',
        '    return n && want.test(n.textContent);',
        '  })[0];',
        'if (!c) return null;',
        'c.querySelector(".card").click();',
        'return (c.querySelector(".card-name") || {}).textContent.trim();',
      ].join(''),
      pattern,
    );

  const tapAllLands = () =>
    d.executeScript(
      [
        'var lands = [].slice.call(document.querySelectorAll(".self-field .lands-row app-card"));',
        'var n = 0;',
        'lands.filter(function (c) { return !c.querySelector(".card.tapped"); })',
        '  .forEach(function (c) { c.querySelector(".card").click(); n++; });',
        'return n;',
      ].join(''),
    );

  /** Keeps every toast the engine raises, so a refusal is still readable after it fades. */
  const recordRefusals = () =>
    d.executeScript(
      [
        'if (window.__refusalsHooked) return;',
        'window.__refusalsHooked = true;',
        'window.__refusals = [];',
        'new MutationObserver(function () {',
        '  [].slice.call(document.querySelectorAll(".toast-msg")).forEach(function (n) {',
        '    var t = n.textContent.trim();',
        '    if (t && window.__refusals[window.__refusals.length - 1] !== t) window.__refusals.push(t);',
        '  });',
        '}).observe(document.body, { childList: true, subtree: true });',
      ].join(''),
    );

  /** Signs in through the real form and opens the board on a game. */
  const openBoard = async (player, gameId) => {
    await signInThroughTheForm(d, { By, until }, player);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(2500);
    await recordRefusals();
  };

  return {
    read,
    press,
    boardState,
    panelAsDrawn,
    playFromHand,
    clickMine,
    tapAllLands,
    recordRefusals,
    openBoard,
  };
}

/** The turn-advancing half: the opponent's seat, and getting the board to a given moment. */
function playTools(d, tools, opts = {}) {
  const { boardState, press, playFromHand, read } = tools;
  const landRe = opts.opponentLand || /Forest/;
  const creature = opts.opponentCreature || 'Grizzly Bears';
  const creatureCost = opts.opponentCreatureCost || 2;

  const atMyMain = (s) =>
    s.activePip === 'M1' &&
    /restart-check-a/i.test(s.turn || '') &&
    s.buttons.some((b) => /pass priority/i.test(b));

  async function bobPlays(bob) {
    let idle = 0;
    for (let i = 0; i < 60; i++) {
      const v = await bob.refresh();
      if (v.choice) {
        if (v.choice.playerId === bob.id) {
          await bob.answerChoice();
          await sleep(180);
          idle = 0;
          continue;
        }
        return 'alice';
      }
      if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
        if (v.activePlayerId === bob.id) {
          // How many the opponent swings with matters to more than the damage: a creature that
          // attacked is tapped through your next turn, so a seat that attacks with everything
          // can never block, and a walk that wants a blocker will silently never get one.
          const swing =
            opts.opponentAttacks === undefined ? bob.ready().length : opts.opponentAttacks;
          await bob.attack(swing);
          await sleep(200);
          continue;
        }
        return 'alice';
      }
      if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
        if (v.activePlayerId !== bob.id) {
          await bob.block(opts.opponentBlocks === undefined ? 1 : opts.opponentBlocks);
          await sleep(200);
          continue;
        }
        return 'alice';
      }

      // Bob develops a board rather than sitting there passing. A seat that never plays a land
      // makes the opponent's half of the screen look broken to anyone watching, and it means
      // blocking, opposing creatures and the opponent's land row are never drawn from anything
      // real — which is exactly where the board is most likely to be quietly wrong.
      if (
        v.activePlayerId === bob.id &&
        v.priorityPlayerId === bob.id &&
        /Main/i.test(v.currentStep || '') &&
        (v.stack || []).length === 0
      ) {
        if (await bob.playLand(landRe)) {
          await sleep(160);
          idle = 0;
          continue;
        }
        if (await bob.cast(creature, landRe, creatureCost)) {
          await sleep(200);
          idle = 0;
          continue;
        }
      }

      if (v.priorityPlayerId === bob.id) {
        await bob.pass();
        await sleep(140);
        idle = 0;
        continue;
      }
      if (++idle >= 3) return 'alice';
      await sleep(200);
    }
    return 'stuck';
  }

  async function advance(bob, untilFn) {
    for (let i = 0; i < 400; i++) {
      const s = await boardState();
      if (untilFn(s)) return true;

      // A finished game never reaches the condition, and grinding out the whole budget hides
      // why: the walk reported that it could not find a main phase when what happened was
      // that it lost.
      if (s.life.some((n) => Number(n) <= 0)) {
        console.log('    (the game is over — life ' + JSON.stringify(s.life) + ')');
        return false;
      }

      // Count and click in one step. Done as two, the button can resolve away in between and
      // the click throws on `undefined`, which ends the whole walk on a race rather than a
      // finding.
      const clickedChoice = await read(
        [
          'var b = document.querySelectorAll(".action-btn.choice")[0];',
          'if (!b) return false;',
          'b.click();',
          'return true;',
        ].join(''),
      );
      if (clickedChoice) {
        await sleep(450);
        continue;
      }
      if (s.buttons.some((b) => /^confirm/i.test(b))) {
        await press('confirm');
        await sleep(300);
        continue;
      }
      if (s.buttons.some((b) => /declare/i.test(b))) {
        await press('declare');
        await sleep(300);
        await press('confirm');
        await sleep(300);
        continue;
      }
      if (s.buttons.some((b) => /pass priority/i.test(b))) {
        await press('pass priority');
        await sleep(220);
        continue;
      }
      if ((await bobPlays(bob)) === 'stuck') return false;
      await sleep(160);
    }
    return false;
  }

  /**
   * Lands, one per turn, until there are enough of each named kind (CR 305.2).
   *
   * The obvious loop — advance to a main phase, play a land, repeat — quietly does nothing
   * after the first one. Playing a land does not leave the main phase, so `advance` returns
   * straight away and the next drop is refused for the turn it is already in. This waits for
   * the turn badge to change, which is the thing that actually gates a drop, and tolerates a
   * turn where the wanted land simply was not in hand.
   */
  async function landsDown(bob, wanted) {
    const count = async () => {
      const names = (await boardState()).myLands;
      const out = {};
      for (const key of Object.keys(wanted)) {
        out[key] = names.filter((n) => new RegExp(key, 'i').test(n)).length;
      }
      return out;
    };
    const short = (have) => Object.keys(wanted).find((k) => (have[k] || 0) < wanted[k]);

    let have = await count();
    let stalls = 0;
    const stalled = () => ++stalls >= 4;

    for (let guard = 0; guard < 24 && short(have); guard++) {
      if (!(await advance(bob, atMyMain))) {
        if (stalled()) break;
        continue;
      }
      const turn = (await boardState()).turn;

      const want = short(have);
      const played =
        (await playFromHand(want)) || (await playFromHand(Object.keys(wanted).join('|')));
      await sleep(800);

      have = await count();
      if (short(have) && played) {
        // The board draws a land a beat after the engine accepts it. Reading once had this
        // report one short and give up with the land already on the table — and then the
        // section that needed the mana failed for a reason that was nothing to do with it.
        await sleep(700);
        have = await count();
      }
      if (!short(have)) break;
      if (!played && stalled()) break;
      if (played) stalls = 0;

      if (!(await advance(bob, (now) => now.turn !== turn && atMyMain(now))) && stalled()) break;
    }
    return have;
  }

  return { atMyMain, bobPlays, advance, landsDown };
}

module.exports = { NL, makeChecker, setUpGame, boardTools, playTools, sleep, api, seat, signIn };
