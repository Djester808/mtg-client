// What occupies the empty band in the open cgf panel, and why are the control widths
// inconsistent?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await loginAs(d);
    await sleep(1200);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await sleep(1500);
    await d.executeScript('document.querySelector(".deck-card").click();');
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
    await sleep(3000);
    const btn = await d.findElement(By.css('.cgf-menu-btn'));
    await d.executeScript('arguments[0].click();', btn);
    await sleep(1500);

    const r = await d.executeScript(`
      const panel = document.querySelector('.cgf-clusters.is-open') || document.querySelector('.cgf-clusters');
      if (!panel) return { missing: true };
      const walk = (el, depth) => {
        const out = [];
        for (const c of el.children) {
          const b = c.getBoundingClientRect();
          const cs = getComputedStyle(c);
          const cls = (typeof c.className === 'string' ? c.className : '').trim().split(/\\s+/).slice(0,2).join('.');
          out.push({
            d: depth,
            sel: c.tagName.toLowerCase() + (cls ? '.' + cls : ''),
            t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width),
            disp: cs.display, mb: cs.marginBottom, txt: (c.textContent||'').trim().slice(0,18),
          });
          if (depth < 2) out.push(...walk(c, depth + 1));
        }
        return out;
      };
      const pb = panel.getBoundingClientRect();
      return { panel: { t: Math.round(pb.top), h: Math.round(pb.height), w: Math.round(pb.width) }, kids: walk(panel, 0) };
    `);
    console.log('panel', JSON.stringify(r.panel));
    for (const k of r.kids) {
      console.log(
        `${'  '.repeat(k.d)}${k.sel.padEnd(30 - k.d * 2)} y${String(k.t).padStart(4)} h${String(k.h).padStart(4)} w${String(k.w).padStart(4)} ${k.disp.padEnd(12)} "${k.txt}"`,
      );
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
