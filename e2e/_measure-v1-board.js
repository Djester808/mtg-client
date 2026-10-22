// Every band of version 1's deck board, measured. Reference for the Compleat rebuild.
//
//   node _measure-v1-board.js
//
// Prints, for 1280 and 375: the validation bar, the board tabs and tool buttons, the filter
// bar's controls, the group bands, and one list row and one visual column - each with its
// box, its type and its fill, so the rebuild copies numbers instead of a screenshot.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, 'screenshots');

const PROBE = `return (function () {
  const R = (el) => { const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top) }; };
  const T = (el) => { const s = getComputedStyle(el);
    return { font: s.fontFamily.split(',')[0].replace(/["']/g, ''), size: s.fontSize, weight: s.fontWeight,
             track: s.letterSpacing, caps: s.textTransform, colour: s.color }; };
  const F = (el) => { const s = getComputedStyle(el);
    return { fill: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopColor, radius: s.borderTopLeftRadius,
             pad: s.paddingTop + ' ' + s.paddingRight + ' ' + s.paddingBottom + ' ' + s.paddingLeft }; };
  const one = (sel) => document.querySelector(sel);
  const all = (sel) => [].slice.call(document.querySelectorAll(sel));
  const describe = (sel, withText) => { const el = one(sel); if (!el) return null;
    const d = { box: R(el), type: T(el), fill: F(el) };
    if (withText) d.text = (el.textContent || '').trim().slice(0, 40);
    return d; };

  const out = { viewport: window.innerWidth + 'x' + window.innerHeight };

  // ---- the validation bar
  const vbar = one('.vbar-row');
  out.validationBar = vbar ? { box: R(vbar), fill: F(vbar), direction: getComputedStyle(vbar.parentElement).flexDirection } : null;
  out.validationLabel = describe('.vbar-section-label', true);
  out.checks = all('.cp-check').map((el) => ({ text: (el.textContent || '').trim(), box: R(el), fill: F(el), type: T(el) }));
  out.legend = all('.cp-legend-item').map((el) => (el.textContent || '').trim());
  out.cover = describe('.vbar-cover-placeholder, .vbar-cover-overlay');
  out.addCards = describe('.vbar-add-btn', true);

  // ---- the board tabs and the tools
  const tabsRow = one('.board-tabs');
  out.tabsRow = tabsRow ? { box: R(tabsRow), fill: F(tabsRow) } : null;
  out.tabs = all('.board-tab').map((el) => ({ text: (el.textContent || '').trim(), box: R(el), type: T(el),
    active: el.className.indexOf('active') >= 0, fill: F(el) }));
  out.tabCount = describe('.board-tab-count', true);
  out.tools = all('.tool-btn').map((el) => ({ text: (el.textContent || '').trim(), box: R(el), type: T(el), fill: F(el) }));

  // ---- the filter bar's own controls
  const bar = one('.filter-bar');
  out.filterBar = bar ? { box: R(bar), fill: F(bar) } : null;
  out.filterLabels = all('.cgf-label, .chip-row-label').map((el) => (el.textContent || '').trim());
  out.chips = all('.text-chip').slice(0, 12).map((el) => ({ text: (el.textContent || '').trim(), box: R(el), fill: F(el), type: T(el) }));

  // ---- the group bands and the rows
  const band = one('.group-header');
  out.groupBand = band ? { box: R(band), fill: F(band), type: T(band), text: (band.textContent || '').trim().slice(0, 30) } : null;
  const row = one('.board-row');
  out.listRow = row ? { box: R(row), fill: F(row), children: [].slice.call(row.children).map((c) => ({
    cls: (c.className || '').toString().trim().split(/\\s+/)[0], box: R(c), text: (c.textContent || '').trim().slice(0, 24) })) } : null;
  const col = one('.groups-area > *');
  out.groupsArea = one('.groups-area') ? { box: R(one('.groups-area')),
    display: getComputedStyle(one('.groups-area')).display,
    columns: getComputedStyle(one('.groups-area')).gridTemplateColumns,
    gap: getComputedStyle(one('.groups-area')).gap } : null;
  out.firstColumn = col ? { cls: (col.className || '').toString(), box: R(col) } : null;

  return out;
})();`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const se = DEVICES.find((d) => d.id === 'iphone-se');
  const shapes = [{ width: 1280, device: null }, { width: 375, device: se }];
  const report = {};

  for (const shape of shapes) {
    const driver = await buildDriver({ device: shape.device, dpr: 1 });
    try {
      if (!shape.device) await driver.manage().window().setRect({ width: shape.width, height: 900 });
      await loginAs(driver);
      await driver.get(`${baseUrl}/deck`);
      await driver.wait(until.elementLocated(By.css('.deck-card')), 15000);
      await sleep(1200);
      const cards = await driver.findElements(By.css('.deck-card'));
      await cards[0].click();
      await driver.wait(until.elementLocated(By.css('.detail-header')), 15000);
      await sleep(3000);
      report[shape.width] = await driver.executeScript(PROBE);
    } finally {
      await driver.quit();
    }
  }

  fs.writeFileSync(path.join(OUT, 'v1-board.json'), JSON.stringify(report, null, 2));
  console.log('wrote screenshots/v1-board.json');
})().catch((e) => { console.error(e.message); process.exit(1); });
