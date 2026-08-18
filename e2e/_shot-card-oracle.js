// Captures the oracle-text block of a card modal, cropped to the element, so the keyword
// links can be looked at rather than inferred from a DOM query.
const { By, until } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = process.argv[2] || 'Bloodbraid Elf';

(async () => {
  const d = await buildDriver({ device, dpr: 2 });
  try {
    await loginAs(d);
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('input.search-input')), 15000);
    const box = await d.findElement(By.css('input.search-input'));
    await box.click();
    await box.sendKeys(CARD);
    await sleep(4500);

    await d.executeScript(
      `const t = [...document.querySelectorAll('.card-tile')]
         .find(e => (e.getAttribute('title') || '').toLowerCase() === arguments[0].toLowerCase());
       if (t) t.click();`,
      CARD,
    );
    await sleep(2500);

    await d.executeScript(
      `const el = document.querySelector('.modal-oracle');
       if (el) el.scrollIntoView({ block: 'center' });`,
    );
    await sleep(700);

    const info = await d.executeScript(`
      const el = document.querySelector('.modal-oracle');
      const links = [...el.querySelectorAll('a.kw-link')];
      const cs = getComputedStyle(links[0]);
      return {
        text: el.textContent.trim().slice(0, 200),
        links: links.map(a => a.textContent.trim() + ' -> ' + a.getAttribute('href')),
        linkColor: cs.color,
        linkDecoration: cs.textDecorationLine,
      };
    `);
    console.log(JSON.stringify(info, null, 2));

    const el = await d.findElement(By.css('.modal-oracle'));
    fs.mkdirSync(path.join(__dirname, '..', 'screenshots'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, '..', 'screenshots', '_kbr-oracle-links.png'),
      await el.takeScreenshot(),
      'base64',
    );
  } finally {
    await d.quit();
  }
})();
