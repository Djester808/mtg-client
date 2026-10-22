// Version 1's deck DETAIL at 375, measured for the one question the Compleat rebuild got wrong:
// who scrolls, and how much height the card area actually gets.
//
//   node _shoot-v1-deck-vertical.js
//
// Compleat made the card list a flex-grow pane inside a fixed-height column, so on a phone the
// header ate all 667 px and the list measured height 0 — no cards at all. This prints, for v1:
// which element is the scroller, whether the page itself scrolls, how tall the card area is, and
// the height of every block stacked above it. Writes screenshots/v1-deck-vert-*.png.

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
  const round = (n) => Math.round(n);
  const rect = (el) => { const b = el.getBoundingClientRect();
    return { y: round(b.top), h: round(b.height), w: round(b.width) }; };
  const first = (el) => (el.className || '').toString().trim().split(/\\s+/)[0] || el.tagName.toLowerCase();

  // Every element that actually scrolls its own content, so "who scrolls" is answered by the
  // page rather than guessed from the stylesheet.
  const scrollers = [].slice.call(document.querySelectorAll('*')).filter(function (el) {
    const s = getComputedStyle(el);
    return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
  }).map(function (el) {
    return { cls: first(el), tag: el.tagName.toLowerCase(), clientH: el.clientHeight, scrollH: el.scrollHeight };
  });

  // The card area is the one that scrolls the cards: v1 calls it .groups-area.
  const area = document.querySelector('.groups-area');

  // Every block stacked above it, top to bottom, with its height — the vertical budget the
  // header spends before the reader sees a single card.
  const above = [];
  if (area) {
    const areaTop = area.getBoundingClientRect().top;
    const walk = function (el) {
      [].slice.call(el.children).forEach(function (kid) {
        if (kid === area) return;
        if (kid.contains(area)) { walk(kid); return; }
        const b = kid.getBoundingClientRect();
        if (b.height > 0 && b.top < areaTop) {
          above.push({
            cls: first(kid),
            y: round(b.top),
            h: round(b.height),
            text: (kid.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 34),
          });
        }
      });
    };
    walk(document.body);
    above.sort(function (a, b) { return a.y - b.y; });
  }

  return {
    viewport: window.innerWidth + 'x' + window.innerHeight,
    documentScrollHeight: document.documentElement.scrollHeight,
    pageItselfScrolls: document.documentElement.scrollHeight > window.innerHeight,
    innerScrollers: scrollers,
    cardArea: area
      ? { cls: (area.className || '').toString(), box: rect(area), clientH: area.clientHeight, scrollH: area.scrollHeight }
      : null,
    blocksAboveTheCardArea: above,
    headerBudget: above.reduce(function (n, b) { return n + b.h; }, 0),
  };
})();`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const se = DEVICES.find((d) => d.id === 'iphone-se');
  const driver = await buildDriver({ device: se, dpr: 1 });
  try {
    await loginAs(driver);
    await driver.get(`${baseUrl}/deck`);
    await driver.wait(until.elementLocated(By.css('.deck-grid, .empty-state')), 15000);
    await sleep(1500);

    const cards = await driver.findElements(By.css('.deck-card'));
    if (!cards.length) throw new Error('no decks on this account');
    await cards[0].click();
    await driver.wait(until.elementLocated(By.css('.detail-header')), 15000);
    await sleep(2500);

    console.log(JSON.stringify(await driver.executeScript(PROBE), null, 2));

    const png = await driver.takeScreenshot();
    fs.writeFileSync(path.join(OUT, 'v1-deck-vert-top.png'), png, 'base64');
  } finally {
    await driver.quit();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
