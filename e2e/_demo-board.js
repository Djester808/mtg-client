// Drives the board in a visible browser, slowly, so it can be watched rather than described.
//
//   HEADLESS=false node _demo-board.js [gameId]
//
// It signs in, opens a game, and then does each thing in turn with a pause long enough to see:
// holds a card on the battlefield to read it, holds one in hand, opens the graveyard, opens
// exile, plays a land and casts a creature. Every step prints what it just did and what the
// screen said back, so the log and the window agree.
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
  board,
  clickIn,
  playFromHand,
  signInThroughTheForm,
  seat,
} = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

const BEAT = 2200;

/** Presses and holds, the way a thumb does. */
const hold = (d, selector, ms = 700) =>
  d.executeAsyncScript(
    `
    const [selector, ms, done] = arguments;
    const el = document.querySelector(selector);
    if (!el) return done(false);
    el.scrollIntoView({ block: 'center' });
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    setTimeout(() => {
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      done(true);
    }, ms);
  `,
    selector,
    ms,
  );

async function makeGame() {
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

  for (let i = 0; i < 400; i++) {
    const v = await alice.refresh();
    const mine = v.battlefield.filter((c) => c.controllerId === alice.id && c.isCreature).length;
    const theirs = v.battlefield.filter((c) => c.controllerId === bob.id && c.isCreature).length;
    const graves = v.players.reduce((n, p) => n + p.graveyard.length, 0);
    // Stops before Alice's land drop is spent, so the demonstration has one to spend. Without
    // this it opened on a turn whose drop was already gone and the land it tried to play was
    // correctly refused — which looks exactly like a broken button.
    const seat = v.players.find((p) => p.playerId === alice.id);
    const ready =
      mine >= 1 &&
      theirs >= 2 &&
      graves >= 1 &&
      v.currentStep === 'PrecombatMain' &&
      v.activePlayerId === alice.id &&
      seat.landsPlayedThisTurn === 0;
    if (ready) break;

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

  await alice.stop();
  await bob.stop();
  return gameId;
}

(async () => {
  const gameId = process.argv[2] || (await makeGame());
  console.log('game ' + gameId + NL);

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(BEAT);

    const opened = await board(d);
    console.log('the board is open');
    console.log('  where the game is : ' + opened.turn + ' / ' + opened.whose + ' / ' + opened.step);
    console.log('  my permanents     : ' + JSON.stringify(opened.mine));
    console.log('  theirs            : ' + JSON.stringify(opened.theirs));
    console.log('  card art rendered : ' + (await d.executeScript(
      `return document.querySelectorAll('.gb-art').length;`,
    )) + ' images' + NL);
    await sleep(BEAT);

    // ---- hold a permanent to read it ------------------------------------------------------------
    console.log('holding a creature on the battlefield...');
    await hold(d, '.gb-field-half:last-child .gb-permanent');
    await sleep(1200);
    let reading = await d.executeScript(
      `const i = document.querySelector('.gb-inspect img'); return i ? i.getAttribute('alt') + ' | ' + i.getAttribute('src') : null;`,
    );
    console.log('  the card came up  : ' + (reading || 'NOTHING') + NL);
    await sleep(BEAT + 1500);
    await clickIn(d, '.gb-inspect .gb-btn', 'close');
    await sleep(BEAT);

    // ---- hold a card in hand --------------------------------------------------------------------
    console.log('holding a card in hand...');
    await hold(d, '.gb-hand .gb-card');
    await sleep(1200);
    reading = await d.executeScript(
      `const i = document.querySelector('.gb-inspect img'); return i ? i.getAttribute('alt') : null;`,
    );
    console.log('  the card came up  : ' + (reading || 'NOTHING') + NL);
    await sleep(BEAT + 1200);
    await clickIn(d, '.gb-inspect .gb-btn', 'close');
    await sleep(BEAT);

    // ---- the zones -------------------------------------------------------------------------------
    console.log('opening the graveyard...');
    await clickIn(d, '.gb-zone-btn');
    await sleep(1000);
    let zone = await d.executeScript(
      `const h = document.querySelector('.gb-zone-head'); const n = document.querySelectorAll('.gb-zone-card').length;
       return h ? h.textContent.trim().replace(/\\s+/g, ' ') + ' -> ' + n + ' card(s)' : null;`,
    );
    console.log('  it says           : ' + (zone || 'NOTHING') + NL);
    await sleep(BEAT + 1200);

    console.log('opening exile...');
    await d.executeScript(`document.querySelectorAll('.gb-zone-btn')[1].click();`);
    await sleep(1200);
    zone = await d.executeScript(
      `const h = document.querySelector('.gb-zone-head'); return h ? h.textContent.trim().replace(/\\s+/g, ' ') : null;`,
    );
    console.log('  it says           : ' + (zone || 'NOTHING') + NL);
    await sleep(BEAT);
    await d.executeScript(`document.querySelectorAll('.gb-zone-btn')[1].click();`);
    await sleep(1000);

    // ---- and it is still a game ------------------------------------------------------------------
    const before = (await api(await signIn(A), 'GET', '/api/games/' + gameId + '/log')).length;
    console.log('playing a land...');
    const s = await board(d);
    const land = s.hand.find((n) => n === 'Mountain');
    if (land) {
      await playFromHand(d, land);
      await sleep(BEAT);
      const after = (await api(await signIn(A), 'GET', '/api/games/' + gameId + '/log')).length;
      const now = await board(d);
      console.log('  battlefield       : ' + JSON.stringify(now.mine));
      console.log('  log               : ' + before + ' -> ' + after + ' lines');
      console.log(
        '  the server said   : ' + (now.refusal ? now.refusal : 'nothing, it just worked') + NL,
      );
    }

    console.log('leaving the window open for a look...');
    await sleep(15000);
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
