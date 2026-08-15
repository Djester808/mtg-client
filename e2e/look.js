/* One-off: open the grouped set picker and report what actually renders. */
const fs = require('fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const SP = 'C:/Users/John/AppData/Local/Temp/claude/c--Users-John-Documents-Projects-MtgEngine/095bc0e9-833f-481d-af17-e47b81af0cb2/scratchpad';
const token = fs.readFileSync(`${SP}/tok.txt`, 'utf8').trim();
const col = fs.readFileSync(`${SP}/col.txt`, 'utf8').trim();
const URL = `http://localhost:4200/collection/${col}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const opts = new chrome.Options();
  opts.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000');
  opts.addArguments('--ignore-certificate-errors');
  const d = await new Builder().forBrowser('chrome').setChromeOptions(opts).build();
  const shot = async (name) => {
    const png = await d.takeScreenshot();
    fs.writeFileSync(`${SP}/${name}.png`, png, 'base64');
  };
  try {
    await d.get('http://localhost:4200/login');
    await sleep(2500);
    await d.executeScript(`
      const ins = [...document.querySelectorAll('input')];
      const u = ins.find(i => i.type !== 'password');
      const p = ins.find(i => i.type === 'password');
      const set = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(u, 'claudelook1'); set(p, 'Passw0rd!23');
      [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.innerText)).click();
    `);
    await sleep(4000);
    await d.get(URL);
    await sleep(6000);

    // Turn grouping on: the toggle is the button whose title mentions grouping.
    const toggled = await d.executeScript(`
      const b = [...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('title')||'').toLowerCase().includes('group the same card'));
      if (!b) return 'NO TOGGLE';
      return 'left ungrouped on purpose';
    `);
    await sleep(2000);
    await shot('01-grouped');

    // Open the first tile's set picker.
    const opened = await d.executeScript(`
      const db = document.querySelector('.detail-body');
      const kids = [...db.children].map(el => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { cls:(el.className||'').toString().slice(0,40), w:Math.round(r.width),
                 left:Math.round(r.left), display:cs.display, flex:cs.flex };
      });
      const ga = document.querySelector('.grid-area').getBoundingClientRect();
      const grid = document.querySelector('.card-grid');
      const gs = grid ? getComputedStyle(grid).gridTemplateColumns : null;
      window.__diag = { bodyW: Math.round(db.getBoundingClientRect().width), kids,
                        gridAreaW: Math.round(ga.width), cols: gs };
      const r=document.querySelector('.gf-row--search');
      window.__nest = r ? {rowChildren:[...r.children].map(c=>c.className.slice(0,28)),
        rowDisplay:getComputedStyle(r).display, rowWrap:getComputedStyle(r).flexWrap,
        rowW:Math.round(r.getBoundingClientRect().width),
        setsortParent:((document.querySelector('.fbar-setsort')||{}).parentElement||{}).className||'none'} : {err:'no row'};
      const ga=document.querySelector('.grid-area');
      const row=document.querySelector('.gf-row--search');
      const before={ left: Math.round(row.getBoundingClientRect().left), clientW: ga.clientWidth,
                     scrolls: ga.scrollHeight>ga.clientHeight+2 };
      // apply a filter that leaves only a handful of cards -> scrollbar disappears
      [...document.querySelectorAll('.text-chip')].find(b=>/planeswalker/i.test(b.innerText)).click();
      window.__shift={before};
      const bar = document.querySelector('.filter-bar');
      const chain = [];
      for (let el = bar.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const s = getComputedStyle(el);
        chain.push({ cls: (el.className||'').toString().slice(0,40), oy: s.overflowY,
                     scrolls: el.scrollHeight > el.clientHeight + 2,
                     top: Math.round(el.getBoundingClientRect().top) });
      }
      const before = Math.round(bar.getBoundingClientRect().top);
      const gaTop = Math.round(document.querySelector('.grid-area').getBoundingClientRect().top);
      // scroll whatever actually scrolls
      const scroller = [bar.parentElement, ...chain.map((_,i)=>null)];
      let scrolled = null;
      for (let el = bar.parentElement; el; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 2) {
          const s = getComputedStyle(el);
          if (s.overflowY === 'auto' || s.overflowY === 'scroll') { el.scrollTop = 500; scrolled = (el.className||'').toString().slice(0,40); break; }
        }
      }
      return { nest: window.__nest, diag: window.__diag, parentOfBar: (bar.parentElement.className||'').toString().slice(0,40),
               gridAreaTop: gaTop, barTopBefore: before, scrolledEl: scrolled,
               chain: chain.slice(0,3) };
    `);
    await sleep(1500);
    await shot('02-menu-open');
    const after = await d.executeScript(`const b=document.querySelector('.filter-bar');const g=document.querySelector('.grid-area');return {barTopAfter: Math.round(b.getBoundingClientRect().top), gridAreaTop: Math.round(g.getBoundingClientRect().top), scrollTop: g.scrollTop};`);
    console.log('AFTER SCROLL:', JSON.stringify(after));

    const report = await d.executeScript(`
      const menu = document.querySelector('.asm-menu');
      const items = menu ? [...menu.querySelectorAll('.app-menu-item')] : [];
      const cs = menu ? getComputedStyle(menu) : null;
      const r = menu ? menu.getBoundingClientRect() : null;
      // Walk up from the button to find an ancestor that traps position:fixed.
      const btn = document.querySelector('.card-grid .asm-btn');
      const traps = [];
      for (let el = btn && btn.parentElement; el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' ||
            s.contain !== 'none' || s.willChange !== 'auto' || s.backdropFilter !== 'none') {
          traps.push({ cls: el.className, transform: s.transform, filter: s.filter,
                       contain: s.contain, willChange: s.willChange, backdrop: s.backdropFilter });
        }
        if (s.overflow !== 'visible') traps.push({ cls: el.className, overflow: s.overflow });
      }
      return {
        menuExists: !!menu,
        itemCount: items.length,
        itemText: items.map(i => i.innerText.trim()),
        rect: r && { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        style: cs && { position: cs.position, zIndex: cs.zIndex, display: cs.display,
                       visibility: cs.visibility, opacity: cs.opacity, overflow: cs.overflow },
        viewport: { w: innerWidth, h: innerHeight },
        ancestors: traps,
      };
    `);
    console.log('TOGGLE:', toggled);
    console.log('OPENED:', JSON.stringify(opened));
    await sleep(600);
    const after = await d.executeScript(`const ga=document.querySelector('.grid-area');const row=document.querySelector('.gf-row--search');return {left:Math.round(row.getBoundingClientRect().left), clientW: ga.clientWidth, scrolls: ga.scrollHeight>ga.clientHeight+2};`);
    console.log('SHIFT after:', JSON.stringify(after));
    console.log('REPORT:', JSON.stringify(report, null, 2));
  } catch (e) {
    console.log('ERR', e.message);
    await shot('99-error');
  } finally {
    await d.quit();
  }
})();
