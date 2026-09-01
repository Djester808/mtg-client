// Presses every control on the restored board, in a browser, and says what each one did.
//
//   HEADLESS=false node _walk-the-board.js
//
// The browser is Alice and does what a player does — signs in through the form, walks into the
// game through the lobby, and works the board. Bob is a second seat on the wire, because a
// second player cannot share the browser. Every check prints PASS or FAIL with what was
// actually observed, so the log can be held against the window.
const NL = String.fromCharCode(10);
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const {
  sleep,
  api,
  signIn,
  deckFor,
  signInThroughTheForm,
  seat,
} = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);
const WATCHING = process.env.HEADLESS === 'false';
const BEAT = WATCHING ? 700 : 90;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(
    '  ' + (ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(50) + (detail === undefined ? '' : detail),
  );
};

let d;
const read = (script) => d.executeScript('return (function(){' + script + '})();');

const click = (selector) =>
  d.executeScript(
    [
      'var el = document.querySelector(arguments[0]);',
      'if (!el) return false;',
      'el.scrollIntoView({ block: "center" });',
      'el.click();',
      'return true;',
    ].join(''),
    selector,
  );

const hold = (selector, ms) =>
  d.executeAsyncScript(
    [
      'var selector = arguments[0], ms = arguments[1], done = arguments[2];',
      'var el = document.querySelector(selector);',
      'if (!el) return done(false);',
      'el.scrollIntoView({ block: "center" });',
      'el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));',
      'setTimeout(function () {',
      '  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));',
      '  done(true);',
      '}, ms);',
    ].join(''),
    selector,
    ms || 600,
  );

// My own half of the battlefield. `app-zones:last-of-type` looks like it means "the lower
// one" and does not: :last-of-type is scoped to each element's own parent, and the two halves
// live in different parents, so it matched both — the walk tapped the opponent's Forest for
// mana and then wondered why no mana appeared.
const MINE = 'document.querySelectorAll("app-zones")[1]';

const clickInMine = (selector) =>
  d.executeScript(
    [
      'var half = ' + MINE + ';',
      'if (!half) return false;',
      'var el = half.querySelector(arguments[0]);',
      'if (!el) return false;',
      'el.scrollIntoView({ block: "center" });',
      'el.click();',
      'return true;',
    ].join(''),
    selector,
  );

const holdInMine = (selector, ms) =>
  d.executeAsyncScript(
    [
      'var selector = arguments[0], ms = arguments[1], done = arguments[2];',
      'var half = ' + MINE + ';',
      'var el = half && half.querySelector(selector);',
      'if (!el) return done(false);',
      'el.scrollIntoView({ block: "center" });',
      'el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));',
      'setTimeout(function () {',
      '  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));',
      '  done(true);',
      '}, ms);',
    ].join(''),
    selector,
    ms || 600,
  );

/** What the board says right now, read off the DOM rather than assumed. */
const boardState = () =>
  read(
    [
      'var text = function (s) { var el = document.querySelector(s); return el ? el.textContent.trim() : null; };',
      'var all = function (s) { return [].slice.call(document.querySelectorAll(s)).map(function (n) { return n.textContent.trim(); }); };',
      'var halves = document.querySelectorAll("app-zones");',
      'var names = function (half, row) {',
      '  return half ? [].slice.call(half.querySelectorAll(row + " .card-name")).map(function (n) { return n.textContent.trim(); }) : [];',
      '};',
      'return {',
      '  status: text(".status-message"),',
      '  priority: text("app-priority-indicator .label"),',
      '  turn: text(".turn-badge"),',
      '  choice: text(".gb-prompt .gb-prompt-text"),',
      '  choiceOptions: all(".gb-prompt .gb-btn"),',
      '  passOffered: !!document.querySelector(".status-actions .action-btn.pass"),',
      '  combatBtn: text(".status-actions .action-btn.combat"),',
      '  theirCreatures: names(halves[0], ".permanents-row"),',
      '  theirLands: names(halves[0], ".lands-row"),',
      '  myCreatures: names(halves[1], ".permanents-row"),',
      '  myLands: names(halves[1], ".lands-row"),',
      '  hand: all("app-hand .card-name"),',
      '  manaPips: all(".self-sidebar .mana-pip"),',
      '  myLife: text(".self-sidebar .life-number"),',
      '  theirLife: text(".opponent-sidebar .life-number"),',
      '  graveCount: text(".self-sidebar .zone-row.grave .zone-num"),',
      '  stack: all("app-stack .stack-item-name"),',
      '  arrows: document.querySelectorAll("app-attack-arrows path").length,',
      '  refusal: text(".gb-refusal"),',
      '};',
    ].join(''),
  );

