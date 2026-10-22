// Version 1's VISUAL deck view, measured: the column grid, a column header, and how the
// cards overlap inside a column.
//
//   node _measure-v1-visual.js

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
  const S = (el, props) => { const c = getComputedStyle(el); const o = {};
    props.forEach((p) => { o[p] = c[p]; }); return o; };
  const all = (sel) => [].slice.call(document.querySelectorAll(sel));
  const first = (sel) => document.querySelector(sel);
  const out = { viewport: window.innerWidth + 'x' + window.innerHeight };

  const area = first('.groups-area');
  out.area = area ? { box: R(area), style: S(area, ['display', 'gridTemplateColumns', 'gap', 'alignItems']) } : null;

  // Whatever the area's own children are - that is the column.
  const col = area && area.children.length ? area.children[0] : null;
  out.column = col ? { cls: (col.className || '').toString(), box: R(col),
    style: S(col, ['display', 'flexDirection', 'position', 'minHeight']) } : null;
  out.columnCount = area ? area.children.length : 0;

  const head = first('.group-header');
  out.head = head ? { box: R(head), style: S(head, ['position', 'backgroundColor', 'borderBottom', 'padding', 'zIndex']) } : null;

  const cards = all('.visual-card, app-card-tile, .card-tile').slice(0, 4);
  out.cards = cards.map((c) => ({ box: R(c),
    style: S(c, ['position', 'marginTop', 'zIndex', 'borderRadius', 'boxShadow']) }));
  // The overlap: how far the second card's top sits below the first's.
  if (cards.length > 1) {
    out.overlap = Math.round(cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().top);
    out.cardHeight = Math.round(cards[0].getBoundingClientRect().height);
    out.visibleStrip = out.overlap;
  }

  const tile = first('app-card-tile') || first('.card-tile');
  out.tile = tile ? { cls: (tile.className || '').toString(), box: R(tile) } : null;

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

    // The LAYOUT control's second segment is the visual view.
    const segs = await driver.findElements(By.css('.view-toggle .sort-btn'));
    if (segs.length > 1) {
      await driver.executeScript("arguments[0].click()", segs[1]);
      await sleep(3000);
    }

    const out = await driver.executeScript(PROBE);
    out.layoutSegments = segs.length;
    fs.writeFileSync(path.join(__dirname, 'screenshots', 'v1-visual.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await driver.quit();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
