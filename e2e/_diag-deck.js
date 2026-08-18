// What is overlapping what in the deck-detail top chrome, and what runs off the edge?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const vw = window.innerWidth;
  const d = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  // Everything in the top 260px of the page: that is where the header, the board tabs
  // and the tool row all live and visibly collide.
  const rows = [];
  for (const el of document.querySelectorAll('.detail-header, .detail-header > *, .board-tabs, .board-tabs > *, .vbar, .vbar > *, [class*="vbar"], [class*="board-tab"], [class*="deck-tools"]')) {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.top > 300) continue;
    const cs = getComputedStyle(el);
    rows.push({
      sel: d(el),
      t: Math.round(b.top), b: Math.round(b.bottom),
      l: Math.round(b.left), r: Math.round(b.right),
      pos: cs.position,
      off: b.right > vw + 1 || b.left < -1,
    });
  }
  // Pairwise vertical overlap between siblings that should stack.
  const clashes = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], c = rows[j];
      const vOverlap = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      const hOverlap = Math.min(a.r, c.r) - Math.max(a.l, c.l);
      if (vOverlap > 6 && hOverlap > 6 && !a.sel.includes(c.sel) && !c.sel.includes(a.sel)) {
        clashes.push({ a: a.sel, b: c.sel, vOverlap: Math.round(vOverlap), hOverlap: Math.round(hOverlap) });
      }
    }
  }
  // Where is .side-panel-header, and is its owner actually visible?
  const sph = document.querySelector('.side-panel-header');
  let panel = null;
  if (sph) {
    const b = sph.getBoundingClientRect();
    let host = sph.parentElement, chain = [];
    for (let i = 0; host && i < 4; i++, host = host.parentElement) {
      const cs = getComputedStyle(host);
      const hb = host.getBoundingClientRect();
      chain.push({
        sel: d(host), pos: cs.position, transform: cs.transform.slice(0, 30),
        vis: cs.visibility, opacity: cs.opacity, w: Math.round(hb.width),
        l: Math.round(hb.left), r: Math.round(hb.right),
      });
    }
    panel = { rect: { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }, chain };
  }
  return { vw, rows, clashes: clashes.slice(0, 10), panel };
`;

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
    await sleep(3500);

    const r = await d.executeScript(PROBE);
    console.log('viewport', r.vw);
    console.log('\ntop-chrome boxes:');
    r.rows.forEach((x) =>
      console.log(
        `  ${x.sel.padEnd(26)} y ${String(x.t).padStart(4)}..${String(x.b).padStart(4)}  x ${String(x.l).padStart(4)}..${String(x.r).padStart(4)}  ${x.pos}${x.off ? '  OFF-SCREEN' : ''}`,
      ),
    );
    console.log('\noverlapping pairs:');
    r.clashes.forEach((c) =>
      console.log(`  ${c.a}  <->  ${c.b}   ${c.vOverlap}px vertical, ${c.hOverlap}px horizontal`),
    );
    if (!r.clashes.length) console.log('  (none)');
    console.log('\nside-panel-header:', JSON.stringify(r.panel, null, 2));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