/** Presses one of the options the board is offering, preferring one whose label matches. */
const answerOnScreen = (prefer) =>
  d.executeScript(
    [
      'var want = arguments[0];',
      'var opts = [].slice.call(document.querySelectorAll(".gb-prompt .gb-btn"));',
      'if (!opts.length) return null;',
      'var wanted = want ? opts.filter(function (b) { return new RegExp(want, "i").test(b.textContent); })[0] : null;',
      'var chosen = wanted || opts[0];',
      'var label = chosen.textContent.trim();',
      'chosen.click();',
      'return label;',
    ].join(''),
    prefer || null,
  );

/**
 * Moves the game along without touching anything that is Alice's to do.
 *
 * Bob answers his own decisions and passes his own priority; when the board is waiting on
 * Alice this returns and lets the walk press the control being tested. Everything the browser
 * is meant to exercise stays the browser's.
 */
async function nudge(bob, opts) {
  const passForAlice = !opts || opts.passForAlice !== false;
  for (let i = 0; i < 60; i++) {
    const v = await bob.refresh();

    if (v.choice) {
      if (v.choice.playerId === bob.id) {
        await bob.answerChoice();
        await sleep(220);
        continue;
      }
      return 'alice-choice';
    }

    if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
      if (v.activePlayerId === bob.id) {
        await bob.attack(opts && opts.bobAttacks ? opts.bobAttacks : 0);
        await sleep(250);
        continue;
      }
      return 'alice-attackers';
    }

    if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
      if (v.activePlayerId !== bob.id) {
        await bob.block(opts && opts.bobBlocks ? opts.bobBlocks : 0);
        await sleep(250);
        continue;
      }
      return 'alice-blockers';
    }

    // Bob builds a board of his own when it is his turn, so there is something to block with
    // and something to be attacked by. Without it he sat there passing and combat never had
    // two sides.
    if (
      v.currentStep === 'PrecombatMain' &&
      v.activePlayerId === bob.id &&
      v.priorityPlayerId === bob.id
    ) {
      await bob.playLand(/Forest|Mountain|Island|Swamp|Plains/);
      await bob.cast('Grizzly Bears', /Forest/, 2);
      await sleep(200);
    }

    if (v.priorityPlayerId === bob.id) {
      await bob.pass();
      await sleep(180);
      continue;
    }

    if (v.priorityPlayerId && v.priorityPlayerId !== bob.id) {
      if (opts && opts.stopWhenAliceCanAct) return 'alice-priority';
      if (!passForAlice) return 'alice-priority';
      await click('.status-actions .action-btn.pass');
      await sleep(220);
      continue;
    }

    await sleep(180);
  }
  return 'stuck';
}

/**
 * Runs the game on until Alice is the active player in the step named, with priority.
 *
 * Alice's priority is passed *here* rather than inside nudge(), because nudge() cannot know
 * which window the walk wants to stop in — left to itself it passed straight through her own
 * main phase forty times and the game reached turn 41 with nothing played.
 */
async function aliceReaches(bob, stepLabel) {
  for (let i = 0; i < 200; i++) {
    // Steered by what Alice sees, not by Bob's copy of the view. Bob's lags behind the
    // browser's, and a loop that trusted it clicked Pass on windows Alice did not hold —
    // earning "You do not have priority (CR 117.1)" — and rode straight past her main phase.
    const s = await boardState();

    if (s.choice && s.choiceOptions.length) {
      await answerOnScreen();
      await sleep(450);
      continue;
    }

    // "Main phase — your move" is also true during the *opponent's* main phase, where you hold
    // priority to respond. A land needs your own main phase (CR 505.6b), so the turn badge has
    // to agree — the engine refused the land and was right to, and this loop was what was wrong.
    if (
      new RegExp(stepLabel, 'i').test(s.status || '') &&
      /your move/i.test(s.status || '') &&
      /your turn/i.test(s.turn || '')
    ) {
      return true;
    }

    if (s.combatBtn) {
      await click('.status-actions .action-btn.combat');
      await sleep(450);
      continue;
    }

    if (s.passOffered) {
      await click('.status-actions .action-btn.pass');
      await sleep(280);
      continue;
    }

    const where = await nudge(bob, { stopWhenAliceCanAct: true });
    if (where === 'stuck') {
      return false;
    }
    await sleep(180);
  }
  return false;
}

/**
 * Runs the game on until the board is asking Alice for attackers or blockers.
 *
 * Combat declarations are a turn-based action taken before anybody has priority (CR 508.1,
 * 509.1), so this waits for the button rather than for a priority window.
 */
