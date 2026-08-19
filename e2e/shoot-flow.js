#!/usr/bin/env node
//
// End-to-end flows, captured step by step.
//
//   node shoot-flow.js [--devices=iphone-se,pixel-8] [--dpr=1]
//
// Routes and single states show you screens. A flow shows you whether the screens
// connect — whether you can actually get from an empty account to a deck with cards in
// it using nothing but a thumb. Each step is screenshotted and measured.
//
// Requires e2e/.env credentials. Writes screenshots/<device>/flow-<n>-<id>.png and
// screenshots/flows.json.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Viewport-relative audit of whatever is on screen right now.
const AUDIT = `
  const vw = window.innerWidth, vh = window.innerHeight;
  const describe = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };

  // A closed panel is collapsed to width 0 and parked at the right edge (see
  // aside.side-panel and app-card-search-panel), and its children keep reporting their
  // natural geometry out there even though the parent clips them. Nothing inside a
  // zero-width ancestor is stranded - it is shut. Skip it, or every closed drawer in the
  // app reads as a defect forever.
  const insideCollapsed = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const b = p.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return true;
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
    off.push({ sel: describe(el), l: Math.round(b.left), r: Math.round(b.right) });
    if (off.length >= 5) break;
  }
  return { vw, vh, offscreen: off, url: location.pathname };
`;

/** Click that works whether or not the element is scrolled into view. */
async function tap(d, el) {
  await d.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
  await sleep(300);
  await d.executeScript('arguments[0].click();', el);
}

async function findFirst(d, selectors, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const els = await d.findElements(By.css(sel));
      for (const el of els) {
        if (await el.isDisplayed().catch(() => false)) return el;
      }
    }
    await sleep(300);
  }
  throw new Error(`none visible: ${selectors.join(' | ')}`);
}

// ---- The deck-building flow ---------------------------------------------------------

const DECK_FLOW = {
  id: 'deck-build',
  label: 'Deck building',
  steps: [
    {
      id: 'deck-list',
      label: 'My Decks (empty)',
      async run(d) {
        await d.get(baseUrl + '/deck');
        await d.wait(until.elementLocated(By.css('.list-header')), 15000);
        await sleep(2000);
      },
    },
    {
      id: 'new-deck-dialog',
      label: 'New Deck dialog',
      async run(d) {
        const btn = await findFirst(d, [
          '.empty-state .create-btn',
          '.create-btn',
          'button.new-deck-btn',
        ]);
        await tap(d, btn);
        await sleep(1500);
      },
    },
    {
      id: 'deck-named',
      label: 'Naming the deck',
      async run(d) {
        const input = await findFirst(d, [
          '.modal input[type="text"]',
          'dialog input[type="text"]',
          '.dialog input[type="text"]',
          'input.deck-name-input',
          'input[type="text"]',
        ]);
        await input.sendKeys('Mobile Test Deck');
        await sleep(800);
      },
    },
    {
      id: 'deck-created',
      label: 'Deck created, in the list',
      // submitCreate() dispatches and closes the dialog — it does NOT navigate. The deck
      // lands in the list and you open it from there, so the flow has to do the same.
      async run(d) {
        const submit = await findFirst(d, [
          '.modal button[type="submit"]',
          'button[type="submit"]',
          '.modal .submit-btn',
        ]);
        await tap(d, submit);
        await d.wait(until.elementLocated(By.css('.deck-card')), 20000);
        await sleep(2500);
      },
    },
    {
      id: 'deck-detail',
      label: 'Deck detail (empty)',
      async run(d) {
        // Open the deck THIS flow just created — the seeded Showcase deck also lives in
        // the list and has no empty-state Add button.
        await d.executeScript(`
          // The LAST match: this flow creates a deck each run and earlier ones already
          // hold cards, so their empty-state Add button is gone.
          const cs = [...document.querySelectorAll('.deck-card')];
          const mine = cs.filter(c => c.textContent.includes('Mobile Test Deck'));
          (mine[mine.length - 1] || cs[0]).click();
        `);
        await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
        await sleep(3500);
      },
    },
    {
      id: 'search-panel',
      label: 'Card search panel open',
      async run(d) {
        const add = await findFirst(
          d,
          // Empty-state button first; once the deck has a card that button is gone and
          // the header's Add Cards is the only way in.
          ['.add-btn-primary', '.vbar-add-btn', '.add-btn', '.page-add-btn'],
          15000,
        );
        await tap(d, add);
        await sleep(2500);
      },
    },
    {
      id: 'search-results',
      label: 'Search results in panel',
      async run(d) {
        const input = await findFirst(d, [
          'app-card-search-panel input[type="text"]',
          '.search-panel input[type="text"]',
          'input.search-input',
        ]);
        await input.sendKeys('sol ring');
        await sleep(4500);
      },
    },
    {
      id: 'card-added',
      label: 'Card added to the deck',
      async run(d) {
        const addBtn = await findFirst(
          d,
          ['.csp-row .icon-action-btn', '.search-row .add-btn', '.csp-add', '.result-row button'],
          15000,
        );
        await tap(d, addBtn);
        await sleep(3000);
      },
    },
    {
      id: 'set-menu',
      label: 'Set menu open over the results',
      // The menu drops out of the last filter row of a panel that clips its overflow, which
      // is where it lost its count column off the panel's right edge and its last row off
      // the bottom. Captured last, with results behind it: those are what it has to paint
      // over, and on a phone they painted straight through it.
      async run(d) {
        const trigger = await findFirst(d, ['app-card-search-panel .set-trigger'], 15000);
        await tap(d, trigger);
        await d.wait(until.elementLocated(By.css('app-card-search-panel .set-dropdown')), 10000);
        await sleep(800);
      },
    },
  ],
};

