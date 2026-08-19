const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
    await d.get(baseUrl + '/deck/f212e621-78ff-4952-8032-31fbd221199d');
    await d.wait(until.elementLocated(By.css('.groups-area')), 30000);
    await sleep(2500);
    console.log(JSON.stringify(await d.executeScript(`
      return Array.from(document.querySelectorAll('.tool-btn')).map(function (b) {
        const r = b.getBoundingClientRect();
        return { cls: b.className, text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
      });
    `), null, 1));
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
