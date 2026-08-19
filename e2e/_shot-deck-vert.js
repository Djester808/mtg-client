const fs = require('fs');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DECK = '/deck/f212e621-78ff-4952-8032-31fbd221199d';

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
    await d.get(baseUrl + DECK);
    await d.wait(until.elementLocated(By.css('.groups-area')), 30000);
    await sleep(2500);

    const click = async (title) => {
      const ok = await d.executeScript(
        'var want = arguments[0];' +
          'var b = Array.from(document.querySelectorAll(".density-btn")).filter(function (x) {' +
          '  return x.getAttribute("title") === want; })[0];' +
          'if (b) { b.click(); return true; } return false;',
        title,
      );
      if (!ok) throw new Error('no display button titled ' + title);
      await sleep(1400);
    };

    await click('Vertical groups (rows)');
    await click('Name only');
    fs.writeFileSync('screenshots/deck-vert-names.png', await d.takeScreenshot(), 'base64');
    await click('Text list');
    fs.writeFileSync('screenshots/deck-vert-text.png', await d.takeScreenshot(), 'base64');
    console.log('captured');
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