const COLLECTION_FLOW = {
  id: 'collection-build',
  label: 'Collection',
  steps: [
    {
      id: 'collection-list',
      label: 'My Collections (empty)',
      async run(d) {
        await d.get(baseUrl + '/collection');
        await d.wait(until.elementLocated(By.css('.list-header')), 15000);
        await sleep(2000);
      },
    },
    {
      id: 'new-collection',
      label: 'New Collection dialog',
      async run(d) {
        const btn = await findFirst(d, ['.empty-state .create-btn', '.create-btn']);
        await tap(d, btn);
        await sleep(1500);
      },
    },
    {
      id: 'collection-created',
      label: 'Collection created, in the list',
      async run(d) {
        const input = await findFirst(d, ['.modal input[type="text"]', 'input[type="text"]']);
        await input.sendKeys('Mobile Test Collection');
        await sleep(600);
        const submit = await findFirst(d, [
          '.modal button[type="submit"]',
          'button[type="submit"]',
          '.modal .submit-btn',
        ]);
        await tap(d, submit);
        await d.wait(until.elementLocated(By.css('.collection-card')), 20000);
        await sleep(2500);
      },
    },
    {
      id: 'collection-detail',
      label: 'Collection detail (empty)',
      async run(d) {
        const card = await findFirst(d, ['.collection-card']);
        await tap(d, card);
        await d.wait(async () => /\/collection\/[^/]+$/.test(await d.getCurrentUrl()), 20000);
        await sleep(3500);
      },
    },
  ],
};

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
    console.error('No E2E_USERNAME/E2E_PASSWORD in e2e/.env — these flows need an account.');
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
      await sleep(1500);

      for (const flow of [DECK_FLOW, COLLECTION_FLOW]) {
        console.log(`  -- ${flow.label} --`);
        let n = 0;
        for (const step of flow.steps) {
          n += 1;
          const idx = String(n).padStart(2, '0');
          try {
            await step.run(d);
            const audit = await d.executeScript(AUDIT);
            const file = path.join(devDir, `flow-${flow.id}-${idx}-${step.id}.png`);
            fs.writeFileSync(file, await d.takeScreenshot(), 'base64');
            results.push({
              device: device.id,
              deviceLabel: device.label,
              flow: flow.id,
              flowLabel: flow.label,
              step: step.id,
              label: step.label,
              order: n,
              vw: device.width,
              file: path.relative(outDir, file).replace(/\\/g, '/'),
              ...audit,
            });
            const bad = audit.offscreen.length;
            console.log(
              `    ${idx} ${step.id.padEnd(20)} ${bad ? bad + ' OFF-SCREEN: ' + audit.offscreen[0].sel : 'ok'}`,
            );
          } catch (e) {
            const file = path.join(devDir, `flow-${flow.id}-${idx}-${step.id}-FAILED.png`);
            await d
              .takeScreenshot()
              .then((p) => fs.writeFileSync(file, p, 'base64'))
              .catch(() => {});
            console.log(`    ${idx} ${step.id.padEnd(20)} BLOCKED: ${e.message.split('\n')[0]}`);
            results.push({
              device: device.id,
              flow: flow.id,
              flowLabel: flow.label,
              step: step.id,
              label: step.label,
              order: n,
              error: e.message.split('\n')[0],
              file: fs.existsSync(file) ? path.relative(outDir, file).replace(/\\/g, '/') : null,
              vw: device.width,
              deviceLabel: device.label,
            });
            break; // a broken step invalidates the rest of the flow
          }
        }
      }
    } finally {
      await d.quit();
    }
  }

  fs.writeFileSync(path.join(outDir, 'flows.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} flow steps to ${outDir}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
