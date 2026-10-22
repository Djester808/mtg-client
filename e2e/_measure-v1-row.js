// One list row and one visual column of version 1's deck board, measured part by part.
//
//   node _measure-v1-row.js

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `return (function () {
  const R = (el) => { const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top) }; };
  const T = (el) => { const s = getComputedStyle(el);
    return { font: s.fontFamily.split(',')[0].replace(/["']/g,''), size: s.fontSize, weight: s.fontWeight,
             track: s.letterSpacing, caps: s.textTransform, colour: s.color }; };
  const walk = (el, depth) => {
    if (depth > 3) return [];
    return [].slice.call(el.children).map((c) => ({
      tag: c.tagName.toLowerCase(),
      cls: (c.className || '').toString().trim().split(/\\s+/).slice(0, 2).join('.'),
      box: R(c),
      text: (c.textContent || '').trim().slice(0, 28),
      type: T(c),
      kids: walk(c, depth + 1),
    }));
  };
  const first = (sel) => document.querySelector(sel);
  const out = { viewport: window.innerWidth + 'x' + window.innerHeight };

  const row = first('.list-drag-row') || first('[class*="list-row"]');
  out.rowSelector = row ? (row.className || '').toString() : null;
  out.row = row ? { box: R(row), fill: getComputedStyle(row).backgroundColor,
    border: getComputedStyle(row).borderBottomWidth + ' ' + getComputedStyle(row).borderBottomColor,
    pad: getComputedStyle(row).padding, parts: walk(row, 0) } : null;

  const band = first('.group-header') || first('[class*="group-head"]') || first('[class*="section-head"]');
  out.band = band ? { cls: (band.className||'').toString(), box: R(band), type: T(band),
    fill: getComputedStyle(band).backgroundColor, text: (band.textContent||'').trim().slice(0,30),
    parts: walk(band, 0) } : null;

  const container = first('.groups-area');
  out.container = container ? { display: getComputedStyle(container).display,
    columns: getComputedStyle(container).gridTemplateColumns, gap: getComputedStyle(container).gap,
    box: R(container) } : null;

  return out;
})();`;

(async () => {
  const driver = await buildDriver({ dpr: 1 });
  try {
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    await loginAs(driver);
    await driver.get(`${baseUrl}/deck`);
    await driver.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await sleep(1200);
    (await driver.findElements(By.css('.deck-card')))[0].click();
    await driver.wait(until.elementLocated(By.css('.detail-header')), 15000);
    await sleep(3500);
    const out = await driver.executeScript(PROBE);
    fs.writeFileSync(path.join(__dirname, 'screenshots', 'v1-row.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2).slice(0, 6000));
  } finally {
    await driver.quit();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
