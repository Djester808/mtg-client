// Opens the board in a real browser window and leaves it open to be looked at.
//
//   node _open-the-board.js <gameId> [minutes]
//
// No assertions and no driving — this exists so the board can be seen and clicked by hand,
// rather than described. The window stays until the time runs out or it is closed.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const minutes = Number(process.argv[3] || 20);
  if (!gameId) throw new Error('pass a game id (see _make-a-game.js)');

  process.env.HEADLESS = 'false';
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.manage().window().maximize();
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(1500);

    const size = await d.executeScript(
      'return window.innerWidth + " x " + window.innerHeight;',
    );
    console.log('');
    console.log('  The board is open at ' + size + ' — ' + baseUrl + '/play/' + gameId);
    console.log('  Signed in as ' + A.username + '. Click anything; nothing here is driving it.');
    console.log('  Closing in ' + minutes + ' minutes.');
    console.log('');

    await sleep(minutes * 60 * 1000);
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
