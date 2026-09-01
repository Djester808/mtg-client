// Drives the restored original board through a real game, control by control.
//
//   HEADLESS=false node _walk-the-original-board.js
//
// Nothing is stubbed. The browser is Alice and works the board the way a player does; Bob is a
// second seat on the wire, because a second player cannot share the browser. Every check prints
// PASS or FAIL with what was actually on screen, so the log can be held against the window.
//
// The board is the one that predates the current engine — NgRx, GameStateDto, double-click to
// play — reaching MtgEngine.Rules through GameViewAdapter and SignalRService.
const NL = String.fromCharCode(10);
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const {
  sleep,
  api,
  signIn,
  userIdFromToken,
  deckFor,
  signInThroughTheForm,
  seat,
} = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['34 Mountain', '18 Goblin Piker', '18 Lightning Bolt'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);
const WATCHING = process.env.HEADLESS === 'false';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(
    '  ' + (ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(52) + (detail === undefined ? '' : detail),
  );
};

let d;
const read = (script) => d.executeScript('return (function(){' + script + '})();');

/** Presses the first button in the status bar whose label matches. */
const press = (pattern) =>
  d.executeScript(
    [
      'var want = new RegExp(arguments[0], "i");',
      'var b = [].slice.call(document.querySelectorAll(".status-actions .action-btn"))',
      '  .filter(function (x) { return want.test(x.textContent) && !x.disabled; })[0];',
      'if (!b) return null;',
      'b.click();',
      'return b.textContent.trim();',
    ].join(''),
    pattern,
  );

/** What the board says right now, read off the DOM. */
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
      '  myCreatures: names(".self-field .permanents-row .card-name"),',
      '  myLands: names(".self-field .lands-row .card-name"),',
      '  theirCreatures: names(".opponent-field .permanents-row .card-name"),',
      '  theirLands: names(".opponent-field .lands-row .card-name"),',
      '  hand: names(".hand-card-wrapper .card-name"),',
      '  handCount: document.querySelectorAll(".hand-card-wrapper").length,',
      '  castable: document.querySelectorAll(".hand-card-wrapper .card.castable").length,',
      '  mana: document.querySelectorAll(".self-sidebar .mana-pip-icon:not(.empty)").length,',
      '  life: names(".life-number"),',
      '  stack: names(".stack-item-name"),',
      '  arrows: document.querySelectorAll(".arrows-svg path").length,',
      '  readyCreatures: [].slice.call(document.querySelectorAll(".self-field .permanents-row app-card"))',
      '    .filter(function (c) { return !c.querySelector(".sick-overlay") && !c.querySelector(".card.tapped"); }).length,',
      '  toasts: names("app-toast-container .toast-msg"),',
      '};',
    ].join(''),
  );

/** Double-clicks a card in hand by name — how the original board plays and casts. */
const playFromHand = (pattern) =>
  d.executeScript(
    [
      'var want = new RegExp(arguments[0], "i");',
      'var wrapper = [].slice.call(document.querySelectorAll(".hand-card-wrapper"))',
      '  .filter(function (w) {',
      '    var n = w.querySelector(".card-name");',
      '    return n && want.test(n.textContent);',
      '  })[0];',
      'if (!wrapper) return null;',
      'var face = wrapper.querySelector(".card");',
      'var name = wrapper.querySelector(".card-name").textContent.trim();',
      'var castable = face.classList.contains("castable");',
      'face.scrollIntoView({ block: "center" });',
      'face.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));',
      'return { name: name, castable: castable };',
    ].join(''),
    pattern,
  );

/** Clicks a permanent on my own half. */
const clickMine = (row, pattern) =>
  d.executeScript(
    [
      'var row = arguments[0], want = arguments[1] ? new RegExp(arguments[1], "i") : null;',
      'var cards = [].slice.call(document.querySelectorAll(".self-field " + row + " app-card"));',
      'var hit = cards.filter(function (c) {',
      '  var n = c.querySelector(".card-name");',
      '  var tapped = c.querySelector(".card.tapped");',
      '  return (!want || (n && want.test(n.textContent))) && !tapped;',
      '})[0];',
      'if (!hit) return null;',
      'var name = hit.querySelector(".card-name") ? hit.querySelector(".card-name").textContent.trim() : "?";',
      'hit.querySelector(".card").click();',
      'return name;',
    ].join(''),
    row,
    pattern || null,
  );

