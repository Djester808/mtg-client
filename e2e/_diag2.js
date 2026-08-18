// Why does app-content scroll sideways on /community/players, and why are the tab fade
// classes absent when the strip is genuinely scrollable?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/community/players');
    await d.wait(until.elementLocated(By.css('.community-tabs')), 12000);
    await sleep(2500);

    const r = await d.executeScript(`
      const strip = document.querySelector('.community-tabs');
      const cs = getComputedStyle(strip);
      const app = document.querySelector('.app-content');
      const vw = window.innerWidth;

      // Which descendants of app-content actually reach past its client width?
      const wide = [];
      for (const el of app.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width < 1) continue;
        if (b.right > app.clientWidth + 1) {
          const p = el.parentElement;
          const pr = p ? p.getBoundingClientRect() : null;
          if (pr && pr.right > app.clientWidth + 1) continue; // report origin only
          const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0,2).join('.');
          wide.push({ sel: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), right: Math.round(b.right), w: Math.round(b.width) });
        }
        if (wide.length >= 8) break;
      }

      return {
        vw,
        stripOverflowX: cs.overflowX,
        stripMask: cs.maskImage && cs.maskImage.slice(0, 40),
        stripClasses: strip.className,
        stripClientW: strip.clientWidth,
        stripScrollW: strip.scrollWidth,
        stripRectW: Math.round(strip.getBoundingClientRect().width),
        appClientW: app.clientWidth,
        appScrollW: app.scrollWidth,
        wide,
      };
    `);
    console.log(JSON.stringify(r, null, 2));

    // Does a manual recompute (what a resize would trigger) produce the fade classes?
    await d.executeScript(`window.dispatchEvent(new Event('resize'));`);
    await sleep(600);
    const after = await d.executeScript(
      `return document.querySelector('.community-tabs').className;`,
    );
    console.log('classes after resize event:', after);
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
