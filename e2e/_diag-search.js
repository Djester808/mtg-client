// Why does typing into Home's search produce no tiles under emulation?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('input.search-input')), 12000);
    await sleep(1500);

    const input = await d.findElement(By.css('input.search-input'));
    await input.click();
    await input.sendKeys('lightning bolt');

    for (const wait of [2000, 4000, 8000]) {
      await sleep(wait);
      const s = await d.executeScript(`
        const inp = document.querySelector('input.search-input');
        const grid = document.querySelector('.card-grid');
        return {
          value: inp ? inp.value : null,
          gridPresent: !!grid,
          tiles: document.querySelectorAll('.card-grid .card-tile').length,
          anyTile: document.querySelectorAll('.card-tile').length,
          imgs: document.querySelectorAll('.card-grid img').length,
          bodyHasError: /error|failed/i.test(document.body.innerText.slice(0, 800)),
          snippet: document.body.innerText.replace(/\\s+/g,' ').slice(0, 180),
        };
      `);
      console.log(`after ~${wait}ms:`, JSON.stringify(s));
      if (s.tiles > 0) break;
    }

    // Any network failures?
    const logs = await d.manage().logs().get('browser').catch(() => []);
    logs.slice(-8).forEach((l) => console.log('console:', l.level.name, l.message.slice(0, 160)));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
