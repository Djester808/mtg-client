// What paints on top inside the open set menu on a phone?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await loginAs(d);
    await sleep(1000);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await sleep(800);
    await d.executeScript(`
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      (cards.find(c => c.textContent.includes('Chief of the Wild')) || cards[0]).click();`);
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
    await sleep(3000);
    await d.executeScript(`
      const b = Array.from(document.querySelectorAll('button')).find(x => /add cards/i.test(x.textContent||''));
      if (b) b.click();`);
    await sleep(2000);
    // Put results on screen first, so there is something to paint over.
    await d.executeScript(`
      const i = document.querySelector('app-card-search-panel .search-input');
      i.value = 'bolt';
      i.dispatchEvent(new Event('input', { bubbles: true }));`);
    await sleep(3000);
    await d.executeScript(`document.querySelector('app-card-search-panel .set-trigger').click();`);
    await sleep(800);
    const r = await d.executeScript(`
      const drop = document.querySelector('app-card-search-panel .set-dropdown');
      const b = drop.getBoundingClientRect();
      const probes = [];
      for (const [x, y] of [[b.left + 6, b.top + 60], [b.left + 30, b.top + 90], [b.right - 10, b.bottom - 10]]) {
        const el = document.elementFromPoint(x, y);
        const path = [];
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          path.push(p.tagName.toLowerCase() + '.' + String(p.className||'').trim() + '[z=' + cs.zIndex + ',pos=' + cs.position + ',tr=' + cs.transform + ',iso=' + cs.isolation + ',op=' + cs.opacity + ']');
          if (path.length > 7) break;
        }
        probes.push({ x: Math.round(x), y: Math.round(y), hit: path.join(' < ') });
      }
      return { drop: { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }, probes,
               results: document.querySelectorAll('app-card-search-panel .result-row, app-card-search-panel .result-tile').length };
    `);
    require('fs').writeFileSync(require('path').join(__dirname, 'screenshots', 'diag', 'zorder-shot.png'), await d.takeScreenshot(), 'base64');
    require('fs').writeFileSync(require('path').join(__dirname, 'screenshots', 'diag', 'zorder.json'), JSON.stringify(r, null, 1));
  } finally {
    await d.quit();
  }
})();
