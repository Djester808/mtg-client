// Repro: the Set dropdown inside the Add Cards panel — where does it land relative to the
// panel that clips it? Also: does the Suggestions panel offer a Generate button when the
// deck has no commander?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTH = Number(process.env.W || 1580);
const HEIGHT = Number(process.env.H || 900);

(async () => {
  const d = await buildDriver({ device: { os: 'desktop', width: WIDTH, height: HEIGHT }, dpr: 1 });
  try {
    await loginAs(d);
    await sleep(1000);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await sleep(800);
    const decks = await d.executeScript(`
      return Array.from(document.querySelectorAll('.deck-card')).map(c => c.textContent.replace(/\s+/g,' ').trim().slice(0,70));
    `);
    console.log('decks:', JSON.stringify(decks, null, 1));
    await d.executeScript(`
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      (cards.find(c => c.textContent.includes('Showcase')) || cards[0]).click();
    `);
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
    await sleep(3000);

    // --- Bug 1: open Add Cards, open the Set dropdown -------------------------------
    const clicked = await d.executeScript(`
      const b = Array.from(document.querySelectorAll('button')).find(x => /add cards/i.test(x.textContent||''));
      if (b) { b.click(); return b.className; }
      return 'NOT FOUND: ' + Array.from(document.querySelectorAll('button')).map(x=>(x.textContent||'').replace(/\s+/g,' ').trim()).slice(0,25).join(' | ');
    `);
    console.log('add-cards click ->', clicked);
    await sleep(2200);
    await d.executeScript(`
      const t = document.querySelector('app-card-search-panel .set-trigger');
      if (t) t.click();
    `);
    await sleep(900);

    const m = await d.executeScript(`
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
      const panel = document.querySelector('app-card-search-panel');
      const drop = document.querySelector('app-card-search-panel .set-dropdown');
      const trig = document.querySelector('app-card-search-panel .set-trigger');
      const wrap = document.querySelector('app-card-search-panel .set-dropdown-wrap');
      const cs = panel ? getComputedStyle(panel) : null;
      const clip = [];
      if (drop) for (let p = drop.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const c = getComputedStyle(p);
        if (c.overflow !== 'visible' || c.overflowX !== 'visible' || c.overflowY !== 'visible') {
          const b = p.getBoundingClientRect();
          clip.push({ sel: p.tagName.toLowerCase() + '.' + String(p.className||'').trim().split(/\s+/)[0], ox: c.overflowX, oy: c.overflowY, r: Math.round(b.right), b: Math.round(b.bottom) });
        }
        if (clip.length > 4) break;
      }
      const count = document.querySelector('app-card-search-panel .set-opt-count');
      return { vw: innerWidth, vh: innerHeight, panel: r(panel), panelOverflow: cs && cs.overflow,
               drop: r(drop), trigger: r(trig), wrap: r(wrap), firstCount: r(count), clippers: clip,
               options: document.querySelectorAll('app-card-search-panel .set-option').length };
    `);
    console.log('SET DROPDOWN:', JSON.stringify(m, null, 1));
    const dir = path.join(__dirname, 'screenshots', 'diag');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `setdrop-${WIDTH}.png`), await d.takeScreenshot(), 'base64');

    // --- Bug 2: Suggestions panel with / without a commander -------------------------
    await d.executeScript(`
      const b = Array.from(document.querySelectorAll('.tool-btn')).find(x => /suggest/i.test(x.textContent));
      if (b) b.click();
    `);
    await sleep(2000);
    const s = await d.executeScript(`
      const p = document.querySelector('app-deck-suggestions-panel');
      if (!p) return { missing: true };
      return {
        hasCommanderBar: !!p.querySelector('.sugg-commander'),
        hasGenerateBtn: !!p.querySelector('.sugg-generate-btn'),
        empty: (p.querySelector('.sugg-empty')||{}).textContent?.replace(/\s+/g,' ').trim() || null,
        buttons: Array.from(p.querySelectorAll('button')).map(b => (b.textContent||'').replace(/\s+/g,' ').trim() || b.className).slice(0, 8),
      };
    `);
    console.log('SUGGESTIONS (Showcase deck):', JSON.stringify(s, null, 1));
    fs.writeFileSync(path.join(dir, `suggest-${WIDTH}.png`), await d.takeScreenshot(), 'base64');
  } finally {
    await d.quit();
  }
})();
