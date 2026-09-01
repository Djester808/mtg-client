// A real game, opened in a browser, photographed — so a claim about how the board looks can be
// looked at instead of believed.
//
// It makes a game the way the lobby does, plays enough of it over the wire to put permanents on
// both sides, then opens it as a person and takes pictures: the board, a card being read, and a
// zone being looked through.
const fs = require('fs');
const path = require('path');
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
  board,
  clickIn,
  signInThroughTheForm,
  seat,
} = require('./helpers/board-driver');

const NL = String.fromCharCode(10);
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);
const SHOTS = path.join(__dirname, 'screenshots', 'board-now');

const shot = async (d, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
};

(async () => {
  const which = process.argv[2] || 'iphone-se';
  const device = DEVICES.find((x) => x.id === which);

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
  console.log('game ' + gameId);

  const alice = await seat(tokenA, gameId);
  const bob = await seat(tokenB, gameId);
  const who = (id) => (id === alice.id ? alice : bob);

  // Enough of a game to have something to look at: creatures on both sides, a card in a
  // graveyard. Played over the wire because the pictures are the point here, not the clicking.
  for (let i = 0; i < 300; i++) {
    const v = await alice.refresh();
    const mine = v.battlefield.filter((c) => c.controllerId === alice.id && c.isCreature).length;
    const theirs = v.battlefield.filter((c) => c.controllerId === bob.id && c.isCreature).length;
    if (mine >= 1 && theirs >= 1) break;

    if (v.choice) {
      await who(v.choice.playerId).answerChoice();
      continue;
    }
    if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
      await who(v.activePlayerId).attack(0);
      continue;
    }
    if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
      await (v.activePlayerId === alice.id ? bob : alice).block(0);
      continue;
    }
    if (v.currentStep === 'PrecombatMain') {
      const active = who(v.activePlayerId);
      const isAlice = active.id === alice.id;
      await active.playLand(isAlice ? /Mountain/ : /Forest/);
      await active.cast(isAlice ? 'Goblin Piker' : 'Grizzly Bears', isAlice ? /Mountain/ : /Forest/, 2);
    }
    await who(v.activePlayerId).pass();
    await (v.activePlayerId === alice.id ? bob : alice).pass();
  }

  await alice.stop();
  await bob.stop();

  const d = await buildDriver({ device, dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(3500);

    const s = await board(d);
    console.log('board: ' + JSON.stringify({ mine: s.mine, theirs: s.theirs, hand: s.hand.length }));
    const art = await d.executeScript(
      `return { onBoard: document.querySelectorAll('.gb-permanent .gb-art').length, inHand: document.querySelectorAll('.gb-hand .gb-art').length };`,
    );
    console.log('card art rendered: ' + JSON.stringify(art));
    await shot(d, which + '-1-board');

    // Read a card.
    if (await clickIn(d, '.gb-permanent .gb-info')) {
      await sleep(1200);
      const read = await d.executeScript(
        `const i = document.querySelector('.gb-inspect img'); return i ? i.getAttribute('src') : null;`,
      );
      console.log('reading a card: ' + (read ? read.slice(0, 60) : 'no image'));
      await shot(d, which + '-2-reading-a-card');
      await clickIn(d, '.gb-inspect .gb-btn', 'close');
      await sleep(600);
    }

    // Look through a zone.
    if (await clickIn(d, '.gb-zone-btn')) {
      await sleep(1000);
      const zone = await d.executeScript(
        `const h = document.querySelector('.gb-zone-head'); return h ? h.textContent.trim().replace(/\\s+/g,' ') : null;`,
      );
      console.log('zone opened: ' + zone);
      await shot(d, which + '-3-zone');
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