async function aliceReachesCombat(bob, stepLabel, opts) {
  for (let i = 0; i < 200; i++) {
    const s = await boardState();

    if (s.combatBtn && new RegExp(stepLabel, 'i').test(s.status || '')) {
      return true;
    }

    if (s.choice && s.choiceOptions.length) {
      await answerOnScreen();
      await sleep(400);
      continue;
    }

    if (s.combatBtn) {
      await click('.status-actions .action-btn.combat');
      await sleep(400);
      continue;
    }

    if (s.passOffered) {
      await click('.status-actions .action-btn.pass');
      await sleep(260);
      continue;
    }

    const where = await nudge(bob, Object.assign({ stopWhenAliceCanAct: true }, opts || {}));
    if (where === 'stuck') {
      return false;
    }
    await sleep(180);
  }
  return false;
}

/**
 * Gets a creature onto Alice's side and keeps it there long enough to attack.
 *
 * The walk reached declare-attackers with an empty battlefield the first time — the one
 * creature she had cast had already died in combat — and then "tap a creature to attack with
 * it" was testing nothing. A creature also cannot attack the turn it arrives (CR 302.6), so
 * this waits a turn after casting.
 */
const aliceHasAReadyCreature = () =>
  read(
    [
      'var mine = document.querySelectorAll("app-zones")[1];',
      'if (!mine) return false;',
      'return [].slice.call(mine.querySelectorAll(".permanents-row app-card")).some(function (c) {',
      '  var face = c.querySelector(".card");',
      '  return face && !face.querySelector(".sick-overlay") && !c.classList.contains("is-tapped");',
      '});',
    ].join(''),
  );

async function ensureAliceHasACreature(bob) {
  for (let round = 0; round < 10; round++) {
    let s = await boardState();
    // Ready, not merely present: a creature cannot attack the turn it arrives (CR 302.6), and
    // the walk previously cast one and attacked with it in the same turn — the engine refused
    // and was right to.
    if (s.myCreatures.length > 0 && (await aliceHasAReadyCreature())) {
      return true;
    }

    if (!(await aliceReaches(bob, 'Main phase'))) return false;

    // A land if the drop is unspent, then every untapped land tapped for mana.
    await d.executeScript(
      [
        'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
        'var land = cards.filter(function (w) {',
        '  var n = w.querySelector(".card-name");',
        '  return n && /Mountain|Forest|Island|Swamp|Plains/.test(n.textContent);',
        '})[0];',
        'if (land) land.querySelector(".card").click();',
      ].join(''),
    );
    await sleep(350);
    await click('.status-actions .action-btn.play');
    await sleep(900);

    await d.executeScript(
      [
        'var lands = [].slice.call(document.querySelectorAll("app-zones")[1].querySelectorAll(".lands-row app-card"));',
        'lands.filter(function (c) { return !c.classList.contains("is-tapped"); })',
        '     .forEach(function (c) { c.querySelector(".card").click(); });',
      ].join(''),
    );
    await sleep(1200);

    const cast = await d.executeScript(
      [
        'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
        'var pick = cards.filter(function (w) {',
        '  var n = w.querySelector(".card-name");',
        '  return n && /Goblin|Bears|Creature/i.test(n.textContent);',
        '})[0];',
        'if (!pick) return null;',
        'pick.querySelector(".card").click();',
        'return pick.querySelector(".card-name").textContent.trim();',
      ].join(''),
    );
    if (cast) {
      await sleep(400);
      await click('.status-actions .action-btn.play');
      await sleep(1200);
      // Let it resolve.
      for (let i = 0; i < 6 && (await boardState()).stack.length > 0; i++) {
        const now = await boardState();
        if (now.passOffered) await click('.status-actions .action-btn.pass');
        await nudge(bob, { stopWhenAliceCanAct: true });
        await sleep(500);
      }
    }

    // Move a turn on, so anything cast this turn settles and can attack next time round.
    if ((await boardState()).passOffered) await click('.status-actions .action-btn.pass');
    await nudge(bob, { stopWhenAliceCanAct: true });
    await sleep(400);
  }
  return false;
}

