// Drives the collapsed navbar the way a thumb would: open the drawer, measure it, tap a
// link, confirm it navigated and closed. A screenshot of the *closed* bar proves only
// that the toggle renders. Safe to delete.
const { By, until } = require('selenium-webdriver');
const fs = require('fs');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('app-navbar')), 10000);
    await sleep(1800);

    // 1. The toggle must be visible at this width, and the desktop clusters must not be.
    const vis = await d.executeScript(`
      const q = (s) => document.querySelector(s);
      const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
      return {
        toggle: shown(q('.nav-toggle')),
        deskLinks: shown(q('.nav-links')),
        deskAccount: shown(q('.account-menu')),
      };
    `);
    console.log('toggle visible:', vis.toggle, '| desktop links hidden:', !vis.deskLinks,
      '| desktop account hidden:', !vis.deskAccount);

    // 2. Open it.
    await d.findElement(By.css('.nav-toggle')).click();
    await sleep(500);
    fs.writeFileSync('screenshots/_drawer-open.png', await d.takeScreenshot(), 'base64');

    const open = await d.executeScript(`
      const nav = document.querySelector('.mobile-nav');
      if (!nav) return { present: false };
      const vw = window.innerWidth;
      const links = Array.from(nav.querySelectorAll('.mobile-nav-link'));
      const r = nav.getBoundingClientRect();
      return {
        present: true,
        withinScreen: r.left >= -1 && r.right <= vw + 1,
        labels: links.map(l => l.textContent.trim()),
        tooSmall: links.filter(l => l.getBoundingClientRect().height < 44).length,
        minHeight: Math.min(...links.map(l => Math.round(l.getBoundingClientRect().height))),
        scrimBelow: !!document.querySelector('.nav-scrim'),
      };
    `);
    console.log('drawer present:', open.present, '| fits screen:', open.withinScreen,
      '| scrim:', open.scrimBelow);
    console.log('links:', open.labels.join(' / '));
    console.log('links under 44px:', open.tooSmall, '| shortest:', open.minHeight + 'px');

    // 3. Tap a link that is NOT the current route, and confirm both the navigation and
    //    the close. This is the pair that actually matters — a drawer that navigates but
    //    stays open covers the page it just took you to.
    const target = await d.findElement(By.xpath("//a[contains(@class,'mobile-nav-link')][normalize-space()='Decks']"));
    await target.click();
    await sleep(1400);
    const after = await d.executeScript(`return {
      url: location.pathname,
      drawerGone: !document.querySelector('.mobile-nav'),
    };`);
    console.log('after tapping Decks -> url:', after.url, '| drawer closed:', after.drawerGone);
    fs.writeFileSync('screenshots/_drawer-after-tap.png', await d.takeScreenshot(), 'base64');
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
