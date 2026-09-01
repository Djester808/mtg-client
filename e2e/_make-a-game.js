// Sets up a game to look at, and prints the URL.
//
// Nothing is asserted here — it exists so there is a real game with a real board to open in a
// browser and poke at, rather than a screenshot of one.
const NL = String.fromCharCode(10);
const { baseUrl } = require('./config');
const { api, signIn, userIdFromToken, deckFor, seat } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Played Game Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Played Game Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;

  const alice = await seat(tokenA, gameId);
  const bob = await seat(tokenB, gameId);
  const who = (id) => (id === alice.id ? alice : bob);

  // Both sides get a creature and some lands, and one creature dies, so the graveyard has
  // something in it to look at.
  for (let i = 0; i < 400; i++) {
    const v = await alice.refresh();
    const mine = v.battlefield.filter((c) => c.controllerId === alice.id && c.isCreature).length;
    const theirs = v.battlefield.filter((c) => c.controllerId === bob.id && c.isCreature).length;
    const graves = v.players.reduce((n, p) => n + p.graveyard.length, 0);
    const seat = v.players.find((p) => p.playerId === alice.id);
    // Stops on Alice's own main phase with her land drop unspent, so whoever opens the game
    // can actually do something in it. A game handed over on the opponent's turn with every
    // land tapped demonstrates nothing: the pass button is correctly hidden, no land can be
    // played, and no land can be tapped for mana.
    if (
      mine >= 2 &&
      theirs >= 2 &&
      graves >= 1 &&
      v.currentStep === 'PrecombatMain' &&
      v.activePlayerId === alice.id &&
      seat.landsPlayedThisTurn === 0
    ) {
      break;
    }

    if (v.choice) {
      await who(v.choice.playerId).answerChoice();
      continue;
    }
    if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
      await who(v.activePlayerId).attack(graves >= 1 ? 0 : 1);
      continue;
    }
    if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
      await (v.activePlayerId === alice.id ? bob : alice).block(1);
      continue;
    }
    if (v.currentStep === 'PrecombatMain') {
      const active = who(v.activePlayerId);
      const red = active.id === alice.id;
      await active.playLand(red ? /Mountain/ : /Forest/);
      await active.cast(red ? 'Goblin Piker' : 'Grizzly Bears', red ? /Mountain/ : /Forest/, 2);
    }
    await who(v.activePlayerId).pass();
    await (v.activePlayerId === alice.id ? bob : alice).pass();
  }

  const v = await alice.refresh();
  await alice.stop();
  await bob.stop();

  const count = (id) => v.battlefield.filter((c) => c.controllerId === id && c.isCreature).length;
  console.log('');
  console.log('  ' + baseUrl + '/play/' + gameId);
  console.log('');
  console.log('  sign in as ' + A.username + ' / ' + A.password);
  console.log(
    '  turn ' +
      v.turnNumber +
      ', ' +
      v.currentStep +
      ' — your creatures: ' +
      count(alice.id) +
      ', theirs: ' +
      count(bob.id) +
      ', graveyards: ' +
      v.players.reduce((n, p) => n + p.graveyard.length, 0),
  );
  console.log('  the other seat is ' + B.username + ' / ' + B.password);
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
