// Walks the stack on the restored board, against a live engine (CR 405, 601, 608).
//
//   HEADLESS=false node _walk-the-stack.js
//
// The stack is where a board is most likely to be quietly wrong: which end is the top, what
// order things resolve in, whether a spell can be answered at all. None of that shows up as a
// broken screen — it shows up as the wrong spell resolving.
//
// Alice holds Bolts and Counterspells; Bob is a second seat on the wire. The machinery for
// reading and driving the board lives in helpers/walk-harness.js, shared with the other walks.
const {
  NL,
  makeChecker,
  setUpGame,
  boardTools,
  playTools,
  sleep,
  seat,
} = require('./helpers/walk-harness');
const { buildDriver } = require('./helpers/driver');
const DEVICES = require('./devices');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
// Two colours, because Counterspell is the only way to test the one thing on the stack that
// cannot be done anywhere else: targeting a spell.
const DECK_A = [
  '18 Mountain',
  '16 Island',
  '8 Lightning Bolt',
  '8 Shock',
  '10 Counterspell',
  // Ten, not four. The sorcery-timing section needs a creature in hand at the moment it looks,
  // and at four-of-seventy it was almost never there — so the check reported "nothing to test"
  // instead of testing the rule.
  '10 Goblin Piker',
].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);
const WATCHING = process.env.HEADLESS === 'false';

