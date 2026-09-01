#!/usr/bin/env node
//
// One-off: does a seventh nav link still fit above $bp-nav?
//
// `styles/_breakpoints.scss` says 900px was chosen because "the navbar's own content —
// logo, four links, account cluster — needs 850px before it starts running off the right
// edge". Tools is the seventh link, so the number that justified the breakpoint is no
// longer the number being measured.
//
// Measures the bar's content width with the Tools link present and again with it hidden,
// at each width, so the question "did this change cause it" is answered rather than
// guessed. The signed-out bar is the wide case: "Sign In" plus a "Create Account" button
// is a good deal wider than the signed-in account chip.

const { By, until, Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { baseUrl } = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The width the bar's content actually needs.
 *
 * `nav.scrollWidth` is rounded down and the bar is a flex row that will happily shrink its
 * children, so it under-reports. Summing the children plus the gaps and padding is what the
 * bar genuinely wants.
 */
const NEEDS = `
  const nav = document.querySelector('nav');
  const cs = getComputedStyle(nav);
  const gap = parseFloat(cs.columnGap) || 0;
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const kids = [...nav.children].filter((el) => getComputedStyle(el).display !== 'none');
  let total = pad + gap * (kids.length - 1);
  for (const el of kids) {
    // The links row is itself a flex container that shrinks; measure its children.
    if (el.classList.contains('nav-links')) {
      const inner = getComputedStyle(el);
      const igap = parseFloat(inner.columnGap) || 0;
      const links = [...el.children];
      total += igap * (links.length - 1);
      for (const a of links) total += a.getBoundingClientRect().width;
    } else {
      total += el.getBoundingClientRect().width;
    }
  }
  return Math.ceil(total);
`;

(async () => {
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().addArguments('--headless=new'))
    .build();

  try {
    console.log('\n=== what the navbar needs, signed out ===');
    console.log('  width   with Tools   without Tools   verdict');

    for (const width of [901, 910, 920, 950, 979, 999, 1000, 1024, 1100, 1199, 1200, 1280, 1440]) {
      await driver.manage().window().setRect({ width, height: 800 });
      await driver.get(baseUrl + '/');
      await driver.wait(until.elementLocated(By.css('nav')), 20000);
      await sleep(400);

      const drawer = await driver.executeScript(
        `return getComputedStyle(document.querySelector('.nav-toggle')).display !== 'none';`,
      );
      if (drawer) {
        console.log(`  ${String(width).padEnd(7)} (drawer — the links are not in the bar)`);
        continue;
      }

      const withTools = await driver.executeScript(NEEDS);

      // Hide just the Tools link and re-measure: the difference is exactly this change.
      await driver.executeScript(`
        [...document.querySelectorAll('.nav-links .nav-link')]
          .find((a) => a.textContent.trim() === 'Tools').style.display = 'none';
      `);
      await sleep(200);
      const withoutTools = await driver.executeScript(NEEDS);

      const fits = withTools <= width;
      const fitsBefore = withoutTools <= width;
      const verdict = fits ? 'fits' : fitsBefore ? 'BROKEN BY THIS CHANGE' : 'already did not fit';

      console.log(
        `  ${String(width).padEnd(7)} ${String(withTools).padEnd(12)} ${String(withoutTools).padEnd(15)} ${verdict}`,
      );
    }
  } finally {
    await driver.quit();
  }
})();