/**
 * Answers whatever the game has stopped to ask, whatever kind it is.
 *
 * There is more than one: keeping an opening hand (CR 103.4), discarding down to seven at
 * cleanup (CR 514.1), dividing damage (CR 510.1c). The walk got stuck on the second because it
 * only knew about the first — so this presses the first option and, when the answer takes
 * several picks, keeps picking until Confirm goes live.
 */
async function answerAnyChoice() {
  const options = await read('return document.querySelectorAll(".action-btn.choice").length;');
  if (!options) {
    return null;
  }

  const answered = await d.executeScript(
    [
      'var opts = [].slice.call(document.querySelectorAll(".action-btn.choice"));',
      'if (!opts.length) return null;',
      'var label = opts[0].textContent.trim();',
      'opts[0].click();',
      'return label;',
    ].join(''),
  );
  await sleep(500);

  // A decision that takes more than one pick leaves a Confirm behind; keep picking until it
  // will accept the answer.
  for (let i = 0; i < 10; i++) {
    const confirm = await read(
      [
        'var b = [].slice.call(document.querySelectorAll(".status-actions .action-btn"))',
        '  .filter(function (x) { return /confirm/i.test(x.textContent); })[0];',
        'return b ? (b.disabled ? "disabled" : "ready") : null;',
      ].join(''),
    );
    if (confirm === null) break;
    if (confirm === 'ready') {
      await press('confirm');
      break;
    }
    await d.executeScript(
      'var o = document.querySelectorAll(".action-btn.choice"); if (o.length) o[0].click();',
    );
    await sleep(300);
  }

  await sleep(600);
  return answered;
}

/**
 * Bob's half of the game, driven until it is genuinely Alice's move.
 *
 * The first version gave up the moment Bob's copy of the view did not show him holding
 * priority, and his view lags the browser's — so the walk sat on "Waiting for opponent" while
 * Bob sat waiting to be told to pass. It retries before concluding the ball is in Alice's court.
 */
async function bobPlays(bob, opts) {
  let idle = 0;
  for (let i = 0; i < 80; i++) {
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
        await bob.attack((opts && opts.bobAttacks) || 0);
        await sleep(200);
        idle = 0;
        continue;
      }
      return 'alice';
    }

    if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
      if (v.activePlayerId !== bob.id) {
        await bob.block((opts && opts.bobBlocks) || 0);
        await sleep(200);
        idle = 0;
        continue;
      }
      return 'alice';
    }

    // He builds a board of his own, so combat has two sides.
    if (
      v.currentStep === 'PrecombatMain' &&
      v.activePlayerId === bob.id &&
      v.priorityPlayerId === bob.id
    ) {
      await bob.playLand(/Forest/);
      await bob.cast('Grizzly Bears', /Forest/, 2);
      await sleep(180);
    }

    if (v.priorityPlayerId === bob.id) {
      await bob.pass();
      await sleep(140);
      idle = 0;
      continue;
    }

    // Nothing for him this pass. Give the wire a moment before deciding it is Alice's move —
    // his view arrives after hers.
    if (++idle >= 3) {
      return 'alice';
    }
    await sleep(220);
  }
  return 'stuck';
}

/**
 * Runs the game until the board is in the state asked for, doing everything that is not the
 * thing being tested.
 *
 * One driver rather than a loop per section: the sections that stalled each had their own
 * slightly different loop, and the differences were the bugs.
 */