(async () => {
  console.log(NL + 'Setting the table...');
  const { gameId, tokenB } = await setUpGame({
    a: A,
    b: B,
    deckA: DECK_A,
    deckB: DECK_B,
    // `deckFor` reuses an existing deck by name and never rewrites its list, so changing
    // DECK_A above does nothing until this name changes with it.
    deckNameA: 'Stack Test creatures',
    deckNameB: 'Played Game Green',
    // High, because the opponent attacks with everything every turn and this walk has to live
    // long enough to be holding a Bolt and a Counterspell at the same time. At sixty a slow
    // draw ended the game first, and the section reported "could not reach a turn holding
    // both" — which reads as a harness fault rather than what it was, a loss.
    startingLife: 200,
  });

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const { check, summary } = makeChecker();
  let bob = null;

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    const tools = boardTools(d);
    const {
      read,
      boardState,
      panelAsDrawn,
      press,
      playFromHand,
      clickMine,
      tapAllLands,
      openBoard,
    } = tools;
    const { atMyMain, advance, landsDown } = playTools(d, tools);

    await openBoard(A, gameId);
    bob = await seat(tokenB, gameId);

    // ---- An empty stack is nothing at all -------------------------------------------------
    console.log(NL + '--- An empty stack ---' + NL);
    let s = await boardState();
    check('the panel is not there with nothing on the stack', !s.panelShown);

    // Enough land, in both colours, for every section below — laid down once. A drop is one
    // per turn (CR 305.2), so this is the slow half of the walk and there is no reason to pay
    // for it three times: lands untap each turn, and the later sections reuse these.
    // Two of each is the most any section below needs at once: Bolt and Shock together want
    // {R}{R}, and Counterspell answering a Bolt wants {R} plus {U}{U}. Every extra land is
    // another turn of walking, so the mana base stops at what the rules being tested require.
    const lands = await landsDown(bob, { Mountain: 2, Island: 2 });
    check(
      'four lands are down, in both colours, to cast with',
      (lands.Mountain || 0) >= 2 && (lands.Island || 0) >= 2,
      JSON.stringify(lands),
    );

    // ---- One spell on the stack (CR 601.2a) --------------------------------------------------
    console.log(NL + '--- Putting a spell on the stack (CR 601.2a) ---' + NL);
    // Both spells have to be in hand before this starts. Without that the second cast was a
    // coin flip on the draw, and a Shock that was never held reported as a stack that refused
    // to take a second spell.
    await advance(
      bob,
      (now) =>
        atMyMain(now) &&
        now.hand.some((n) => /Lightning Bolt/i.test(n)) &&
        now.hand.some((n) => /Shock/i.test(n)),
    );
    await tapAllLands();
    await sleep(1200);

    const first = await playFromHand('Lightning Bolt');
    await sleep(900);
    const askingFirst = await boardState();
    await press('restart-check-b');
    await sleep(1300);

    // Same two conditions the countering section learned to check: the board has to consider
    // the card castable, and double-clicking it has to open target mode. When neither is
    // checked, a spell that never left hand looks identical to a stack that resolved early.
    check(
      'the Bolt can be cast',
      !!first && first.castable === true,
      JSON.stringify(first) + '  mode: ' + JSON.stringify(askingFirst.status),
    );

    s = await boardState();
    check(
      'the panel appears with the spell on it',
      s.panelShown && s.panel.length === 1,
      JSON.stringify(s.panel),
    );
    check(
      'and it is marked as the top of the stack',
      s.panel.some((p) => p.top),
      JSON.stringify(s.panel),
    );

    // ---- Responding to it (CR 117.3c, 405.1) --------------------------------------------------
    console.log(NL + '--- Answering it (CR 405.1) ---' + NL);
    check(
      'the spell can still be responded to, so it has not resolved',
      (await boardState()).panel.length === 1,
    );

    const second = await playFromHand('Shock');
    await sleep(900);
    if (second && second.castable) {
      await press('restart-check-b');
      await sleep(1400);
    }
    s = await boardState();
    check(
      'a second spell goes on top of the first',
      s.panel.length === 2,
      JSON.stringify(s.panel.map((p) => p.name)),
    );

    const drawn = await panelAsDrawn();
    check(
      'the one that resolves next is drawn at the top of the panel (CR 405.1)',
      drawn.length === 2 && drawn[0].name === 'Shock' && drawn[0].top === true,
      JSON.stringify(drawn.map((x) => x.name + (x.top ? ' (top)' : ''))),
    );

    // ---- Resolving, last on first off ----------------------------------------------------------
    console.log(NL + '--- Resolving (CR 608.1) ---' + NL);
    const lifeBefore = Number(s.life[0]);

    await advance(bob, (now) => now.panel.length <= 1);
    s = await boardState();
    check(
      'the top one resolves first, leaving the one under it',
      s.panel.length === 1 && s.panel[0].name.indexOf('Lightning Bolt') >= 0,
      JSON.stringify(s.panel.map((p) => p.name)),
    );
    check(
      'and its damage has landed (CR 608.2)',
      Number(s.life[0]) === lifeBefore - 2,
      lifeBefore + ' -> ' + s.life[0] + ' (Shock deals 2)',
    );

    await advance(bob, (now) => now.panel.length === 0);
    s = await boardState();
    check('then the other resolves and the stack empties', !s.panelShown, JSON.stringify(s.panel));
    check(
      'both spells dealt their damage (3 + 2)',
      Number(s.life[0]) === lifeBefore - 5,
      lifeBefore + ' -> ' + s.life[0],
    );

    // ---- Sorcery timing (CR 307.1) --------------------------------------------------------
    console.log(NL + '--- Sorcery timing (CR 307.1) ---' + NL);

    if (
      !(await advance(
        bob,
        (now) =>
          atMyMain(now) &&
          now.hand.some((n) => /Bolt|Shock/i.test(n)) &&
          now.hand.some((n) => /Goblin/i.test(n)),
      ))
    ) {
      check('reached a main phase to test timing in', false);
    } else {
      await tapAllLands();
      await sleep(1000);
      const creatureBefore = await read(
        [
          'var w = [].slice.call(document.querySelectorAll(".hand-card-wrapper"))',
          '  .filter(function (x) { var n = x.querySelector(".card-name"); return n && /Goblin/.test(n.textContent); })[0];',
          'return w ? w.querySelector(".card").classList.contains("castable") : null;',
        ].join(''),
      );

      await playFromHand('Bolt|Shock');
      await sleep(800);
      await press('restart-check-b');
      await sleep(1200);

      const creatureDuring = await read(
        [
          'var w = [].slice.call(document.querySelectorAll(".hand-card-wrapper"))',
          '  .filter(function (x) { var n = x.querySelector(".card-name"); return n && /Goblin/.test(n.textContent); })[0];',
          'return w ? w.querySelector(".card").classList.contains("castable") : null;',
        ].join(''),
      );
      // This says something only if the creature was castable to begin with. Written as
      // `before !== true || during === false` it passed whenever the Goblin was absent from
      // hand or unaffordable — which is most runs, and is not evidence about timing at all.
      if (creatureBefore !== true) {
        check(
          'a creature was castable before the spell went on the stack',
          false,
          'castable before: ' + creatureBefore + ' — nothing to test the timing rule against',
        );
      } else {
        check(
          'a creature cannot be cast while something is on the stack (CR 307.1)',
          creatureDuring === false,
          'castable before: ' + creatureBefore + ', with a spell on the stack: ' + creatureDuring,
        );
      }
      await advance(bob, (now) => now.panel.length === 0);
    }

    // ---- Countering (CR 701.5) ---------------------------------------------------------------
    console.log(NL + '--- Countering a spell (CR 701.5) ---' + NL);

    const armed = await advance(
      bob,
      (now) =>
        atMyMain(now) &&
        now.hand.some((n) => /Counterspell/i.test(n)) &&
        now.hand.some((n) => /Bolt|Shock/i.test(n)) &&
        now.myLands.length >= 4,
    );

    if (!armed) {
      check('reached a turn holding both a Bolt and a Counterspell', false);
    } else {
      // Counterspell is {U}{U}: four lands is not the requirement, two blue ones is. The
      // section used to check the count and then fail to cast for want of a second Island.
      const forCounter = await landsDown(bob, { Mountain: 1, Island: 2 });
      check(
        'two blue sources are down to cast Counterspell with',
        (forCounter.Island || 0) >= 2,
        JSON.stringify(forCounter),
      );
      await tapAllLands();
      await sleep(1200);

      const bolt = await playFromHand('Bolt|Shock');
      await sleep(800);
      await press('restart-check-b');
      await sleep(1300);
      const before = await boardState();
      check(
        'the spell is on the stack',
        before.panel.length === 1,
        JSON.stringify(before.panel.map((p) => p.name)) +
          '  refused: ' +
          JSON.stringify(before.refusals) +
          '  status: ' +
          JSON.stringify(before.status),
      );

      const lifeBefore = Number(before.life[0]);
      const counter = await playFromHand('Counterspell');
      await sleep(900);

      // Two things have to be true before the click below means anything, and when the
      // Counterspell silently stayed in hand neither was being checked: that the board would
      // let it be cast at all, and that double-clicking it put the board into target mode.
      check(
        'the Counterspell can be cast in response',
        !!counter && counter.castable === true,
        JSON.stringify(counter),
      );
      const asking = await boardState();
      check(
        'and double-clicking it asks for a target (CR 601.2c)',
        /target/i.test(asking.status || ''),
        JSON.stringify(asking.status) + '  refused: ' + JSON.stringify(asking.refusals),
      );

      // A Counterspell's target is the spell itself, and a spell lives only on the stack —
      // there is no card on a battlefield to tap. The panel's entries are the only place it
      // can be picked, which is why they had to become pressable.
      const picked = await d.executeScript(
        [
          'var item = document.querySelector(".stack-item");',
          'if (!item) return null;',
          'item.click();',
          'return (item.querySelector(".stack-item-name") || {}).textContent.trim();',
        ].join(''),
      );
      await sleep(1400);
      check(
        'a spell on the stack can be picked as a target (CR 115.4)',
        !!picked,
        JSON.stringify(picked),
      );

      const both = await boardState();
      check(
        'the Counterspell goes on top of what it answers',
        both.panel.length === 2,
        JSON.stringify(both.panel.map((p) => p.name)) +
          '  refused: ' +
          JSON.stringify(both.refusals) +
          '  status: ' +
          JSON.stringify(both.status),
      );

      await advance(bob, (now) => now.panel.length === 0);
      const after = await boardState();
      check('the stack empties', !after.panelShown);
      check(
        'and the countered spell dealt no damage (CR 701.5a)',
        Number(after.life[0]) === lifeBefore,
        lifeBefore + ' -> ' + after.life[0],
      );
    }

    console.log(NL + '  board: ' + JSON.stringify(await boardState()) + NL);
    console.log('  game ' + gameId + NL);
    if (WATCHING) await sleep(6000);
  } finally {
    if (bob) await bob.stop();
    await d.quit();
  }

  process.exitCode = summary() ? 1 : 0;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
