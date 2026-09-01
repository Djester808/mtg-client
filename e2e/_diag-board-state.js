// What board() reads from a game that is already running.
//
//   node _diag-board-state.js <gameId>
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, board, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(`${baseUrl}/game/${gameId}`);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(4000);
    console.log(JSON.stringify(await board(d), null, 2));
  } finally {
    await d.quit();
  }
})();
