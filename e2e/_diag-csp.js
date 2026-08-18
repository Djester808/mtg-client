// Measure the flattened search-panel filter flow: what are the flex items, their order,
// size — and what is reserving the vertical void around the Set dropdown?
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
    await sleep(1000);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await d.executeScript('document.querySelector(".deck-card").click();');
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
    await sleep(2500);
    const add = await d.findElement(By.css('.add-btn-primary, .vbar-add-btn, .add-btn'));
    await d.executeScript('arguments[0].click();', add);
    await sleep(2500);

    const r = await d.executeScript(`
      const pf = document.querySelector('app-card-search-panel .panel-filters');
      if (!pf) return { missing: true };
      const items = [];
      // Walk what the browser actually treats as flex items: children, descending through
      // display:contents wrappers.
      const collect = (el) => {
        for (const c of el.children) {
          const cs = getComputedStyle(c);
          if (cs.display === 'contents') { collect(c); continue; }
          const b = c.getBoundingClientRect();
          const cls = (typeof c.className === 'string' ? c.className : '').trim().split(/\\s+/).slice(0,2).join('.');
          items.push({
            sel: c.tagName.toLowerCase() + (cls ? '.' + cls : ''),
            order: cs.order, t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width),
            data: c.getAttribute && (c.getAttribute('data-chips') || c.closest('[data-chips]')?.getAttribute('data-chips') || ''),
          });
        }
      };
      collect(pf);
      // The set group's interior, for the void.
      const sg = pf.querySelector('.filter-group-set');
      const setKids = [];
      if (sg) for (const k of sg.querySelectorAll('*')) {
        const b = k.getBoundingClientRect();
        const cs = getComputedStyle(k);
        if (b.height < 1 && cs.display !== 'none') continue;
        const cls = (typeof k.className === 'string' ? k.className : '').trim().split(/\\s+/).slice(0,2).join('.');
        setKids.push({ sel: k.tagName.toLowerCase() + (cls?'.'+cls:''), h: Math.round(b.height), t: Math.round(b.top), disp: cs.display, pos: cs.position });
        if (setKids.length > 10) break;
      }
      const cs2 = sg ? getComputedStyle(sg) : null;
      const before = sg ? getComputedStyle(sg, '::before') : null;
      const after = sg ? getComputedStyle(sg, '::after') : null;
      const wrap = sg && sg.querySelector('.set-dropdown-wrap');
      const wcs = wrap ? getComputedStyle(wrap) : null;
      return { panelW: Math.round(pf.getBoundingClientRect().width), items, setKids,
        setStyle: cs2 && { h: cs2.height, minH: cs2.minHeight, pad: cs2.padding, alignSelf: cs2.alignSelf,
          flex: cs2.flex, disp: cs2.display, dir: cs2.flexDirection, gap: cs2.gap },
        pseudos: sg && { before: before.content + ' h=' + before.height, after: after.content + ' h=' + after.height },
        wrapStyle: wcs && { h: wcs.height, minH: wcs.minHeight, marginTop: wcs.marginTop, pad: wcs.padding } };
    `);
    console.log('panel width', r.panelW);
    console.log('\nflex items (order | y | w x h | sel | data-chips):');
    for (const i of r.items) console.log(`  ${String(i.order).padStart(2)} | y${String(i.t).padStart(4)} | ${i.w}x${i.h} | ${i.sel} | ${i.data}`);
    console.log('\nset group computed:', JSON.stringify(r.setStyle));
    console.log('set group pseudos :', JSON.stringify(r.pseudos));
    console.log('wrap computed     :', JSON.stringify(r.wrapStyle));
    console.log('\nset group interior:');
    for (const k of r.setKids) console.log(`  ${k.sel.padEnd(30)} y${k.t} h${k.h} ${k.disp} ${k.pos}`);
  } finally {
    await d.quit();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
