// Does the empty state's "Choose a commander" actually reach the commander picker, and do
// both fixes hold at 375? Drives the button and reports what the panel becomes.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deviceId = process.env.DEVICE || 'desktop';

(async () => {
  const device = DEVICES.find((d) => d.id === deviceId);
  const d = await buildDriver({ device, dpr: 1 });
  const dir = path.join(__dirname, 'screenshots', 'diag');
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (name) =>
    fs.writeFileSync(path.join(dir, `${name}-${deviceId}.png`), await d.takeScreenshot(), 'base64');
  try {
    await loginAs(d);
    await sleep(1000);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await sleep(800);
    await d.executeScript(`
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      (cards.find(c => c.textContent.includes('Chief of the Wild')) || cards[0]).click();
    `);
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
    await sleep(3000);

    await d.executeScript(`
      const b = Array.from(document.querySelectorAll('.tool-btn')).find(x => /suggest/i.test(x.textContent));
      if (b) b.click();
    `);
    await sleep(1800);
    await shot('suggest-empty');
    const before = await d.executeScript(`
      const p = document.querySelector('app-deck-suggestions-panel');
      const btn = p && p.querySelector('.sugg-empty-btn');
      const icon = btn && btn.querySelector('i');
      const ib = icon && icon.getBoundingClientRect();
      const b = btn && btn.getBoundingClientRect();
      return { btn: !!btn, h: b ? Math.round(b.height) : null, w: b ? Math.round(b.width) : null,
               iconVisible: ib ? (ib.width > 0 && ib.height > 0) : null,
               iconFont: icon ? getComputedStyle(icon, '::before').content : null };
    `);
    console.log('EMPTY-STATE BUTTON:', JSON.stringify(before));

    await d.executeScript(`document.querySelector('app-deck-suggestions-panel .sugg-empty-btn').click();`);
    await sleep(1800);
    const after = await d.executeScript(`
      const p = document.querySelector('app-card-search-panel');
      const b = p ? p.getBoundingClientRect() : null;
      return {
        searchPanelOpen: !!p && p.classList.contains('is-open'),
        width: b ? Math.round(b.width) : null,
        title: (p && p.querySelector('.panel-title') || {}).textContent?.replace(/\s+/g,' ').trim() || null,
        badge: !!(p && p.querySelector('.panel-cmdr-badge')),
        suggestionsClosed: !document.querySelector('app-deck-suggestions-panel'),
      };
    `);
    console.log('AFTER CLICK:', JSON.stringify(after, null, 1));
    await shot('suggest-to-commander');

    // Set menu on this device, inside whatever the panel is here.
    await d.executeScript(`
      const t = document.querySelector('app-card-search-panel .set-trigger');
      if (t) t.click();
    `);
    await sleep(800);
    const m = await d.executeScript(`
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
      const panel = document.querySelector('app-card-search-panel');
      const drop = document.querySelector('app-card-search-panel .set-dropdown');
      return { vw: innerWidth, vh: innerHeight, panel: r(panel), drop: r(drop),
               isUp: drop ? drop.classList.contains('is-up') : null,
               docOverflow: document.documentElement.scrollWidth - innerWidth };
    `);
    console.log('SET MENU:', JSON.stringify(m, null, 1));
    await shot('setdrop');
  } finally {
    await d.quit();
  }
})();
