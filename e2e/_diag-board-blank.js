// Why the board does not render: opens a game and reports what the page actually says.
//
//   node _diag-board-blank.js <gameId>
//
// Written because _play-a-game.js timed out waiting for .gb-root with nothing in any log to
// say why. A blank page and a broken page look identical from a selector timeout.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  if (!gameId) throw new Error('pass a game id');

  const driver = await buildDriver(DEVICES.find((d) => d.id === 'desktop'));
  try {
    await signInThroughTheForm(driver, { By, until }, A);
    console.log('after login, url:', await driver.getCurrentUrl());
    const stored = await driver.executeScript('return Object.keys(window.localStorage);');
    console.log('localStorage keys:', JSON.stringify(stored));

    await driver.get(`${baseUrl}/game/${gameId}`);
    await sleep(6000);

    console.log('url:', await driver.getCurrentUrl());
    const body = await driver.findElement(By.css('body')).getText();
    console.log('--- page text ---');
    console.log(body.slice(0, 1200));

    const logs = await driver.manage().logs().get('browser').catch(() => []);
    console.log('--- console ---');
    for (const entry of logs.slice(-25)) console.log(entry.level.name, entry.message.slice(0, 300));
  } finally {
    await driver.quit();
  }
})();
