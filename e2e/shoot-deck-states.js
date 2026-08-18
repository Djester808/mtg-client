#!/usr/bin/env node
//
// Authenticated deck/collection states: every side panel and every view mode.
//
//   node shoot-deck-states.js [--devices=iphone-se] [--dpr=1]
//
// These are the layouts behind a tab or a toggle — the mana analysis, the commander
// picker, the suggestions panel, and the list / visual / free view modes. None of them
// is on screen when the route first paints, so nothing else in this harness sees them.
//
// Writes screenshots/<device>/deckstate-<id>.png and screenshots/deck-states.json.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AUDIT = `
  const vw = window.innerWidth, vh = window.innerHeight;
  const describe = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const insideCollapsed = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const b = p.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return true;
    }
    return false;
  };
  // Reachable-by-scroll exemption, matching shoot.js — free mode is a deliberate
  // sideways board (Trello-style columns), so its content past the edge is a swipe away,
  // not stranded.
  const reachableByScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const off = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.right <= vw + 1 && b.left >= -1) continue;
    const p = el.parentElement;
    if (p && p !== document.body) {
      const pb = p.getBoundingClientRect();
      if (pb.right > vw + 1 || pb.left < -1) continue;
    }
    if (!el.textContent.trim() && !el.querySelector('a,button,input,select,textarea')) continue;
    if (insideCollapsed(el)) continue;
    if (reachableByScroll(el)) continue;
    off.push({ sel: describe(el), l: Math.round(b.left), r: Math.round(b.right) });
    if (off.length >= 5) break;
  }
  // Controls squeezed below a usable size, which is how the filter rows read on a phone.
  const cramped = [];
  for (const el of document.querySelectorAll('button,select,input,[role="button"]')) {
    if (el.disabled) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (insideCollapsed(el)) continue;
    if (b.height >= 44) continue;
    cramped.push({ sel: describe(el), w: Math.round(b.width), h: Math.round(b.height) });
  }
  return { vw, vh, offscreen: off, cramped: cramped.length, url: location.pathname };
