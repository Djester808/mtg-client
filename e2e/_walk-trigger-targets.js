// A triggered ability that targets, on the real board (CR 603.3d).
//
//   HEADLESS=false node _walk-trigger-targets.js
//
// Until the engine asked, a targeting trigger went on the stack with no targets and resolved
// into nothing — no error, no refusal, just a counter that never appeared. Now it stops and
// asks, which means the board has a question to render that it has never been given before.
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

// Bond Beetle is {1}{G} and its trigger wants a creature; Grizzly Bears gives it something to
// point at other than itself, which is what makes the question worth asking.
const DECK_A = ['24 Forest', '16 Bond Beetle', '20 Grizzly Bears'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

const WATCHING = process.env.HEADLESS === 'false';

(async () => {
  console.log(NL + 'Setting the table...');
  const { gameId, tokenB } = await setUpGame({
    a: A,
    b: B,
    deckA: DECK_A,
    deckB: DECK_B,
    deckNameA: 'Trigger Target Walk',
    deckNameB: 'Played Game Green',
    startingLife: 200,
  });

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const { check, section, summary } = makeChecker();
  let bob = null;

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    const tools = boardTools(d);
    const { read, boardState, press, playFromHand, tapAllLands, openBoard } = tools;
    const play = playTools(d, tools, { opponentAttacks: 0, opponentBlocks: 0 });
    const { atMyMain, advance, landsDown } = play;

    await openBoard(A, gameId);
    bob = await seat(tokenB, gameId);

    // The status bar renders a pending decision as a row of choice buttons.
    const choiceOnScreen = () =>
      read(
        [
          'return {',
          '  prompt: (document.querySelector(".status-message") || {}).textContent,',
          '  options: [].slice.call(document.querySelectorAll(".action-btn.choice"))',
          '    .map(function (b) { return b.textContent.trim(); }),',
          '};',
        ].join(''),
      );

    section('Getting a bear down to point at');

    const lands = await landsDown(bob, { Forest: 2 });
    check('two Forests are down', (lands.Forest || 0) >= 2, JSON.stringify(lands));

    await advance(bob, (now) => atMyMain(now) && now.hand.some((n) => /Grizzly/i.test(n)));
    await tapAllLands();
    await sleep(800);
    await playFromHand('Grizzly Bears');
    await advance(bob, (now) => now.myCreatures.some((n) => /Grizzly/i.test(n)));

    check(
      'a Grizzly Bears is on the battlefield',
      (await boardState()).myCreatures.some((n) => /Grizzly/i.test(n)),
      JSON.stringify((await boardState()).myCreatures),
    );

    section('The trigger stops and asks (CR 603.3d)');

    // A later turn: the Forests were spent casting the bear, and asking for a main phase we are
    // already standing in returns instantly with nothing left to pay with.
    const bearTurn = (await boardState()).turn;
    await advance(
      bob,
      (now) =>
        now.turn !== bearTurn &&
        atMyMain(now) &&
        now.hand.some((n) => /Bond Beetle/i.test(n)),
    );
    await tapAllLands();
    await sleep(800);
    const cast = await playFromHand('Bond Beetle');
    check('a Bond Beetle can be cast', !!cast && cast.castable === true, JSON.stringify(cast));

    // Let the creature resolve. Both players have to pass for that (CR 117.4), and only
    // `advance` drives the opponent's seat — a loop that passes for one player alone sits at
    // "Waiting for opponent..." until it gives up. `advance` checks the condition before it
    // touches any choice buttons, so it stops with the question still on screen.
    await advance(bob, (now) => /choose/i.test(now.status || ''));

    const asked = await choiceOnScreen();
    check(
      'the board asks who the trigger is aimed at',
      asked.options.length > 0,
      JSON.stringify(asked),
    );
    check(
      'and the prompt says what is being chosen',
      /target creature/i.test(asked.prompt || ''),
      JSON.stringify(asked.prompt),
    );
    check(
      'the bear is offered as a target',
      asked.options.some((o) => /Grizzly/i.test(o)),
      JSON.stringify(asked.options),
    );
    // Whose it is, not which copy. Two identical creatures the same player controls still read
    // alike, and that is fine: they are interchangeable to look at, and the answer carries the
    // object's own id rather than its label, so the pick is never ambiguous to the engine.
    check(
      'and each option says whose creature it is',
      asked.options.every((o) => /\(yours\)|'s\)/.test(o)),
      JSON.stringify(asked.options),
    );

    section('Answering it puts the counter where it was aimed');

    const before = await read(
      [
        'return [].slice.call(document.querySelectorAll(".self-field app-card"))',
        '  .filter(function (c) { return /Grizzly/i.test((c.querySelector(".card-name")||{}).textContent || ""); })',
        '  .map(function (c) { return (c.querySelector(".counter-badge, .card-counters") || {}).textContent || ""; });',
      ].join(''),
    );

    await d.executeScript(
      [
        'var b = [].slice.call(document.querySelectorAll(".action-btn.choice"))',
        '  .filter(function (x) { return /Grizzly/i.test(x.textContent) && /yours/i.test(x.textContent); })[0];',
        'if (b) b.click();',
      ].join(''),
    );
    await sleep(600);
    await advance(bob, (now) => now.panel.length === 0 && !now.status.includes('Choose'));

    const bearPower = await read(
      [
        'return [].slice.call(document.querySelectorAll(".self-field app-card"))',
        '  .filter(function (c) { return /Grizzly/i.test((c.querySelector(".card-name")||{}).textContent || ""); })',
        '  .map(function (c) { return (c.querySelector(".card-pt") || {}).textContent.trim(); });',
      ].join(''),
    );

    check(
      'the bear it was aimed at is now a 3/3 (CR 613, +1/+1 counter)',
      bearPower.some((pt) => /3\s*\/\s*3/.test(pt)),
      JSON.stringify({ before, after: bearPower }),
    );

    console.log(NL + '  game ' + gameId + NL);
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
