// Diagnostic: is the page itself scrolling sideways, and what is squeezed?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const vw = window.innerWidth;
  const out = { vw, scrollers: [], narrowText: [] };
  const describe = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  // Anything that actually scrolls horizontally, with how big it is relative to the screen.
  for (const el of document.querySelectorAll('body *')) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      const b = el.getBoundingClientRect();
      out.scrollers.push({
        sel: describe(el),
        clientW: el.clientWidth,
        scrollW: el.scrollWidth,
        over: el.scrollWidth - el.clientWidth,
        pctOfScreen: Math.round((b.width / vw) * 100),
      });
    }
  }
  // Text blocks squeezed so narrow they wrap to near one word per line.
  for (const el of document.querySelectorAll('p,div,span,li,h1,h2,h3')) {
    const t = el.textContent.trim();
    if (t.length < 40) continue;
    if (el.children.length > 0) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.width < 140) {
      const lines = Math.round(b.height / parseFloat(getComputedStyle(el).lineHeight || 16));
      out.narrowText.push({ sel: describe(el), w: Math.round(b.width), lines, text: t.slice(0,40) });
    }
    if (out.narrowText.length >= 6) break;
  }
  return out;
`;

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    for (const route of ['/kb', '/community/players']) {
      await d.get(baseUrl + route);
      await d.wait(until.elementLocated(By.css('app-root > *')), 12000);
      await sleep(2200);
      const p = await d.executeScript(PROBE);
      console.log(`\n=== ${route} (vw ${p.vw}) ===`);
      console.log('horizontal scrollers:');
      p.scrollers.forEach((s) =>
        console.log(`   ${s.sel.padEnd(28)} client ${s.clientW} scroll ${s.scrollW} (+${s.over}px) — ${s.pctOfScreen}% of screen`),
      );
      if (!p.scrollers.length) console.log('   (none)');
      console.log('squeezed text blocks:');
      p.narrowText.forEach((n) =>
        console.log(`   ${n.sel.padEnd(24)} ${n.w}px wide, ~${n.lines} lines — "${n.text}"`),
      );
      if (!p.narrowText.length) console.log('   (none)');

      if (route === '/community/players') {
        const tabs = await d.executeScript(`
          const s = document.querySelector('.community-tabs');
          if (!s) return { missing: true };
          const a = s.querySelector('.community-tab.active');
          return {
            classes: s.className,
            scrollLeft: Math.round(s.scrollLeft),
            scrollW: s.scrollWidth, clientW: s.clientWidth,
            activeLabel: a && a.textContent.trim(),
            activeOffsetLeft: a && a.offsetLeft,
          };
        `);
        console.log('tabs state:', JSON.stringify(tabs));
      }
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