`;

async function tap(d, el) {
  await d.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
  await sleep(250);
  await d.executeScript('arguments[0].click();', el);
}

async function findFirst(d, selectors, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      for (const el of await d.findElements(By.css(sel))) {
        if (await el.isDisplayed().catch(() => false)) return el;
      }
    }
    await sleep(250);
  }
  throw new Error(`none visible: ${selectors.join(' | ')}`);
}

/** Click a deck tool button by its visible label. */
async function tool(d, label) {
  const btns = await d.findElements(By.css('.tool-btn'));
  for (const b of btns) {
    const t = (await b.getText().catch(() => '')).trim().toLowerCase();
    if (t.includes(label)) return tap(d, b);
  }
  throw new Error(`no tool button labelled "${label}"`);
}

const STATES = [
  { id: 'deck-view-list', label: 'Deck — list view', run: (d) => setView(d, 0) },
  { id: 'deck-view-visual', label: 'Deck — visual view', run: (d) => setView(d, 1) },
  { id: 'deck-view-free', label: 'Deck — free view', run: (d) => setView(d, 2) },
  { id: 'deck-stats', label: 'Deck — Stats panel', run: (d) => openTool(d, 'stats') },
  { id: 'deck-commander', label: 'Deck — Commander panel', run: (d) => openTool(d, 'commander') },
  { id: 'deck-mana', label: 'Deck — Mana analysis', run: (d) => openTool(d, 'mana') },
  { id: 'deck-suggest', label: 'Deck — Suggestions', run: (d) => openTool(d, 'suggest') },
  { id: 'deck-filters', label: 'Deck — filter bar', run: (d) => openFilters(d) },
];

async function backToDeck(d, deckUrl) {
  await d.get(deckUrl);
  await d.wait(until.elementLocated(By.css('.board-row, .detail-header')), 15000);
  await sleep(2500);
}

async function setView(d, index) {
  // The Layout control is one of the columns that folds behind .cgf-menu-btn on a narrow
  // bar, so the menu has to be opened before the buttons exist on screen.
  const menu = await d.findElements(By.css('.cgf-menu-btn'));
  for (const m of menu) {
    if (await m.isDisplayed().catch(() => false)) {
      await tap(d, m);
      await sleep(1200);
      break;
    }
  }
  const btns = await d.findElements(By.css('.view-toggle .sort-btn'));
  if (!btns.length) throw new Error('no view-mode buttons found');
  await tap(d, btns[Math.min(index, btns.length - 1)]);
  await sleep(2800);
}

async function openTool(d, label) {
  await tool(d, label);
  await sleep(2800);
}

async function openFilters(d) {
  // The controls are always visible on a phone now. No scrolling: scrollIntoView tucked
  // the bar's first row (the search box) under the sticky board tabs, which made every
  // capture look like the search box was missing.
  await sleep(600);
}

function parseArgs(argv) {
  const out = { dpr: 1, devices: ['iphone-se'] };
  for (const a of argv.slice(2)) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'dpr') out.dpr = Number(m[2]);
    if (m[1] === 'devices') out.devices = m[2].split(',').map((s) => s.trim());
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  if (!username || !password) {
    console.error('Needs E2E_USERNAME/E2E_PASSWORD in e2e/.env');
    process.exit(1);
  }
  const devices = DEVICES.filter((d) => args.devices.includes(d.id));
  const outDir = path.join(__dirname, 'screenshots');
  const results = [];

  for (const device of devices) {
    console.log(`\n=== ${device.label} (${device.width}x${device.height}) ===`);
    const devDir = path.join(outDir, device.id);
    fs.mkdirSync(devDir, { recursive: true });
    const d = await buildDriver({ device, dpr: args.dpr });
    try {
      await loginAs(d);
      await sleep(1200);
      await d.get(baseUrl + '/deck');
      await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
      await sleep(1500);
      // Open the seeded Showcase deck by name, not whichever card is first — flow runs
      // leave their own decks behind and the list order is not stable.
      await d.executeScript(`
        const cards = Array.from(document.querySelectorAll('.deck-card'));
        (cards.find(c => c.textContent.includes('Showcase')) || cards[0]).click();
      `);
      await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
      await sleep(3000);
      const deckUrl = await d.getCurrentUrl();

      for (const st of STATES) {
        try {
          // Each state starts from a clean deck page so panels do not stack up.
          await backToDeck(d, deckUrl);
          await st.run(d);
          // Shots are taken from the top of the page. tap() scroll-into-views whatever
          // it clicks, which slid the board up and tucked the search bar under the
          // sticky rows — every "the search bar is clipped" report traced back to this
          // capture artifact, not the app.
          await d.executeScript(`
            for (const el of document.querySelectorAll('*')) {
              if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0;
            }
            window.scrollTo(0, 0);
          `);
          await sleep(600);
          const audit = await d.executeScript(AUDIT);
          // Capture-time truth for the search box — a debugging aid for a capture that
          // kept disagreeing with live probes about whether the box exists.
          audit.searchBox = await d.executeScript(`
            const c = document.querySelector('.cgf-center input, app-card-search-panel input');
            if (!c) return 'ABSENT';
            const b = c.getBoundingClientRect();
            return Math.round(b.top) + 'y ' + Math.round(b.height) + 'h vis=' + (b.height > 0);
          `);
          const file = path.join(devDir, `deckstate-${st.id}.png`);
          fs.writeFileSync(file, await d.takeScreenshot(), 'base64');
          results.push({
            device: device.id,
            deviceLabel: device.label,
            state: st.id,
            label: st.label,
            vw: device.width,
            file: path.relative(outDir, file).replace(/\\/g, '/'),
            ...audit,
          });
          console.log(
            `  ${st.id.padEnd(18)} ${(audit.offscreen.length ? audit.offscreen.length + ' OFF: ' + audit.offscreen[0].sel : 'fits').padEnd(30)} ${audit.cramped} under 44px  search=${audit.searchBox}`,
          );
        } catch (e) {
          console.log(`  ${st.id.padEnd(18)} BLOCKED: ${e.message.split('\n')[0]}`);
          results.push({
            device: device.id,
            deviceLabel: device.label,
            state: st.id,
            label: st.label,
            vw: device.width,
            error: e.message.split('\n')[0],
          });
        }
      }
    } finally {
      await d.quit();
    }
  }

  fs.writeFileSync(path.join(outDir, 'deck-states.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} deck states`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
