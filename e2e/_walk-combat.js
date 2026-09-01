// Walks combat on the restored board, against a live engine (CR 302.6, 506–511, 702).
//
//   HEADLESS=false node _walk-combat.js
//
// Combat is where the board has the most to get wrong and the least to show for it. A creature
// that attacks when it should not, damage that lands on the wrong player, a blocker that takes
// none of it — none of those look broken on screen. They look like a game going slightly the
// wrong way, which is indistinguishable from losing.
//
// Alice attacks with vanilla creatures and answers with a trick; Bob blocks over the wire.
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

// Goblin Piker is a 2/1 for {2}{R} — it dies to a Grizzly Bears block, which is what makes the
// damage checks below say something. Giant Growth is the trick that changes that answer.
const DECK_A = [
  '24 Mountain',
  '10 Forest',
  '16 Goblin Piker',
  '10 Giant Growth',
  '10 Lightning Bolt',
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
    deckNameA: 'Combat Walk red',
    deckNameB: 'Combat Walk green',
    // High, because this walk has to survive long enough to reach four sections and the
    // opponent's board grows the whole time. A game that ends early reports its later
    // sections as "could not reach", which reads as a harness fault rather than a win.
    startingLife: 200,
  });

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const { check, section, summary } = makeChecker();
  let bob = null;

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    const tools = boardTools(d);
    const { boardState, press, playFromHand, clickMine, tapAllLands, openBoard } = tools;

    // Bob keeps his creatures home. He declares no blocks by default — the sections that need
    // one drive his seat directly — and he does not attack at all, because an attacker stays
    // tapped through the defending player's turn, so a seat that swings with everything has
    // nothing untapped left to block with when it matters.
    // Mutable on purpose: `bobPlays` reads these each time it runs, so a section can turn
    // blocking on for itself. It has to be Bob's own routine that blocks rather than a poll
    // beside it — the game only reaches the blocking step once Alice passes priority in the
    // declare-attackers step (CR 508.2), and only `advance` is passing for her.
    const combatOpts = { opponentBlocks: 0, opponentAttacks: 0 };
    const play = playTools(d, tools, combatOpts);
    const { atMyMain, advance, landsDown } = play;

    /**
     * Declares one attacker the way the board actually works.
     *
     * "Declare Attackers" is what puts the board into attack mode; only then does clicking a
     * creature mark it. Clicking first and pressing after — which is the order that reads
     * naturally — toggles nothing, and every attack in this walk silently declared none.
     */
    const pickAttacker = async (name) => {
      const entered = await press('declare');
      await sleep(400);
      const clicked = await clickMine(name);
      await sleep(500);
      const now = await boardState();
      return { entered, clicked, pending: now.attacking };
    };

    await openBoard(A, gameId);
    bob = await seat(tokenB, gameId);

    // ---- A mana base to attack from ---------------------------------------------------------
    section('Getting a creature onto the board');

    const lands = await landsDown(bob, { Mountain: 3 });
    check('three Mountains are down', (lands.Mountain || 0) >= 3, JSON.stringify(lands));

    // Wait for a main phase that actually holds one. Casting whatever happened to be in hand
    // made the whole walk a coin flip on the opening draw, and reported the miss as a board
    // that would not put a creature down.
    await advance(bob, (now) => atMyMain(now) && now.hand.some((n) => /Goblin/i.test(n)));
    await tapAllLands();
    await sleep(900);
    const cast = await playFromHand('Goblin Piker');
    await sleep(900);

    // A creature spell goes on the stack like any other and needs both players to pass before
    // it is a permanent (CR 608.3). Reading the battlefield straight after the double-click
    // said "no creature" every time, which looked exactly like a cast that had been refused.
    await advance(bob, (now) => now.myCreatures.some((n) => /Goblin/i.test(n)));

    let s = await boardState();
    check(
      'a Goblin Piker resolves onto the battlefield',
      s.myCreatures.some((n) => /Goblin/i.test(n)),
      JSON.stringify({ cast, mine: s.myCreatures, refused: s.refusals }),
    );

    // ---- Summoning sickness (CR 302.6) ------------------------------------------------------
    section('Summoning sickness (CR 302.6)');

    // Get to this turn's declare-attackers step without ending the turn.
    const reachedCombat = await advance(bob, (now) =>
      now.buttons.some((b) => /declare attackers/i.test(b)),
    );

    if (!reachedCombat) {
      check('reached the declare attackers step this turn', false);
    } else {
      const onField = (await boardState()).myCreatures.filter((n) => /Goblin/i.test(n)).length;
      const picked = await pickAttacker('Goblin Piker');

      check(
        'a creature cast this turn cannot be declared as an attacker (CR 302.6)',
        onField > 0 && picked.pending === 0,
        'on the battlefield: ' + onField + ', picked: ' + JSON.stringify(picked),
      );
      await press('confirm');
      await sleep(700);
    }

    // ---- Attacking, and what it costs (CR 508.1f) -------------------------------------------
    section('Declaring an attacker (CR 508.1f)');

    // A later turn, not this one. The same creature is the subject of both sections and the
    // only thing that changes between them is time: it has to still be there when your next
    // turn begins for the sickness to have worn off (CR 302.6).
    const sickTurn = (await boardState()).turn;
    const armed = await advance(
      bob,
      (now) =>
        now.turn !== sickTurn &&
        now.buttons.some((b) => /declare attackers/i.test(b)) &&
        now.myCreatures.some((n) => /Goblin/i.test(n)),
    );

    if (!armed) {
      check('reached a combat with a creature that can attack', false);
    } else {
      const before = await boardState();
      const theirLifeBefore = Number(before.life[0]);

      const chosen = await pickAttacker('Goblin Piker');
      check(
        'a creature that has been under your control since your turn began can attack',
        chosen.pending >= 1,
        JSON.stringify(chosen),
      );

      await press('confirm');
      await sleep(1200);

      const declared = await boardState();
      check(
        'declaring an attacker taps it (CR 508.1f)',
        declared.myTapped > before.myTapped,
        'tapped ' + before.myTapped + ' -> ' + declared.myTapped,
      );

      // Bob is declining blocks in this section, so the damage has to land on him.
      await advance(bob, (now) => Number(now.life[0]) !== theirLifeBefore || !now.attacking);
      const after = await boardState();
      check(
        'an unblocked attacker damages the defending player (CR 510.1c)',
        Number(after.life[0]) === theirLifeBefore - 2,
        theirLifeBefore + ' -> ' + after.life[0] + ' (Goblin Piker is 2/1)',
      );
    }

    // ---- Blocking, and where the damage goes (CR 509.1, 510.1) ------------------------------
    section('Blocking (CR 509.1, 510.1)');

    const blockable = await advance(
      bob,
      (now) =>
        now.buttons.some((b) => /declare attackers/i.test(b)) &&
        now.myCreatures.some((n) => /Goblin/i.test(n)) &&
        now.theirCreatures.length > 0,
    );

    if (!blockable) {
      check('reached a combat with something of theirs to block with', false);
    } else {
      const before = await boardState();
      const theirLifeBefore = Number(before.life[0]);
      const myGoblins = before.myCreatures.filter((n) => /Goblin/i.test(n)).length;

      await pickAttacker('Goblin Piker');
      await press('confirm');
      await sleep(900);

      // Bob blocks this one, rather than declining as he has been.
      combatOpts.opponentBlocks = 1;
      const blocked = await advance(bob, (now) => !now.attacking);
      const blocking = await bob.refresh().then((v) => ({
        declared: v.blockersDeclared,
        blocks: Object.keys(v.blockers || {}).length,
      }));
      const after = await boardState();

      check(
        'a blocked attacker deals no damage to the player (CR 510.1)',
        Number(after.life[0]) === theirLifeBefore,
        theirLifeBefore +
          ' -> ' +
          after.life[0] +
          (blocked ? '' : ' (combat did not finish)') +
          '  blocking: ' +
          JSON.stringify(blocking),
      );
      check(
        'and a 2/1 that a 2/2 blocked is destroyed (CR 704.5g)',
        after.myCreatures.filter((n) => /Goblin/i.test(n)).length < myGoblins,
        myGoblins + ' -> ' + after.myCreatures.filter((n) => /Goblin/i.test(n)).length + ' Goblins',
      );
    }

    // ---- A trick, at instant speed, in combat (CR 304.1, 613) --------------------------------
    section('A combat trick (CR 304.1)');

    const trickLands = await landsDown(bob, { Mountain: 3, Forest: 1 });
    check(
      'a Forest is down to cast Giant Growth with',
      (trickLands.Forest || 0) >= 1,
      JSON.stringify(trickLands),
    );

    // This is the section the instant-speed fix exists for: before it, no instant was castable
    // outside your own main phase with an empty stack, so a Giant Growth could never be used
    // for the only thing it is for.
    // The last section's Goblin died in the block it was testing — that was the point of it —
    // so this one needs a fresh attacker, and a turn for it to lose summoning sickness.
    let castTurn = (await boardState()).turn;
    if (!(await boardState()).myCreatures.some((n) => /Goblin/i.test(n))) {
      await advance(bob, (now) => atMyMain(now) && now.hand.some((n) => /Goblin/i.test(n)));
      await tapAllLands();
      await sleep(800);
      await playFromHand('Goblin Piker');
      await advance(bob, (now) => now.myCreatures.some((n) => /Goblin/i.test(n)));
      castTurn = (await boardState()).turn;
    }
    check(
      'a fresh Goblin Piker is on the battlefield to swing with',
      (await boardState()).myCreatures.some((n) => /Goblin/i.test(n)),
      JSON.stringify((await boardState()).myCreatures),
    );

    const trickReady = await advance(
      bob,
      (now) =>
        now.turn !== castTurn &&
        now.buttons.some((b) => /declare attackers/i.test(b)) &&
        now.myCreatures.some((n) => /Goblin/i.test(n)) &&
        now.hand.some((n) => /Giant Growth/i.test(n)) &&
        // Giant Growth is {G}: a fistful of Mountains will not cast it.
        now.myLands.some((n) => /Forest/i.test(n)) &&
        now.myLands.length >= 4,
    );

    if (!trickReady) {
      check('reached a combat holding a Giant Growth', false);
    } else {
      const myGoblins = (await boardState()).myCreatures.filter((n) => /Goblin/i.test(n)).length;

      await pickAttacker('Goblin Piker');
      await press('confirm');
      await sleep(900);

      // Let the block actually happen before the trick is cast. A pump aimed at a creature
      // nobody has blocked yet proves nothing about surviving the block — the interesting
      // moment is after blockers are declared and before damage (CR 509, then 510).
      combatOpts.opponentBlocks = 1;
      const atBlockers = await advance(bob, (now) => /DeclareBlockers/i.test(now.status || ''));
      check(
        'the game reaches the declare blockers step with the attack blocked',
        atBlockers,
        JSON.stringify((await boardState()).status),
      );

      await tapAllLands();
      await sleep(800);
      const trick = await playFromHand('Giant Growth');
      await sleep(700);
      check(
        'a Giant Growth can be cast during combat (CR 304.1)',
        !!trick && trick.castable === true,
        JSON.stringify(trick),
      );

      // It targets a creature, so the board asks — pick our own attacker.
      const asking = await boardState();
      if (/target/i.test(asking.status || '')) {
        await clickMine('Goblin Piker');
        await sleep(1400);
      }

      const onStack = await boardState();
      check(
        'and it goes on the stack',
        onStack.panel.some((p) => /Giant Growth/i.test(p.name || '')),
        JSON.stringify(onStack.panel.map((p) => p.name)) +
          '  refused: ' +
          JSON.stringify(onStack.refusals),
      );

      await advance(bob, (now) => !now.attacking && now.panel.length === 0);
      const after = await boardState();
      check(
        'the pumped attacker survives the block it would have died to (CR 613)',
        after.myCreatures.filter((n) => /Goblin/i.test(n)).length >= myGoblins,
        myGoblins + ' -> ' + after.myCreatures.filter((n) => /Goblin/i.test(n)).length + ' Goblins',
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