async function advance(bob, until, opts) {
  for (let i = 0; i < 400; i++) {
    const s = await boardState();
    if (until(s)) {
      return true;
    }

    if (await answerAnyChoice()) {
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
      // By default the driver declares nothing — it is getting the game somewhere, not playing
      // it. `opts.attack` makes it actually attack, which is what a damage division needs:
      // one attacker, blocked by two.
      if (opts && opts.attack && s.buttons.some((b) => /declare attackers/i.test(b))) {
        await d.executeScript(
          [
            'var hit = [].slice.call(document.querySelectorAll(".self-field .permanents-row app-card"))',
            '  .filter(function (c) { return !c.querySelector(".sick-overlay") && !c.querySelector(".card.tapped"); })[0];',
            'if (hit) hit.querySelector(".card").click();',
          ].join(''),
        );
        await sleep(400);
      }
      await press('confirm');
      await sleep(300);
      continue;
    }
    if (s.buttons.some((b) => /pass priority/i.test(b))) {
      await press('pass priority');
      await sleep(220);
      continue;
    }

    const where = await bobPlays(bob, opts);
    if (where === 'stuck') {
      console.log('    (driver: Bob is stuck) ' + JSON.stringify(s));
      return false;
    }
    await sleep(160);
  }
  console.log('    (driver: gave up after 400 passes) ' + JSON.stringify(await boardState()));
  return false;
}

/** Alice's own precombat main, with her holding priority — where a land may be played. */
const atMyMainPhase = (s) =>
  s.activePip === 'M1' &&
  /restart-check-a/i.test(s.turn || '') &&
  s.buttons.some((b) => /pass priority/i.test(b));

