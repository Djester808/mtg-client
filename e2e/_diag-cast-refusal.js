// Why a creature spell never resolves: casts one and reads the refusal off the board.
//
//   node _diag-cast-refusal.js
//
// The played-game harness reports six lands and no creatures across seven turns. This makes the
// same game, drives to a main phase with lands out, taps them, casts, and prints exactly what
// the server said.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, api, signIn, userIdFromToken, deckFor, board, clickIn, playFromHand, tapLands,
  signInThroughTheForm } = require('./helpers/board-driver');

const NL = String.fromCharCode(10);
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Cast Red', ['40 Mountain', '30 Goblin Piker'].join(NL));
  const deckB = await deckFor(tokenB, 'Cast Green', ['40 Forest', '30 Grizzly Bears'].join(NL));
  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA, opponentUserId: userIdFromToken(tokenB), startingLife: 20,
  });
  const gameId = (await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept',
    { deckId: deckB })).gameId;
  console.log('game:', gameId);

  const alice = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const bob = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });

  try {
    for (const [d, who] of [[alice, A], [bob, B]]) {
      await signInThroughTheForm(d, { By, until }, who);
      await d.get(`${baseUrl}/game/${gameId}`);
      await d.wait(until.elementLocated(By.css('.board')), 25000);
    }

    // Answer both mulligans, then keep passing until Alice has three lands out.
    for (let i = 0; i < 260; i++) {
      for (const d of [alice, bob]) {
        const asking = await d.executeScript(
          `return document.querySelectorAll('.status-actions .action-btn.choice').length;`);
        if (asking > 0) {
          await d.executeScript(`
            const b = [...document.querySelectorAll('.status-actions .action-btn.choice')][0];
            if (b) b.click();
          `);
          await sleep(200);
          continue;
        }

        const s = await board(d);
        const mine = s.whose === (d === alice ? A.username : B.username);

        if (mine && /^M\d/i.test(s.step || '')) {
          const land = s.hand.find((n) => n === 'Mountain' || n === 'Forest');
          if (land) await playFromHand(d, land);
          await sleep(400);
        }

        if (s.buttons.some((t) => /declare/i.test(t))) {
          await clickIn(d, '.status-actions .action-btn', 'declare');
          await sleep(250);
          await clickIn(d, '.status-actions .action-btn', '^confirm');
          await sleep(250);
          continue;
        }

        await clickIn(d, '.status-actions .action-btn', 'pass priority');
        await sleep(120);
      }

      const s = await board(alice);
      if (s.myLands.length >= 3 && s.whose === A.username && /^M\d/i.test(s.step || '')) break;
    }

    const before = await board(alice);
    console.log('before the cast:', JSON.stringify({
      step: before.step, whose: before.whose, lands: before.myLands,
      untapped: before.untappedLands, hand: before.hand.slice(0, 4),
    }));

    const tapped = await tapLands(alice);
    await sleep(600);
    const pool = await alice.executeScript(
      `return (document.querySelector('.self-sidebar .mana-pool')?.textContent || '').trim();`);
    console.log('lands tapped:', tapped, '| mana pool now:', JSON.stringify(pool));

    const castable = await alice.executeScript(`
      const cards = [...document.querySelectorAll('app-hand .card')];
      return cards.map((c) => ({
        name: (c.querySelector('.card-name') || {}).textContent,
        castable: c.classList.contains('castable'),
      })).slice(0, 4);
    `);
    console.log('what the board thinks is castable:', JSON.stringify(castable));

    await playFromHand(alice, 'Goblin Piker');
    await sleep(1200);

    const refusal = await alice.executeScript(`
      const el = [...document.querySelectorAll('*')].find(
        (e) => e.children.length === 0 && /refus|not enough|cannot|illegal/i.test(e.textContent));
      return el ? el.textContent.trim().slice(0, 200) : null;
    `);
    const after = await board(alice);
    console.log('status:', JSON.stringify(after.status));
    console.log('refusal on screen:', JSON.stringify(refusal));
    console.log('battlefield:', JSON.stringify(after.mine));
    console.log('hand still holds Piker:', after.hand.includes('Goblin Piker'));

    // What the browser itself said. A hub invocation that the server refuses to bind shows up
    // here and nowhere else: it is not a rules refusal, so the hub never sends "Refused" and
    // never writes a line to the game log.
    const logs = await alice.manage().logs().get('browser').catch(() => []);
    console.log('--- console ---');
    for (const entry of logs.slice(-12)) {
      console.log(entry.level.name, entry.message.slice(0, 260));
    }
  } finally {
    for (const d of [alice, bob]) { try { await d.quit(); } catch { /* closing */ } }
  }
})();
