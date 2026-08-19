const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay } = require('./helpers/ai-build-replay');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left),
             r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
  const steps = document.querySelector('.ab-steps');
  const bar = document.querySelector('.ab-toolbar');
  const btn = document.querySelector('.ab-toolbar .ab-btn');
  const notes = Array.from(document.querySelectorAll('.ab-toolbar .ab-note')).map(box);
  const s = box(steps), t = box(bar);
  return {
    width: window.innerWidth,
    steps: s, toolbar: t, button: box(btn), notes,
    gap: s && t ? t.t - s.b : null,
    overlapsSteps: !!(s && t && t.t < s.b),
    toolbarWrapped: !!(t && btn && notes.length && notes[0].t >= box(btn).b - 2),
    docScroll: document.documentElement.scrollWidth,
  };
`;

(async () => {
  for (const id of ['iphone-se', 'iphone-15-pro', 'pixel-8', 'ipad-mini', 'desktop']) {
    const dev = DEVICES.find((x) => x.id === id);
    const d = await buildDriver({ device: dev, dpr: 1 });
    try {
      await armAiBuildReplay(d);
      await d.get(baseUrl + '/login');
      await d.wait(until.elementLocated(By.id('username')), 20000);
      await d.findElement(By.id('username')).sendKeys(username);
      await d.findElement(By.id('password')).sendKeys(password);
      await d.findElement(By.css('.submit-btn')).click();
      await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
      await d.get(baseUrl + '/deck/build');
      await d.wait(until.elementLocated(By.css('.ab-textarea')), 25000);
      await d.findElement(By.css('.ab-textarea')).sendKeys('wolf tribal');
      await d.executeScript("document.querySelector('.ab-go').click();");
      await d.wait(until.elementLocated(By.css('.ab-cmd')), 25000);
      await sleep(900);
      const m = await d.executeScript(PROBE);
      console.log(
        `${id.padEnd(14)} w=${m.width} gap=${m.gap}px overlap=${m.overlapsSteps} wrapped=${m.toolbarWrapped} ` +
          `btn=${m.button.l}-${m.button.r} notes=${m.notes.map((n) => n.l + '-' + n.r).join(' ')} docScroll=${m.docScroll}`,
      );
    } finally { await d.quit(); }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