(async () => {
  console.log(NL + 'Setting the table...');
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  await deckFor(tokenA, 'Played Game Red', DECK_A);
  await deckFor(tokenB, 'Played Game Green', DECK_B);

  d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  let bob = null;

  try {
    console.log(NL + '--- The way in ---' + NL);
    await signInThroughTheForm(d, { By, until }, A);
    check('sign in through the form', !(await d.getCurrentUrl()).includes('/login'));

    await click('a[href="/play"]');
    await d.wait(until.elementLocated(By.css('.gl-page')), 15000);
    await sleep(BEAT);
    check('Play in the nav reaches the lobby', (await d.getCurrentUrl()).indexOf('/play') > 0);

    const lobby = await read(
      [
        'var opts = function (name) {',
        '  return [].slice.call(document.querySelectorAll("select[name=\\"" + name + "\\"] option"))',
        '    .slice(1).map(function (o) { return { value: o.value, label: o.textContent.trim() }; });',
        '};',
        'return { decks: opts("myDeck"), opponents: opts("opponent") };',
      ].join(''),
    );
    check(
      'the lobby offers decks and opponents',
      lobby.decks.length > 0 && lobby.opponents.length > 0,
      lobby.decks.length + ' deck(s), ' + lobby.opponents.length + ' opponent(s)',
    );
    check(
      'every opponent option carries a user id',
      lobby.opponents.every((o) => o.value && o.value !== 'undefined'),
    );

    const myDeck = lobby.decks.filter((x) => /Red/.test(x.label))[0] || lobby.decks[0];
    const theOpponent = lobby.opponents.filter((o) => o.label === B.username)[0];

    await d.executeScript(
      [
        'var pick = function (name, value) {',
        '  var sel = document.querySelector("select[name=\\"" + name + "\\"]");',
        '  sel.value = value;',
        '  sel.dispatchEvent(new Event("change", { bubbles: true }));',
        '};',
        'pick("myDeck", arguments[0]);',
        'pick("opponent", arguments[1]);',
      ].join(''),
      myDeck.value,
      theOpponent.value,
    );
    await sleep(BEAT);

    const canInvite = await read(
      [
        'var b = [].slice.call(document.querySelectorAll(".gl-btn-primary"))',
        '  .filter(function (x) { return /invitation/i.test(x.textContent); })[0];',
        'return b ? !b.disabled : null;',
      ].join(''),
    );
    check('Send invitation enables once both are chosen', canInvite === true);

    await d.executeScript(
      [
        '[].slice.call(document.querySelectorAll(".gl-btn-primary"))',
        '  .filter(function (x) { return /invitation/i.test(x.textContent); })[0].click();',
      ].join(''),
    );
    await sleep(1600);
    check(
      'the invitation is sent and listed',
      (await read('return document.querySelectorAll(".gl-invite").length;')) > 0,
    );

    const invites = await api(tokenB, 'GET', '/api/games/invites');
    const decksB = await api(tokenB, 'GET', '/api/games/decks');
    const deckB = decksB.filter((x) => /Green/.test(x.name))[0];
    const gameId = (
      await api(tokenB, 'POST', '/api/games/invites/' + invites[0].id + '/accept', {
        deckId: deckB.id,
      })
    ).gameId;
    check('the opponent can accept it', !!gameId, gameId);

    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(1600);
    check('the board opens', true);

    bob = await seat(tokenB, gameId);

    // ---- The opening decision -------------------------------------------------------------
    console.log(NL + '--- The opening decision (CR 103.4) ---' + NL);
    const waitingText = (await boardState()).status;
    check(
      'while the other player decides, the board says so',
      /waiting/i.test(waitingText || ''),
      JSON.stringify(waitingText),
    );

    const where = await nudge(bob, { stopWhenAliceCanAct: true });
    check('the game reaches a decision that is mine', where === 'alice-choice', where);
    await sleep(600);

    let s = await boardState();
    check('the decision is asked in words', !!s.choice, JSON.stringify(s.choice));
    check(
      'it offers Keep and Mulligan',
      s.choiceOptions.length >= 2,
      JSON.stringify(s.choiceOptions),
    );

    const kept = await answerOnScreen('keep');
    check('a single-pick decision submits on the tap', !!kept, 'pressed ' + JSON.stringify(kept));
    await sleep(1500);
    await nudge(bob, { stopWhenAliceCanAct: true });
    await sleep(900);

    s = await boardState();
    check('answering clears the prompt', !s.choice, s.status || '');
    check('a hand is dealt', s.hand.length > 0, s.hand.length + ' cards');
    check('life totals show for both players', s.myLife === '20' && s.theirLife === '20');
    check('the turn badge names the active player', !!s.turn, s.turn || '');

    // ---- Getting to my own main phase -------------------------------------------------------
    console.log(NL + '--- My turn ---' + NL);
    const arrived = await aliceReaches(bob, 'Main phase');
    check('the game reaches my own main phase', arrived);
    s = await boardState();
    check('the status bar says it is my move', /your move/i.test(s.status || ''), s.status || '');
    check('Pass Priority is offered when it is mine to pass', s.passOffered);

    // ---- Playing a land ---------------------------------------------------------------------
    console.log(NL + '--- Playing a land (CR 305.1) ---' + NL);
    const landsBefore = s.myLands.length;
    const handBefore = s.hand.length;
    const picked = await d.executeScript(
      [
        'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
        'var land = cards.filter(function (w) {',
        '  var n = w.querySelector(".card-name");',
        '  return n && /Mountain/.test(n.textContent);',
        '})[0];',
        'if (!land) return null;',
        'var face = land.querySelector(".card");',
        'face.scrollIntoView({ block: "center" });',
        'face.click();',
        'return land.querySelector(".card-name").textContent.trim();',
      ].join(''),
    );
    await sleep(600);
    check('a card in hand can be selected', !!picked, 'selected ' + JSON.stringify(picked));
    const selectedLooks = await read('return !!document.querySelector("app-hand .card.selected");');
    check('the selected card is marked as selected', selectedLooks);

    const playAffordance = await read(
      [
        'var btn = document.querySelector(".status-actions .action-btn.play");',
        'return btn ? btn.textContent.trim() : null;',
      ].join(''),
    );
    check(
      'a selected card offers a way to play it',
      !!playAffordance,
      playAffordance === null ? 'nothing on screen says how to play it' : playAffordance,
    );

    await click('.status-actions .action-btn.play');
    await sleep(1600);
    s = await boardState();
    check(
      'the land goes to the battlefield',
      s.myLands.length > landsBefore,
      s.myLands.length + ' land(s): ' + JSON.stringify(s.myLands),
    );
    check(
      'it lands on the lands row, not with the creatures',
      s.myCreatures.indexOf('Mountain') < 0,
    );
    check(
      'and leaves the hand',
      s.hand.length === handBefore - 1,
      handBefore + ' -> ' + s.hand.length,
    );

    // One land a turn (CR 305.2). The second attempt should be refused, in words.
    const landsNow = s.myLands.length;
    await d.executeScript(
      [
        'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
        'var land = cards.filter(function (w) {',
        '  var n = w.querySelector(".card-name");',
        '  return n && /Mountain/.test(n.textContent);',
        '})[0];',
        'if (land) land.querySelector(".card").click();',
      ].join(''),
    );
    await sleep(500);
    await click('.status-actions .action-btn.play');
    await sleep(1400);
    s = await boardState();
    check(
      'a second land in the same turn is refused (CR 305.2)',
      s.myLands.length === landsNow,
      s.myLands.length + ' land(s), unchanged',
    );
    check(
      'and the refusal says why, in words',
      !!s.refusal && /land/i.test(s.refusal),
      JSON.stringify(s.refusal),
    );
    await click('.gb-refusal');
    await sleep(400);
    check(
      'the refusal can be dismissed',
      !(await read('return !!document.querySelector(".gb-refusal");')),
    );

    // ---- Mana ------------------------------------------------------------------------------
    console.log(NL + '--- Mana (CR 106.4) ---' + NL);
    check('the pool starts empty', s.manaPips.length === 0);
    await clickInMine('.lands-row app-card .card');
    await sleep(1300);
    s = await boardState();
    check(
      'tapping a land puts mana in the pool',
      s.manaPips.length > 0,
      JSON.stringify(s.manaPips),
    );
    check(
      'and the land is drawn turned',
      await read(
        'return !!document.querySelectorAll("app-zones")[1].querySelector(".lands-row app-card.is-tapped");',
      ),
    );

    // ---- Reading a card ----------------------------------------------------------------------
    console.log(NL + '--- Reading a card ---' + NL);
    await holdInMine('.lands-row app-card .card', 700);
    await sleep(1000);
    let preview = await read(
      [
        'var p = document.querySelector(".card-preview-panel");',
        'if (!p) return null;',
        'var r = p.getBoundingClientRect();',
        'var n = document.querySelector(".ps-name");',
        'return { name: n ? n.textContent.trim() : null, w: Math.round(r.width), h: Math.round(r.height),',
        '         left: Math.round(r.left), top: Math.round(r.top) };',
      ].join(''),
    );
    check('holding a permanent floats the card', !!preview, JSON.stringify(preview));

    if (preview) {
      await d.executeScript(
        [
          'var p = document.querySelector(".card-preview-panel");',
          'p.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }));',
          'document.dispatchEvent(new PointerEvent("pointermove", { clientX: 380, clientY: 250, bubbles: true }));',
          'document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));',
        ].join(''),
      );
      await sleep(600);
      const moved = await read(
        [
          'var r = document.querySelector(".card-preview-panel").getBoundingClientRect();',
          'return { left: Math.round(r.left), top: Math.round(r.top) };',
        ].join(''),
      );
      check(
        'the floating card can be dragged',
        moved.left === preview.left + 80 && moved.top === preview.top - 50,
        JSON.stringify(preview.left + ',' + preview.top) +
          ' -> ' +
          JSON.stringify(moved.left + ',' + moved.top),
      );

      await d.executeScript(
        [
          'var h = document.querySelector(".card-preview-panel .rh.se");',
          'h.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));',
          'document.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 90, bubbles: true }));',
          'document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));',
        ].join(''),
      );
      await sleep(600);
      const resized = await read(
        [
          'var r = document.querySelector(".card-preview-panel").getBoundingClientRect();',
          'return { w: Math.round(r.width), h: Math.round(r.height) };',
        ].join(''),
      );
      check(
        'and resized, keeping a card’s shape',
        resized.w > preview.w && Math.abs(resized.w / resized.h - preview.w / preview.h) < 0.05,
        preview.w + 'x' + preview.h + ' -> ' + resized.w + 'x' + resized.h,
      );

      await click('.card-preview-panel .preview-close-btn');
      await sleep(500);
      check('and closed', !(await read('return !!document.querySelector(".card-preview-panel");')));
    }

    // ---- The zones -----------------------------------------------------------------------------
    console.log(NL + '--- The zones (CR 404.2) ---' + NL);
    await click('.self-sidebar button.zone-row.grave');
    await sleep(900);
    let viewer = await read(
      [
        'var t = document.querySelector(".viewer-title");',
        'if (!t) return null;',
        'return { title: t.textContent.trim(),',
        '         count: document.querySelector(".viewer-count").textContent.trim(),',
        '         cards: [].slice.call(document.querySelectorAll(".viewer-card-name")).map(function (n) { return n.textContent.trim(); }) };',
      ].join(''),
    );
    check('my graveyard opens and names itself', !!viewer, JSON.stringify(viewer));
    await click('.viewer-close');
    await sleep(500);
    check('and closes', !(await read('return !!document.querySelector(".viewer-panel");')));

    await click('.opponent-sidebar button.zone-row.grave');
    await sleep(900);
    viewer = await read(
      'var t = document.querySelector(".viewer-title"); return t ? t.textContent.trim() : null;',
    );
    check(
      "the opponent's graveyard opens too, named as theirs",
      !!viewer && /restart-check-b/i.test(viewer),
      JSON.stringify(viewer),
    );
    await click('.viewer-close');
    await sleep(400);

    await click('.self-sidebar button.zone-row.exile');
    await sleep(900);
    viewer = await read(
      'var t = document.querySelector(".viewer-title"); return t ? t.textContent.trim() : null;',
    );
    check('exile opens as its own zone', !!viewer && /exile/i.test(viewer), JSON.stringify(viewer));
    check(
      'an empty zone says it is empty',
      await read('return !!document.querySelector(".viewer-empty");'),
    );
    await click('.viewer-close');
    await sleep(400);

    check(
      'the library has a count but no way to look',
      await read(
        [
          'var lib = document.querySelector(".self-sidebar .zone-row.library");',
          'return !!lib && lib.tagName !== "BUTTON";',
        ].join(''),
      ),
      'CR 401.2',
    );

    // ---- The hand grip --------------------------------------------------------------------------
    console.log(NL + '--- The hand ---' + NL);
    const handBox = await read(
      'var r = document.querySelector(".hand-row").getBoundingClientRect(); return Math.round(r.height);',
    );
    await d.executeScript(
      [
        'var g = document.querySelector(".hand-resize-handle");',
        'var r = g.getBoundingClientRect();',
        'g.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + 10, clientY: r.top, bubbles: true }));',
        'document.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 10, clientY: r.top - 70, bubbles: true }));',
        'document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));',
      ].join(''),
    );
    await sleep(700);
    const handAfter = await read(
      'var r = document.querySelector(".hand-row").getBoundingClientRect(); return Math.round(r.height);',
    );
    check(
      'the grip makes the hand taller',
      handAfter > handBox,
      handBox + 'px -> ' + handAfter + 'px',
    );
    check(
      'and the cards grow with it',
      (await read(
        [
          'var c = document.querySelector("app-hand app-card");',
          'return c ? Math.round(c.getBoundingClientRect().height) : 0;',
        ].join(''),
      )) > 100,
    );

    // ---- Casting ---------------------------------------------------------------------------------
    console.log(NL + '--- Casting a spell (CR 601.2) ---' + NL);

    // Enough lands to pay for something. One a turn (CR 305.2), so this takes a few turns.
    let landed = false;
    for (let turn = 0; turn < 6; turn++) {
      if (!(await aliceReaches(bob, 'Main phase'))) break;
      s = await boardState();
      if (s.myLands.length >= 3) {
        landed = true;
        break;
      }
      const played = await d.executeScript(
        [
          'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
          'var land = cards.filter(function (w) {',
          '  var n = w.querySelector(".card-name");',
          '  return n && /Mountain|Forest|Island|Swamp|Plains/.test(n.textContent);',
          '})[0];',
          'if (!land) return false;',
          'land.querySelector(".card").click();',
          'return true;',
        ].join(''),
      );
      if (played) {
        await sleep(400);
        await click('.status-actions .action-btn.play');
        await sleep(1100);
      }
      // Move the game on a turn so the land drop comes back.
      await click('.status-actions .action-btn.pass');
      await sleep(400);
    }
    s = await boardState();
    check(
      'lands accumulate over turns',
      landed || s.myLands.length >= 2,
      JSON.stringify(s.myLands),
    );

    // Tap everything untapped for mana.
    await d.executeScript(
      [
        'var lands = [].slice.call(document.querySelectorAll("app-zones")[1].querySelectorAll(".lands-row app-card"));',
        'lands.filter(function (c) { return !c.classList.contains("is-tapped"); })',
        '     .slice(0, 3).forEach(function (c) { c.querySelector(".card").click(); });',
      ].join(''),
    );
    await sleep(1500);
    s = await boardState();
    check(
      'tapping several lands fills the pool',
      s.manaPips.length > 0,
      JSON.stringify(s.manaPips),
    );

    // Whatever non-land is in hand — the deck decides, not the walk.
    const spell = await d.executeScript(
      [
        'var cards = [].slice.call(document.querySelectorAll("app-hand .hand-card-wrapper"));',
        'var pick = cards.filter(function (w) {',
        '  var n = w.querySelector(".card-name");',
        '  return n && !/Mountain|Forest|Island|Swamp|Plains/.test(n.textContent);',
        '})[0];',
        'if (!pick) return null;',
        'pick.querySelector(".card").click();',
        'return pick.querySelector(".card-name").textContent.trim();',
      ].join(''),
    );
    check('there is something castable in hand', !!spell, JSON.stringify(spell));
    await sleep(500);

    const castLabel = await read(
      [
        'var b = document.querySelector(".status-actions .action-btn.play");',
        'return b ? b.textContent.trim() : null;',
      ].join(''),
    );
    check('a spell offers Cast, not Play', /^Cast/.test(castLabel || ''), castLabel || '');

    const stackBefore = s.stack.length;
    await click('.status-actions .action-btn.play');
    await sleep(1200);
    s = await boardState();

    // A spell that targets stops to ask; one that does not goes straight to the stack. Both
    // are correct — which happens depends on the card, and the board should not ask a creature
    // spell who it is targeting.
    if (s.choice && /target/i.test(s.choice)) {
      check('a spell that targets asks who for', true, JSON.stringify(s.choiceOptions));
      await answerOnScreen('restart-check-b');
      await sleep(1200);
      s = await boardState();
    } else {
      check('a spell with no targets is not asked about targets', !s.choice, JSON.stringify(spell));
    }

    check(
      'the spell goes on the stack (CR 601.2)',
      s.stack.length > stackBefore,
      JSON.stringify(s.stack),
    );

    // Both players pass and it resolves (CR 117.4).
    for (let i = 0; i < 6 && (await boardState()).stack.length > 0; i++) {
      const now = await boardState();
      if (now.passOffered) await click('.status-actions .action-btn.pass');
      await nudge(bob, { stopWhenAliceCanAct: true });
      await sleep(600);
    }
    s = await boardState();
    check(
      'and resolves off the stack once both players pass (CR 117.4)',
      s.stack.length === 0,
      'battlefield: ' + JSON.stringify(s.myCreatures) + ', their life ' + s.theirLife,
    );

    // ---- Attacking -------------------------------------------------------------------------------
    console.log(NL + '--- Declaring attackers (CR 508.1) ---' + NL);
    const hasCreature = await ensureAliceHasACreature(bob);
    check(
      'I have a creature to attack with',
      hasCreature,
      JSON.stringify((await boardState()).myCreatures),
    );
    const atAttackers = hasCreature && (await aliceReachesCombat(bob, 'Declare attackers'));
    check('the game reaches my declare-attackers step', atAttackers);

    if (atAttackers) {
      s = await boardState();
      check(
        'the board asks for attackers in words',
        /attack/i.test(s.status || ''),
        JSON.stringify(s.status),
      );
      check(
        'and offers a button that starts at none',
        /nothing/i.test(s.combatBtn || ''),
        JSON.stringify(s.combatBtn),
      );
      check('Pass Priority is not offered mid-declaration', !s.passOffered);

      // One that can actually attack: not summoning sick (CR 302.6), not already tapped. The
      // board marks the sick ones, so this picks the way a player would — by looking.
      const tapped = await d.executeScript(
        [
          'var mine = document.querySelectorAll("app-zones")[1];',
          'var creature = [].slice.call(mine.querySelectorAll(".permanents-row app-card"))',
          '  .filter(function (c) {',
          '    return !c.querySelector(".sick-overlay") && !c.classList.contains("is-tapped");',
          '  })[0];',
          'if (!creature) return null;',
          'creature.querySelector(".card").click();',
          'return creature.querySelector(".card-name").textContent.trim();',
        ].join(''),
      );
      await sleep(800);
      s = await boardState();
      check('tapping a creature chooses it as an attacker', !!tapped, JSON.stringify(tapped));
      check(
        'and the button counts it',
        /attack with 1/i.test(s.combatBtn || ''),
        JSON.stringify(s.combatBtn),
      );
      check(
        'the chosen creature is marked on the board',
        await read('return !!document.querySelector("app-zones app-card .card.pending-attacker");'),
      );

      await click('.status-actions .action-btn.combat');
      await sleep(1600);
      s = await boardState();
      check(
        'confirming declares the attack',
        !/attack with/i.test(s.combatBtn || ''),
        JSON.stringify(s.status) + (s.refusal ? '  refusal: ' + JSON.stringify(s.refusal) : ''),
      );
      check('an arrow is drawn from the attacker', s.arrows > 0, s.arrows + ' arrow(s)');

      // Let combat finish and see the damage land.
      const lifeBefore = Number(s.theirLife);
      for (let i = 0; i < 10; i++) {
        const now = await boardState();
        if (now.choice && now.choiceOptions.length) {
          await answerOnScreen();
        } else if (now.combatBtn) {
          await click('.status-actions .action-btn.combat');
        } else if (now.passOffered) {
          await click('.status-actions .action-btn.pass');
        }
        await nudge(bob, { stopWhenAliceCanAct: true, bobBlocks: 0 });
        await sleep(500);
        const after = await boardState();
        if (Number(after.theirLife) < lifeBefore) break;
      }
      s = await boardState();
      check(
        'unblocked damage comes off their life (CR 510.1c)',
        Number(s.theirLife) < lifeBefore,
        lifeBefore + ' -> ' + s.theirLife,
      );
    }

    // ---- Blocking ---------------------------------------------------------------------------------
    console.log(NL + '--- Declaring blockers (CR 509.1) ---' + NL);
    const atBlockers = await aliceReachesCombat(bob, 'Declare blockers', { bobAttacks: 1 });
    check('the game reaches a declare-blockers step that is mine', atBlockers);

    if (atBlockers) {
      s = await boardState();
      check(
        'the board asks for blockers in words',
        /block/i.test(s.status || ''),
        JSON.stringify(s.status),
      );
      check(
        'and offers a button that starts at none',
        /nothing/i.test(s.combatBtn || ''),
        JSON.stringify(s.combatBtn),
      );
      check('an attacking creature is marked as attacking', s.arrows > 0, s.arrows + ' arrow(s)');

      const lifeBefore = Number(s.myLife);
      await click('.status-actions .action-btn.combat');
      await sleep(1600);
      s = await boardState();
      check(
        'declaring no blocks is itself a declaration, and the board moves on',
        !/block/i.test(s.status || '') || !s.combatBtn,
        JSON.stringify(s.status),
      );

      for (let i = 0; i < 8; i++) {
        const now = await boardState();
        if (Number(now.myLife) < lifeBefore) break;
        if (now.choice && now.choiceOptions.length) await answerOnScreen();
        else if (now.combatBtn) await click('.status-actions .action-btn.combat');
        else if (now.passOffered) await click('.status-actions .action-btn.pass');
        await nudge(bob, { stopWhenAliceCanAct: true });
        await sleep(500);
      }
      s = await boardState();
      check(
        'letting it through costs me life (CR 510.1c)',
        Number(s.myLife) < lifeBefore,
        lifeBefore + ' -> ' + s.myLife,
      );
    }

    // ---- Leaving ----------------------------------------------------------------------------------
    console.log(NL + '--- Leaving ---' + NL);
    await click('.status-actions .action-btn.concede');
    await sleep(700);
    const dialog = await read(
      'var t = document.querySelector(".leave-title"); return t ? t.textContent.trim() : null;',
    );
    check('Leave asks first', !!dialog, JSON.stringify(dialog));
    check(
      'and says what it actually does',
      await read(
        'var b = document.querySelector(".leave-body"); return !!b && /come back/i.test(b.textContent);',
      ),
    );
    await d.executeScript(
      '[].slice.call(document.querySelectorAll(".leave-actions .action-btn")).filter(function (b) { return /stay/i.test(b.textContent); })[0].click();',
    );
    await sleep(600);
    check(
      'Stay keeps you in the game',
      !(await read('return !!document.querySelector(".leave-dialog");')),
    );

    console.log(NL + '  board: ' + JSON.stringify(s) + NL);
    console.log('  game ' + gameId + NL);
    if (WATCHING) await sleep(5000);
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
