// The board's actual DOM, so the driver can be written against it rather than against memory.
//
//   node _diag-board-dom.js
//
// Makes a game the way the lobby makes one, opens it, and prints the class names that carry
// the things a player reads: the step, the life totals, the hand, the battlefields, the
// buttons. Written because board-driver.js still speaks the gb-* vocabulary of a board that
// no longer exists, and every selector in it had to be re-found from something.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, api, signIn, userIdFromToken, deckFor, signInThroughTheForm } =
  require('./helpers/board-driver');

const NL = String.fromCharCode(10);
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Dom Red', ['40 Mountain', '30 Goblin Piker'].join(NL));
  const deckB = await deckFor(tokenB, 'Dom Green', ['40 Forest', '30 Grizzly Bears'].join(NL));
  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;
  console.log('game:', gameId);

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(`${baseUrl}/game/${gameId}`);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const shape = await d.executeScript(`
      const classesUnder = (sel) => {
        const seen = new Map();
        for (const el of document.querySelectorAll(sel + ' *')) {
          for (const c of el.classList) seen.set(c, (seen.get(c) || 0) + 1);
        }
        return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
      };
      return {
        buttons: [...document.querySelectorAll('button')]
          .map(b => ({ cls: b.className, text: (b.textContent || '').trim().slice(0, 30) }))
          .filter(b => b.text),
        classes: classesUnder('.board'),
      };
    `);

    console.log('--- buttons ---');
    for (const b of shape.buttons) console.log(JSON.stringify(b));
    console.log('--- classes under .board (name, count) ---');
    for (const [c, n] of shape.classes) console.log(n, c);
  } finally {
    await d.quit();
  }
})();
