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
const { armAiBuildReplay } = require('./helpers/ai-build-replay');
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
  {
    id: 'deck-suggest',
    label: 'Deck — Suggestions',
    // Waits on the panel by name rather than on a sleep: `app-deck-suggestions-panel` is
    // what registers this surface with tools/check-ui-states.js, and `.sugg-empty` is the
    // whole panel until Generate has run — the state this capture is actually of.
    run: async (d) => {
      await openTool(d, 'suggest');
      await d.wait(
        until.elementLocated(By.css('app-deck-suggestions-panel .sugg-empty, .sugg-results')),
        10000,
      );
    },
  },
  { id: 'deck-refine', label: 'Deck — Refine panel', run: (d) => openTool(d, 'refine') },
  {
    id: 'deck-refine-review',
    label: 'Deck — Refine proposals',
    run: async (d) => {
      await openTool(d, 'refine');
      await d.executeScript(
        "const b = Array.from(document.querySelectorAll('.rf-btn')).filter(function (x) {" +
          '  return /suggest/i.test(x.textContent); })[0]; if (b) b.click();',
      );
      await sleep(1800);
    },
  },
  { id: 'deck-filters', label: 'Deck — filter bar', run: (d) => openFilters(d) },
  {
    id: 'deck-admissions',
    label: 'Deck — which cards the engine plays',
    // The admission badge on every row: enforced, honour-system or refused
    // (CARD_ENGINE_PLAN.md). Waits on `.admission-badge` by name rather than on a sleep, for
    // the same reason the suggestions state waits on its panel — that wait is what registers
    // the badge with tools/check-ui-states.js, and a badge that stopped rendering would
    // otherwise cost nothing but a screenshot indistinguishable from the one beside it.
    //
    // The wait is allowed to time out: `/api/cards/{oracleId}/implementation` is being written
    // on the API side, and until it answers there is no badge to wait for. A capture of the
    // rows without it is still the capture this state is for; a thrown wait would take the
    // whole run down over an endpoint that is not this screen's fault.
    //
    // `keepScroll`, because on a 667px-tall phone the card list starts about two screens down
    // and every other state is photographed from the top of the page. Eleven runs of this state
    // photographed the deck header. The badge is what this capture is for, so this is the one
    // state that keeps the scroll its run() left behind.
    keepScroll: true,
    run: async (d) => {
      await setView(d, 0);
      await d
        .wait(until.elementLocated(By.css('app-admission-badge .admission-badge')), 8000)
        .catch(() => {});
      await d.executeScript(`
        const row = document.querySelector('.card-row');
        if (row) {
          // scrollIntoView alone leaves the row wherever its own scroller can put it, which on a
          // phone is under two sticky bars and one row from the bottom edge. Walk the ancestors
          // and scroll each one that can scroll, so the rows end up at the top of whatever is
          // actually showing them.
          for (let p = row.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p).overflowY;
            if ((s === 'auto' || s === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
              p.scrollTop += row.getBoundingClientRect().top - p.getBoundingClientRect().top - 4;
            }
          }
          window.scrollBy(0, row.getBoundingClientRect().top - 4);
        }
      `);
      await sleep(800);
    },
  },
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
  // `--deck=` names which deck to open, because the admission badge is the one state whose
  // answer comes from the *cards in the deck* rather than from the layout: a deck of verified
  // cards and a deck of disputed ones are two different screens through the same component,
  // and the seeded Showcase deck is neither. The suffix keeps the two runs' captures apart.
  const out = { dpr: 1, devices: ['iphone-se'], deck: 'Showcase', suffix: '', only: null };
  for (const a of argv.slice(2)) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'dpr') out.dpr = Number(m[2]);
    if (m[1] === 'devices') out.devices = m[2].split(',').map((s) => s.trim());
    if (m[1] === 'only') out.only = m[2].split(',').map((s) => s.trim());
    if (m[1] === 'deck') {
      out.deck = m[2];
      out.suffix =
        '-' +
        m[2]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
    }
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
    // Refine is a live model call. The proposal list is stubbed so its layout is
    // measured on every run rather than once, by hand, on the day it was written.
    await armAiBuildReplay(d);
    try {
      await loginAs(d);
      await sleep(1200);
      await d.get(baseUrl + '/deck');
      await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
      await sleep(1500);
      // Open the named deck (default: the seeded Showcase one), not whichever card is first —
      // flow runs leave their own decks behind and the list order is not stable.
      await d.executeScript(
        `const cards = Array.from(document.querySelectorAll('.deck-card'));
         (cards.find(c => c.textContent.includes(${JSON.stringify(args.deck)})) || cards[0]).click();`,
      );
      await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
      await sleep(3000);
      const deckUrl = await d.getCurrentUrl();

      const states = args.only ? STATES.filter((s) => args.only.includes(s.id)) : STATES;
      for (const st of states) {
        try {
          // Each state starts from a clean deck page so panels do not stack up.
          await backToDeck(d, deckUrl);
          for (const skip of await d.findElements(By.css('.intro-skip'))) {
            if (await skip.isDisplayed()) await skip.click();
          }
          await sleep(500);
          await st.run(d);
          // Shots are taken from the top of the page. tap() scroll-into-views whatever
          // it clicks, which slid the board up and tucked the search bar under the
          // sticky rows — every "the search bar is clipped" report traced back to this
          // capture artifact, not the app.
          if (!st.keepScroll) {
            await d.executeScript(`
              for (const el of document.querySelectorAll('*')) {
                if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0;
              }
              window.scrollTo(0, 0);
            `);
          }
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
          // The badge census, as data. A screenshot shows that *a* badge is there; it cannot
          // show that all 24 rows got one, nor that the glyph on them is the one the card's
          // status earns — and "every row badged honour-system" is exactly the claim this
          // state exists to make. Counted by class, so a badge that renders with no class
          // (the bug that would read as enforced) lands in `unclassed` rather than nowhere.
          audit.badges = await d.executeScript(`
            const rows = document.querySelectorAll('.card-row');
            const b = Array.from(document.querySelectorAll('app-admission-badge .admission-badge'));
            const count = (c) => b.filter((x) => x.classList.contains(c)).length;
            return {
              rows: rows.length,
              total: b.length,
              enforced: count('is-enforced'),
              honour: count('is-honour'),
              refused: count('is-refused'),
              unclassed: b.length - count('is-enforced') - count('is-honour') - count('is-refused'),
              glyphs: Array.from(new Set(b.map((x) => x.textContent.trim()))),
              firstTitle: b.length ? b[0].getAttribute('title') : null,
              size: b.length
                ? Math.round(b[0].getBoundingClientRect().width) + 'x' + Math.round(b[0].getBoundingClientRect().height)
                : null,
            };
          `);
          const file = path.join(devDir, `deckstate-${st.id}${args.suffix}.png`);
          const intro = await d.findElements(By.css('.intro-skip'));
          for (const skip of intro) if (await skip.isDisplayed()) await skip.click();
          if (st.id === 'deck-commander') {
            const selector = await d.findElement(By.css('app-secondary-commander'));
            await d.executeScript('arguments[0].scrollIntoView({block:"center"});', selector);
            await d.wait(until.elementIsVisible(selector), 5000);
            await sleep(300);
          }
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
          const badges = audit.badges;
          console.log(
            `  ${st.id.padEnd(18)} ${(audit.offscreen.length ? audit.offscreen.length + ' OFF: ' + audit.offscreen[0].sel : 'fits').padEnd(30)} ${audit.cramped} under 44px  badges=${badges.total}/${badges.rows} rows ⚙${badges.enforced} ✋${badges.honour} ⛔${badges.refused} ?${badges.unclassed} ${badges.size ?? ''}`,
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

  // A `--only` run merges into what is already recorded rather than replacing it, for the same
  // reason shoot-states.js does: a file holding only this run's states tells the audit that every
  // other state stopped working.
  const stateFile = path.join(outDir, `deck-states${args.suffix}.json`);
  let merged = results;
  if (args.only && fs.existsSync(stateFile)) {
    const prev = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const key = (r) => `${r.device}/${r.state}`;
    const fresh = new Set(results.map(key));
    merged = [...prev.filter((r) => !fresh.has(key(r))), ...results];
  }
  fs.writeFileSync(stateFile, JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${results.length} deck states`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
