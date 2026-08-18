// Is the ACTIVE tab actually on screen when you land on the last tab?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const s = document.querySelector('.community-tabs');
  const a = s && s.querySelector('.community-tab.active');
  if (!s || !a) return { missing: true };
  const sb = s.getBoundingClientRect(), ab = a.getBoundingClientRect();
  return {
    label: a.textContent.trim(),
    scrollLeft: Math.round(s.scrollLeft),
    maxScroll: s.scrollWidth - s.clientWidth,
    stripLeft: Math.round(sb.left), stripRight: Math.round(sb.right),
    activeLeft: Math.round(ab.left), activeRight: Math.round(ab.right),
    fullyVisible: ab.left >= sb.left - 1 && ab.right <= sb.right + 1,
    classes: s.className.replace('community-tabs','').trim(),
  };
`;

(async () => {
  for (const id of ['iphone-se', 'pixel-8']) {
    const device = DEVICES.find((d) => d.id === id);
    const d = await buildDriver({ device, dpr: 1 });
    try {
      for (const route of ['/community/players', '/community/commanders', '/community/forum']) {
        await d.get(baseUrl + route);
        await d.wait(until.elementLocated(By.css('.community-tabs')), 12000);
        await sleep(2500);
        const r = await d.executeScript(PROBE);
        console.log(
          `${device.label.padEnd(12)} ${route.padEnd(24)} active="${r.label}" ` +
            `scrollLeft=${r.scrollLeft}/${r.maxScroll} ` +
            `visible=${r.fullyVisible} [${r.activeLeft}..${r.activeRight}] in [${r.stripLeft}..${r.stripRight}] ${r.classes}`,
        );
      }
    } finally {
      await d.quit();
    }
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