(async () => {
  console.log(NL + 'Setting the table...');
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  // Its own deck name, so it is built fresh rather than reusing whatever an earlier run left
  // under 'Played Game Red' — the walk needs a spell that targets in it.
  const deckA = await deckFor(tokenA, 'Walk Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Played Game Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;

  d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  let bob = null;

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(2500);
    bob = await seat(tokenB, gameId);

    // ---- The board itself --------------------------------------------------------------
    console.log(NL + '--- The board ---' + NL);
    let s = await boardState();
    check('the original board opens on a live game', !!s.turn, s.turn || '');
    check('the phase track says where the turn is', !!s.activePip, s.activePip || '');
    check('both players have a life total', s.life.length === 2, JSON.stringify(s.life));
    check('a hand is dealt', s.handCount === 7, s.handCount + ' cards');

    // ---- The opening decision ------------------------------------------------------------
    console.log(NL + '--- The opening decision (CR 103.4) ---' + NL);
    const asked = await advance(bob, (now) => /keep this hand/i.test(now.status || ''));
    check('the board asks, in the engine’s own words', asked, JSON.stringify((await boardState()).status));
    s = await boardState();
    check(
      'and offers Keep and Mulligan',
      s.buttons.some((b) => /keep/i.test(b)) && s.buttons.some((b) => /mulligan/i.test(b)),
      JSON.stringify(s.buttons),
    );
    check(
      'while a decision is open, nothing else is offered',
      !s.buttons.some((b) => /pass priority|declare/i.test(b)),
      JSON.stringify(s.buttons),
    );

    check('pressing Keep answers it', (await press('keep')) === 'Keep');
    await sleep(1200);
    s = await boardState();
    check('and the prompt clears', !/keep this hand/i.test(s.status || ''), JSON.stringify(s.status));

    // ---- My turn ---------------------------------------------------------------------------
    console.log(NL + '--- Playing a land (CR 305.1) ---' + NL);
    const arrived = await advance(bob, atMyMainPhase);
    check('the game reaches my own main phase', arrived);
    s = await boardState();
    check('the turn badge names me', /restart-check-a/i.test(s.turn || ''), s.turn || '');

    const landsBefore = s.myLands.length;
    check(
      'the hand marks what can actually be played',
      s.castable > 0,
      s.castable + ' of ' + s.handCount + ' castable',
    );

    const played = await playFromHand('Mountain');
    await sleep(1600);
    s = await boardState();
    check('double-clicking a land plays it', s.myLands.length > landsBefore, JSON.stringify(s.myLands));
    check('and it lands on the lands row, not with the creatures', !s.myCreatures.includes('Mountain'));
    check('the land drop is then spent (CR 305.2)', (await boardState()).castable < s.handCount);

    // ---- Mana ---------------------------------------------------------------------------------
    console.log(NL + '--- Mana (CR 106.4) ---' + NL);
    check('the pool starts empty', s.mana === 0, s.mana + ' pips');
    const tapped = await clickMine('.lands-row', 'Mountain');
    await sleep(1400);
    s = await boardState();
    check('tapping a land fills the pool', s.mana > 0, s.mana + ' pip(s), tapped ' + JSON.stringify(tapped));
    check(
      'and the land is drawn turned',
      await read('return !!document.querySelector(".self-field .lands-row .card.tapped");'),
    );

    // ---- The zones -----------------------------------------------------------------------------
    console.log(NL + '--- The zones (CR 404.2) ---' + NL);
    await d.executeScript(
      'document.querySelector(".self-sidebar .zone-row.grave").click();',
    );
    await sleep(900);
    const viewer = await read(
      [
        'var t = document.querySelector(".viewer-title");',
        'if (!t) return null;',
        'return { title: t.textContent.trim(), count: document.querySelector(".viewer-count").textContent.trim() };',
      ].join(''),
    );
    check('the graveyard opens from the sidebar', !!viewer, JSON.stringify(viewer));
    await d.executeScript('document.querySelector(".viewer-close").click();');
    await sleep(500);
    check('and closes', !(await read('return !!document.querySelector(".viewer-panel");')));

    // ---- Casting (CR 601.2) -------------------------------------------------------------------
    console.log(NL + '--- Casting a creature (CR 601.2) ---' + NL);

    // A Goblin Piker costs {1}{R}, so it takes a second land — one a turn (CR 305.2).
    for (let turn = 0; turn < 10; turn++) {
      if ((await boardState()).myLands.length >= 2) break;
      // Move off this main phase, then wait for the next one — one land a turn (CR 305.2).
      await press('pass priority');
      await sleep(250);
      if (!(await advance(bob, atMyMainPhase))) break;
      await playFromHand('Mountain');
      await sleep(1100);
    }
    s = await boardState();
    check('a second land goes down on a later turn', s.myLands.length >= 2, JSON.stringify(s.myLands));

    // Tap both, then cast.
    await clickMine('.lands-row', 'Mountain');
    await sleep(700);
    await clickMine('.lands-row', 'Mountain');
    await sleep(1000);
    s = await boardState();
    check('two lands give two mana', s.mana >= 2, s.mana + ' pips');

    const castable = await read(
      [
        'var goblin = [].slice.call(document.querySelectorAll(".hand-card-wrapper"))',
        '  .filter(function (w) { var n = w.querySelector(".card-name"); return n && /Goblin/.test(n.textContent); })[0];',
        'return goblin ? goblin.querySelector(".card").classList.contains("castable") : null;',
      ].join(''),
    );
    check('the hand marks the creature castable once the mana is there', castable === true);

    const creaturesBefore = s.myCreatures.length;
    await playFromHand('Goblin');
    await sleep(1400);
    s = await boardState();
    check('casting puts it on the stack (CR 601.2)', s.stack.length > 0, JSON.stringify(s.stack));

    await advance(bob, (now) => now.stack.length === 0);
    s = await boardState();
    check(
      'and it resolves onto the battlefield once both pass (CR 117.4)',
      s.myCreatures.length > creaturesBefore,
      JSON.stringify(s.myCreatures),
    );

    // ---- A refused action (CR 305.2) --------------------------------------------------------
    console.log(NL + '--- A refused action ---' + NL);

    // Playing a second land turns out not to reach the engine at all: the hand works out what
    // is castable, and with the drop spent the card simply does not respond. That is the right
    // behaviour — the board declines to send what it knows is illegal — so it is no test of
    // whether a refusal is visible.
    //
    // What a player does hit is clicking a land that is already tapped. The old engine let you
    // untap at will; the rules do not, and that control is still on the board.
    if (!(await advance(bob, atMyMainPhase))) {
      check('reached a main phase to try it in', false);
    } else {
      const beforeDrop = (await boardState()).myLands.length;
      await playFromHand('Mountain');
      await sleep(1200);
      const afterDrop = (await boardState()).myLands.length;
      check(
        'the board declines to play a second land at all (CR 305.2)',
        afterDrop === beforeDrop,
        beforeDrop + ' land(s), unchanged',
      );

      // Tap one, then click it again.
      await clickMine('.lands-row', 'Mountain');
      await sleep(900);
      await d.executeScript(
        [
          'var tapped = [].slice.call(document.querySelectorAll(".self-field .lands-row app-card"))',
          '  .filter(function (c) { return c.querySelector(".card.tapped"); })[0];',
          'if (tapped) tapped.querySelector(".card").click();',
        ].join(''),
      );
      await sleep(1000);
      s = await boardState();
      check(
        'clicking an already-tapped land explains itself rather than doing nothing',
        s.toasts.some((t) => /untapped at will/i.test(t)),
        JSON.stringify(s.toasts),
      );
      check(
        'and it quotes the rule',
        s.toasts.some((t) => /CR [0-9]/.test(t)),
        JSON.stringify(s.toasts),
      );
    }

    // ---- Combat (CR 508.1) ---------------------------------------------------------------------
    console.log(NL + '--- Declaring attackers (CR 508.1) ---' + NL);

    // A creature cannot attack the turn it arrives (CR 302.6), so this waits for a combat
    // where there is one that can.
    const atCombat = await advance(
      bob,
      (now) => now.buttons.some((b) => /declare attackers/i.test(b)) && now.readyCreatures > 0,
    );
    check('the game reaches my declare-attackers step', atCombat);

    if (atCombat) {
      check('the board offers Declare Attackers', (await press('declare attackers')) !== null);
      await sleep(700);
      s = await boardState();
      check(
        'and says what it is waiting for',
        /select creatures/i.test(s.status || ''),
        JSON.stringify(s.status),
      );

      const chosen = await d.executeScript(
        [
          'var hit = [].slice.call(document.querySelectorAll(".self-field .permanents-row app-card"))',
          '  .filter(function (c) { return !c.querySelector(".sick-overlay") && !c.querySelector(".card.tapped"); })[0];',
          'if (!hit) return null;',
          'var n = hit.querySelector(".card-name");',
          'hit.querySelector(".card").click();',
          'return n ? n.textContent.trim() : "?";',
        ].join(''),
      );
      await sleep(700);
      s = await boardState();
      check('tapping a creature chooses it as an attacker', !!chosen, JSON.stringify(chosen));
      check(
        'and the bar counts it',
        s.buttons.some((b) => /confirm \(1\)/i.test(b)),
        JSON.stringify(s.buttons),
      );

      await press('confirm');
      await sleep(1600);
      s = await boardState();
      check(
        'confirming declares the attack',
        !s.buttons.some((b) => /confirm/i.test(b)),
        JSON.stringify(s.status),
      );

      const theirLifeBefore = Number(s.life[0]);
      await advance(bob, (now) => Number(now.life[0]) < theirLifeBefore, { bobBlocks: 0 });
      s = await boardState();
      check(
        'unblocked damage comes off their life (CR 510.1c)',
        Number(s.life[0]) < theirLifeBefore,
        theirLifeBefore + ' -> ' + s.life[0],
      );
    }

    // ---- Blocking (CR 509.1) -----------------------------------------------------------------
    console.log(NL + '--- Declaring blockers (CR 509.1) ---' + NL);

    // Bob attacks now, and Alice needs something untapped to block with. This is the other half
    // of the reducer fix — confirmBlockers$ reads its assignments out of the store the same way
    // confirmAttackers$ does.
    const atBlockers = await advance(
      bob,
      (now) => now.buttons.some((b) => /declare blockers/i.test(b)) && now.readyCreatures > 0,
      { bobAttacks: 1 },
    );
    check('the game reaches my declare-blockers step', atBlockers);

    if (atBlockers) {
      s = await boardState();
      check(
        'there is an attacker to block',
        s.theirCreatures.length > 0,
        JSON.stringify(s.theirCreatures),
      );
      check('the board offers Declare Blockers', (await press('declare blockers')) !== null);
      await sleep(700);
      s = await boardState();
      check('and says what it is waiting for', /block/i.test(s.status || ''), JSON.stringify(s.status));

      // A block is two taps: the attacker, then the creature blocking it.
      const assigned = await d.executeScript(
        [
          'var attacker = document.querySelector(".opponent-field .permanents-row app-card");',
          'if (!attacker) return null;',
          'attacker.querySelector(".card").click();',
          'var mine = [].slice.call(document.querySelectorAll(".self-field .permanents-row app-card"))',
          '  .filter(function (c) { return !c.querySelector(".card.tapped"); })[0];',
          'if (!mine) return null;',
          'mine.querySelector(".card").click();',
          'return mine.querySelector(".card-name").textContent.trim();',
        ].join(''),
      );
      await sleep(900);
      // Strictly a creature name: the sentinel string this used to return was truthy, so the
      // check passed while nothing had been assigned at all — and the damage check below then
      // passed for the wrong reason too.
      check(
        'a creature can be assigned to the attacker',
        typeof assigned === 'string' && /[A-Za-z]/.test(assigned) && !/nothing/i.test(assigned),
        JSON.stringify(assigned),
      );

      const myLifeBefore = Number((await boardState()).life[1]);
      await press('confirm');
      await sleep(1700);
      s = await boardState();
      check(
        'confirming declares the block',
        !s.buttons.some((b) => /confirm/i.test(b)),
        JSON.stringify(s.status),
      );

      await advance(bob, (now) => !/block/i.test(now.status || ''), { bobAttacks: 1 });
      s = await boardState();
      check(
        'a blocked attacker deals me no damage (CR 509.1a)',
        Number(s.life[1]) === myLifeBefore,
        myLifeBefore + ' -> ' + s.life[1],
      );
    }

    // ---- Targeting (CR 601.2c) -----------------------------------------------------------------
    console.log(NL + '--- Casting a spell that targets (CR 601.2c) ---' + NL);

    if (!(await advance(bob, (now) => atMyMainPhase(now) && now.hand.some((n) => /Bolt/i.test(n))))) {
      check('reached a main phase holding a spell that targets', false);
    } else {
      // Enough mana for it, then cast.
      await d.executeScript(
        [
          'var lands = [].slice.call(document.querySelectorAll(".self-field .lands-row app-card"));',
          'lands.filter(function (c) { return !c.querySelector(".card.tapped"); })',
          '  .slice(0, 2).forEach(function (c) { c.querySelector(".card").click(); });',
        ].join(''),
      );
      await sleep(1200);

      const bolt = await playFromHand('Bolt');
      await sleep(900);
      s = await boardState();
      check(
        'the Bolt is castable when it is double-clicked',
        !!bolt && bolt.castable === true,
        JSON.stringify(bolt) + ' pool=' + s.mana,
      );
      check('a spell that targets stops to ask', /choose a target/i.test(s.status || ''), JSON.stringify(s.status));
      check(
        'and offers the players as targets',
        s.buttons.some((b) => /restart-check-b/i.test(b)) && s.buttons.some((b) => /^You$/i.test(b)),
        JSON.stringify(s.buttons),
      );

      const theirLifeBefore = Number(s.life[0]);
      await press('restart-check-b');
      await sleep(1300);
      s = await boardState();
      check('picking a target casts it', s.stack.length > 0 || Number(s.life[0]) < theirLifeBefore, JSON.stringify(s.stack));

      await advance(bob, (now) => now.stack.length === 0);
      s = await boardState();
      check(
        'and it resolves, dealing its damage (CR 608.2)',
        Number(s.life[0]) < theirLifeBefore,
        theirLifeBefore + ' -> ' + s.life[0],
      );
    }

    // ---- Dividing damage (CR 510.1c) -----------------------------------------------------------
    console.log(NL + '--- Dividing combat damage (CR 510.1c) ---' + NL);

    // One attacker blocked by two: the engine stops and asks the attacking player how to divide
    // the damage, a point at a time. It is the one decision where the same option is picked
    // repeatedly, so it is the one most likely to be wired wrong.
    const divides = await advance(
      bob,
      (now) => /divide/i.test(now.status || '') || now.buttons.some((b) => /confirm/i.test(b) && /divide/i.test(now.status || '')),
      { bobBlocks: 2, bobAttacks: 0, attack: true },
    );

    if (!divides) {
      check('the engine asks how to divide damage among blockers', false, 'never reached');
    } else {
      s = await boardState();
      check('the engine asks how to divide damage among blockers', /divide/i.test(s.status || ''), JSON.stringify(s.status));
      check(
        'and says how much is left to assign',
        /left to assign/i.test(s.status || ''),
        JSON.stringify(s.status),
      );
      check(
        'it offers the blockers to assign it to',
        s.buttons.filter((b) => !/confirm|start over|concede/i.test(b)).length >= 2,
        JSON.stringify(s.buttons),
      );

      // Assign every point to the first blocker, then confirm.
      const before = s.status;
      await d.executeScript('document.querySelectorAll(".action-btn.choice")[0].click();');
      await sleep(500);
      s = await boardState();
      check('assigning a point counts down', s.status !== before, JSON.stringify(s.status));

      for (let i = 0; i < 8; i++) {
        const now = await boardState();
        const confirm = await read(
          [
            'var b = [].slice.call(document.querySelectorAll(".status-actions .action-btn"))',
            '  .filter(function (x) { return /confirm/i.test(x.textContent); })[0];',
            'return b ? (b.disabled ? "disabled" : "ready") : null;',
          ].join(''),
        );
        if (confirm === 'ready') break;
        await d.executeScript('var o = document.querySelectorAll(".action-btn.choice"); if (o.length) o[0].click();');
        await sleep(350);
      }
      check(
        'Confirm goes live once every point is assigned',
        (await read(
          [
            'var b = [].slice.call(document.querySelectorAll(".status-actions .action-btn"))',
            '  .filter(function (x) { return /confirm/i.test(x.textContent); })[0];',
            'return b ? !b.disabled : false;',
          ].join(''),
        )) === true,
      );

      await press('confirm');
      await sleep(1600);
      s = await boardState();
      check('answering it clears the question', !/divide/i.test(s.status || ''), JSON.stringify(s.status));
    }

    // ---- Conceding (CR 104.3a) ----------------------------------------------------------------
    console.log(NL + '--- Conceding (CR 104.3a) ---' + NL);

    // The one action with no timing attached: a player may concede at any point, whoever holds
    // priority. It was a dead button until the engine learned how.
    check(
      'Concede is offered whatever else is happening',
      (await boardState()).buttons.some((b) => /concede/i.test(b)),
    );

    await press('concede');
    await sleep(700);
    const dialog = await read(
      'var t = document.querySelector(".concede-title"); return t ? t.textContent.trim() : null;',
    );
    check('it asks before doing it', !!dialog, JSON.stringify(dialog));

    await d.executeScript(
      '[].slice.call(document.querySelectorAll(".concede-dialog .action-btn")).filter(function (b) { return /cancel/i.test(b.textContent); })[0].click();',
    );
    await sleep(500);
    check(
      'cancelling keeps you in the game',
      !(await read('return !!document.querySelector(".concede-dialog");')),
    );

    await press('concede');
    await sleep(600);
    await d.executeScript(
      '[].slice.call(document.querySelectorAll(".concede-dialog .action-btn")).filter(function (b) { return /concede/i.test(b.textContent); }).pop().click();',
    );
    await sleep(2200);

    // The engine records the loss and ends the game; the board's own effect sends you home.
    const conceded = await api(tokenA, 'GET', '/api/games/' + gameId);
    const me = conceded.players.filter((p) => p.playerId === conceded.viewer)[0];
    check('conceding is recorded as a loss', me.hasLost === true, JSON.stringify(me.hasLost));
    check(
      'and the other player is left standing',
      conceded.players.filter((p) => !p.hasLost).length === 1,
      JSON.stringify(conceded.players.map((p) => p.name + (p.hasLost ? ' (lost)' : ' (in)'))),
    );

    console.log(NL + '  board: ' + JSON.stringify(await boardState()) + NL);
    console.log('  game ' + gameId + NL);
    if (WATCHING) await sleep(6000);
  } finally {
    if (bob) await bob.stop();
    await d.quit();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(NL + results.length + ' checks, ' + failed.length + ' failed' + NL);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
