// Desktop reference capture. Point it at either server:
//   node _compare-desktop.js 4300 head    <- clean checkout of HEAD (pre-mobile-work)
//   node _compare-desktop.js 4200 now     <- the working tree
// Writes screenshots/cmp-<tag>-<page>.png and prints the filter bar's geometry.
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { username, password } = require('./config');
const D = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE =
  'return (function(){' +
  "  var bar = document.querySelector('app-card-grid-filters') || document.querySelector('.home-search, .search-shell');" +
  "  function rect(el){ var b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) + ' @' + Math.round(b.left) + ',' + Math.round(b.top); }" +
  "  var chipRows = [].slice.call(document.querySelectorAll('app-filter-chips, .cgf-chips'));" +
  '  var tops = {};' +
  '  chipRows.forEach(function (e) { var t = Math.round(e.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; });' +
  '  return {' +
  '    bar: bar ? rect(bar) : null,' +
  '    chipRowCount: chipRows.length,' +
  '    chipLines: Object.keys(tops).length,' +
  "    labels: [].slice.call(document.querySelectorAll('.cgf-label, .chip-row-label')).map(function (l) { return (l.textContent || '').trim(); })," +
  "    typeChips: [].slice.call(document.querySelectorAll('[data-chips=\"types\"] .text-chip, .cgf-chips .text-chip')).map(function (c) { return (c.textContent || '').trim(); })" +
  '  };' +
  '})();';

(async () => {
  const port = process.argv[2] || '4200';
  const tag = process.argv[3] || 'now';
  const base = 'http://localhost:' + port;
  const d = await buildDriver({ device: D.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.get(base + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
    await sleep(1500);

    for (const [route, waitSel, name] of [
      ['/', 'input', 'home'],
      ['/deck', '.deck-card', 'deck'],
    ]) {
      await d.get(base + route);
      try {
        await d.wait(until.elementLocated(By.css(waitSel)), 20000);
      } catch (e) {
        /* page may render without it */
      }
      await sleep(2500);
      if (name === 'deck') {
        await d.executeScript(
          "var cs=[].slice.call(document.querySelectorAll('.deck-card'));(cs.filter(function(c){return c.textContent.indexOf('Showcase')>=0})[0]||cs[0]).click();",
        );
        await sleep(4500);
      }
      console.log(tag, name, JSON.stringify(await d.executeScript(PROBE), null, 1));
      fs.writeFileSync(
        path.join(__dirname, 'screenshots', 'cmp-' + tag + '-' + name + '.png'),
        await d.takeScreenshot(),
        'base64',
      );
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
