// The board, on a phone, showing a game the server was restarted underneath.
//
// No stubs: a real account signs in through the real login form, and the board seeds from
// GET /api/games/{id} against an API process that has never heard of this game and had to
// replay its log out of SQLite to answer. Run _verify-restart.js setup, restart the API, then
// this — it reads the game id from the snapshot that script leaves behind.
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '.restart-snapshot.json'), 'utf8'));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys('restart-check-a');
    await d.findElement(By.id('password')).sendKeys('restart-check-a-pw');
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 20000);
    console.log('signed in for real');

    await d.get(baseUrl + '/play/' + snap.gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 20000);
    await sleep(2500);

    const state = await d.executeScript(`
      const text = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim().replace(/\\s+/g, ' ') : null;
      };
      return {
        url: location.href,
        turn: text('.gb-turn'),
        permanents: document.querySelectorAll('.gb-permanent').length,
        handCards: document.querySelectorAll('.gb-hand .gb-card').length,
        players: Array.from(document.querySelectorAll('.gb-player-name')).map((n) =>
          n.textContent.trim(),
        ),
        life: Array.from(document.querySelectorAll('.gb-life')).map((n) => n.textContent.trim()),
        documentOverflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    `);
    console.log(JSON.stringify(state, null, 2));

    const shot = await d.takeScreenshot();
    fs.writeFileSync('e2e/screenshots/_resumed-game.png', shot, 'base64');
    console.log('shot: e2e/screenshots/_resumed-game.png');
  } finally {
    await d.quit();
  }
})();
