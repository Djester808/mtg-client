// Activating what a permanent can actually do, on the real board (CR 602.1).
//
//   HEADLESS=false node _walk-abilities.js
//
// Everything the board knew about activating was the word "mana", hardcoded against a card
// whose type was Land. A Sol Ring is an artifact, so it could not be tapped for the mana it
// makes; an Icy Manipulator's ability had no way in at all. Both were implemented in the engine
// and neither could be reached from the screen, which is the kind of gap that looks like a
// missing feature rather than a bug.
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

const DECK_A = ['24 Mountain', '12 Sol Ring', '12 Icy Manipulator', '12 Grizzly Bears'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

const WATCHING = process.env.HEADLESS === 'false';

(async () => {
  console.log(NL + 'Setting the table...');
  const { gameId, tokenB } = await setUpGame({
    a: A,
    b: B,
    deckA: DECK_A,
    deckB: DECK_B,
    deckNameA: 'Ability Walk',
    deckNameB: 'Played Game Green',
    startingLife: 200,
  });

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const { check, section, summary } = makeChecker();
  let bob = null;

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    const tools = boardTools(d);
    const { read, boardState, playFromHand, clickMine, tapAllLands, openBoard } = tools;
    const play = playTools(d, tools, { opponentAttacks: 0, opponentBlocks: 0 });
    const { atMyMain, advance, landsDown } = play;

    await openBoard(A, gameId);
    bob = await seat(tokenB, gameId);

    /** Clicks one of my own non-land permanents by name. */
    const clickPermanent = (pattern) =>
      d.executeScript(
        [
          'var want = new RegExp(arguments[0], "i");',
          'var c = [].slice.call(document.querySelectorAll(".self-field .permanents-row app-card"))',
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

    const manaPips = () =>
      read('return document.querySelectorAll(".self-sidebar .mana-pip-icon:not(.empty)").length;');

    const tappedNames = (selector) =>
      read(
        [
          'return [].slice.call(document.querySelectorAll("' + selector + ' app-card"))',
          '  .filter(function (c) { return c.querySelector(".card.tapped"); })',
          '  .map(function (c) { return (c.querySelector(".card-name") || {}).textContent.trim(); });',
        ].join(''),
      );

    // ---- A mana rock that is not a land ---------------------------------------------------
    section('Tapping an artifact for mana (CR 605.1a)');

    const lands = await landsDown(bob, { Mountain: 3 });
    check('three Mountains are down', (lands.Mountain || 0) >= 3, JSON.stringify(lands));

    await advance(bob, (now) => atMyMain(now) && now.hand.some((n) => /Sol Ring/i.test(n)));
    await tapAllLands();
    await sleep(800);
    await playFromHand('Sol Ring');
    // `advance` calls its condition synchronously, so a predicate that returns a promise is
    // always truthy and the wait ends instantly. Everything it needs is already on boardState.
    await advance(bob, (now) => now.myCreatures.some((n) => /Sol Ring/i.test(n)));

    const onField = (await boardState()).myCreatures;
    check(
      'a Sol Ring is on the battlefield',
      onField.some((n) => /Sol Ring/i.test(n)),
      JSON.stringify(onField),
    );

    // A fresh turn, so the lands are untapped and the pool is empty to measure against.
    const solTurn = (await boardState()).turn;
    await advance(bob, (now) => now.turn !== solTurn && atMyMain(now));

    const before = await manaPips();
    const clicked = await clickPermanent('Sol Ring');
    await sleep(900);
    const after = await manaPips();

    check(
      'clicking a Sol Ring taps it for mana (CR 605.1a)',
      after > before,
      'clicked: ' + JSON.stringify(clicked) + ', pool ' + before + ' -> ' + after,
    );
    check(
      'and it is drawn tapped',
      (await tappedNames('.self-field .permanents-row')).some((n) => /Sol Ring/i.test(n)),
      JSON.stringify(await tappedNames('.self-field .permanents-row')),
    );

    // ---- An ability that has to be pointed at something ------------------------------------
    section('An ability that targets (CR 602.2b)');

    const icyReady = await advance(
      bob,
      (now) => atMyMain(now) && now.hand.some((n) => /Icy Manipulator/i.test(n)),
    );

    if (!icyReady) {
      check('reached a main phase holding an Icy Manipulator', false);
    } else {
      await tapAllLands();
      await sleep(800);
      await playFromHand('Icy Manipulator');
      await advance(bob, (now) => now.myCreatures.some((n) => /Icy/i.test(n)));

      // Next turn: the ability costs {T}, and it arrived tapped-out this one.
      const icyTurn = (await boardState()).turn;
      await advance(bob, (now) => now.turn !== icyTurn && atMyMain(now));

      const pressed = await clickPermanent('Icy Manipulator');
      await sleep(800);
      const asking = await boardState();
      check(
        'clicking it asks for a target rather than doing nothing (CR 602.2b)',
        /target/i.test(asking.status || ''),
        'clicked: ' + JSON.stringify(pressed) + ', status: ' + JSON.stringify(asking.status),
      );

      // Point it at one of their creatures.
      const aimed = await d.executeScript(
        [
          'var c = document.querySelectorAll(".opponent-field .permanents-row app-card")[0];',
          'if (!c) return null;',
          'c.querySelector(".card").click();',
          'return (c.querySelector(".card-name") || {}).textContent.trim();',
        ].join(''),
      );
      await sleep(1200);
      await advance(bob, (now) => now.panel.length === 0 && !/target/i.test(now.status || ''));

      const theirTapped = await tappedNames('.opponent-field .permanents-row');
      check(
        'and the creature it was pointed at is tapped (CR 701.26a)',
        theirTapped.length > 0,
        'aimed at: ' + JSON.stringify(aimed) + ', tapped: ' + JSON.stringify(theirTapped),
      );
    }

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
