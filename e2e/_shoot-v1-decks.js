// Version 1's deck screens, as reference for the Compleat rebuild.
//
//   node _shoot-v1-decks.js
//
// Captures the deck LIST and the deck DETAIL at 1280 (desktop) and 375 (iPhone SE), and
// prints the geometry that the rebuild has to match: the deck grid's column count and
// tile size, the detail header's height and the boxes on its one row.
//
// Writes screenshots/v1-<page>-<width>.png.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, 'screenshots');

// The grid and the header, measured rather than described.
const PROBE = `return (function () {
  const round = (n) => Math.round(n);
  const rect = (el) => { const b = el.getBoundingClientRect();
    return { w: round(b.width), h: round(b.height), x: round(b.left), y: round(b.top) }; };

  const grid = document.querySelector('.deck-grid');
  const cards = [].slice.call(document.querySelectorAll('.deck-card'));
  const covers = [].slice.call(document.querySelectorAll('.deck-cover'));
  const header = document.querySelector('.detail-header, .list-header');
  const headerKids = header
    ? [].slice.call(header.children).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().trim().split(/\\s+/)[0],
        text: (el.textContent || '').trim().slice(0, 24),
        box: rect(el),
      }))
    : [];

  // How many tiles share the first row: the answer auto-fill actually produced.
  let firstRow = 0;
  if (cards.length) {
    const top = Math.round(cards[0].getBoundingClientRect().top);
    firstRow = cards.filter((c) => Math.round(c.getBoundingClientRect().top) === top).length;
  }

  return {
    viewport: window.innerWidth + 'x' + window.innerHeight,
    overflow: document.documentElement.scrollWidth > window.innerWidth
      ? document.documentElement.scrollWidth + ' > ' + window.innerWidth : 'none',
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    gridGap: grid ? getComputedStyle(grid).gap : null,
    deckCount: cards.length,
    tilesOnFirstRow: firstRow,
    firstTile: cards[0] ? rect(cards[0]) : null,
    firstCover: covers[0] ? rect(covers[0]) : null,
    coverAspect: covers[0]
      ? (covers[0].getBoundingClientRect().width / covers[0].getBoundingClientRect().height).toFixed(3)
      : null,
    headerBox: header ? rect(header) : null,
    headerDirection: header ? getComputedStyle(header).flexDirection : null,
    headerWrap: header ? getComputedStyle(header).flexWrap : null,
    headerChildren: headerKids,
  };
})();`;

async function shoot(driver, name, width) {
  const png = await driver.takeScreenshot();
  const file = path.join(OUT, `v1-${name}-${width}.png`);
  fs.writeFileSync(file, png, 'base64');
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const se = DEVICES.find((d) => d.id === 'iphone-se');
  const shapes = [
    { width: 1280, device: null, label: 'desktop' },
    { width: 375, device: se, label: 'phone' },
  ];

  const report = {};
  for (const shape of shapes) {
    const driver = await buildDriver({ device: shape.device, dpr: 1 });
    try {
      if (!shape.device) {
        await driver.manage().window().setRect({ width: shape.width, height: 900 });
      }

      await loginAs(driver);

      // ---- the deck list
      await driver.get(`${baseUrl}/deck`);
      await driver.wait(until.elementLocated(By.css('.deck-grid, .empty-state')), 15000);
      await sleep(1500);
      const listFile = await shoot(driver, 'deck-list', shape.width);
      const list = await driver.executeScript(PROBE);
      report[`list-${shape.width}`] = { file: listFile, ...list };

      // ---- the first deck, opened
      const cards = await driver.findElements(By.css('.deck-card'));
      if (cards.length) {
        await cards[0].click();
        await driver.wait(until.elementLocated(By.css('.detail-header')), 15000);
        await sleep(2500);
        const detailFile = await shoot(driver, 'deck-detail', shape.width);
        const detail = await driver.executeScript(PROBE);
        report[`detail-${shape.width}`] = { file: detailFile, ...detail };
      } else {
        report[`detail-${shape.width}`] = { note: 'no decks on this account' };
      }
    } finally {
      await driver.quit();
    }
  }

  fs.writeFileSync(path.join(OUT, 'v1-decks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
