// Version 1's deck tool drawer (Stats), and the controls row's chip groups, measured.
//
//   node _measure-v1-drawer.js

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
  const S = (el, props) => { const c = getComputedStyle(el); const o = {};
    props.forEach((p) => { o[p] = c[p]; }); return o; };
  const first = (sel) => document.querySelector(sel);
  const all = (sel) => [].slice.call(document.querySelectorAll(sel));
  const out = {};

  // The drawer itself.
  const panel = first('.side-panel, .tool-panel, .deck-panel, aside[class*="panel"]');
  out.panel = panel ? { cls: (panel.className||'').toString(), box: R(panel),
    style: S(panel, ['position','backgroundColor','borderLeft','padding','zIndex','overflowY']) } : null;

  // Its header and close.
  const head = first('.panel-header, .side-panel-header, [class*="panel-head"]');
  out.panelHead = head ? { cls: (head.className||'').toString(), box: R(head), type: T(head),
    text: (head.textContent||'').trim().slice(0,40),
    style: S(head, ['borderBottom','padding','backgroundColor']) } : null;

  // Section captions inside the drawer.
  out.sections = all('.panel-section-label, .stats-section-label, [class*="section-label"]')
    .slice(0, 8).map((el) => ({ text: (el.textContent||'').trim().slice(0,28), box: R(el), type: T(el) }));

  // A stat row (label + value).
  const statRow = first('.stat-row, [class*="stat-row"]');
  out.statRow = statRow ? { cls: (statRow.className||'').toString(), box: R(statRow),
    style: S(statRow, ['borderBottom','padding','justifyContent']),
    parts: [].slice.call(statRow.children).map((c) => ({
      cls: (c.className||'').toString().split(/\\s+/)[0], box: R(c), text: (c.textContent||'').trim().slice(0,20), type: T(c) })) } : null;

  // A horizontal bar row (card types).
  const bar = first('.type-bar, .bar-track, [class*="bar-track"], [class*="type-bar"]');
  out.bar = bar ? { cls: (bar.className||'').toString(), box: R(bar),
    style: S(bar, ['backgroundColor','borderRadius','height']) } : null;
  const fill = first('.bar-fill, [class*="bar-fill"]');
  out.barFill = fill ? { cls: (fill.className||'').toString(), box: R(fill),
    style: S(fill, ['backgroundColor','borderRadius']) } : null;

  // The mana curve's columns.
  out.curveBars = all('.curve-bar, [class*="curve-bar"]').slice(0, 8).map((el) => ({ box: R(el),
    style: S(el, ['backgroundColor','borderRadius']) }));

  // The chip rows on the controls bar.
  out.chipRows = all('.chip-row, [class*="chip-row"]').slice(0, 4).map((el) => ({
    cls: (el.className||'').toString(), box: R(el), style: S(el, ['justifyContent','gap','flexWrap']) }));
  const chip = first('.text-chip');
  out.chip = chip ? { box: R(chip), type: T(chip),
    style: S(chip, ['backgroundColor','borderRadius','padding','border']) } : null;
  const chipOn = first('.text-chip.active, .text-chip.is-active, .text-chip.selected');
  out.chipSelected = chipOn ? { box: R(chipOn), type: T(chipOn),
    style: S(chipOn, ['backgroundColor','borderRadius','border']) } : null;

  // The mana glyph discs beside CMC.
  const disc = first('.mana-chip, .ms, [class*="mana-chip"]');
  out.manaDisc = disc ? { cls: (disc.className||'').toString(), box: R(disc),
    style: S(disc, ['backgroundColor','borderRadius','width','height']) } : null;

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
    await sleep(3000);

    // Open the Stats tool.
    for (const btn of await driver.findElements(By.css('.tool-btn'))) {
      const t = (await btn.getText().catch(() => '')).toLowerCase();
      if (t.includes('stats')) {
        await driver.executeScript('arguments[0].click()', btn);
        break;
      }
    }
    await sleep(2500);

    const out = await driver.executeScript(PROBE);
    fs.writeFileSync(path.join(__dirname, 'screenshots', 'v1-drawer.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2).slice(0, 7000));
  } finally {
    await driver.quit();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
