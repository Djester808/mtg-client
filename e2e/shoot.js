#!/usr/bin/env node
//
// Mobile capture + layout audit.
//
//   node shoot.js                          # every device, every reachable route
//   node shoot.js --devices=iphone-se,pixel-8
//   node shoot.js --routes=home,deck --dpr=1
//
// Writes screenshots/<device>/<route>.png and screenshots/results.json.
//
// The screenshots are the obvious output, but the audit is the useful one. A picture of
// a broken phone layout tells you it is broken; `overflow` and `causes` tell you which
// element did it, which is the difference between "deck detail looks wrong" and "the
// 340px-min search panel is forcing a 232px horizontal scroll".
//
// Requires the dev client and API to be running (4200 / 7001). Routes behind authGuard
// are skipped unless e2e/.env supplies E2E_USERNAME and E2E_PASSWORD.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const ROUTES = [
  { id: 'home', path: '/', auth: false, label: 'Home / search' },
  { id: 'login', path: '/login', auth: false, label: 'Sign in' },
  { id: 'register', path: '/register', auth: false, label: 'Create account' },
  { id: 'kb', path: '/kb', auth: false, label: 'Knowledge base' },
  { id: 'forum', path: '/community/forum', auth: false, label: 'Community — forum' },
  { id: 'commanders', path: '/community/commanders', auth: false, label: 'Community — commanders' },
  { id: 'players', path: '/community/players', auth: false, label: 'Community — players' },
  { id: 'collection', path: '/collection', auth: true, label: 'Collection list' },
  { id: 'deck', path: '/deck', auth: true, label: 'Deck list' },
  // A public profile needs a real user to point at, so it rides on the same credentials
  // the auth routes use — not because the page needs a login (it does not), but because
  // that is the one username this harness knows exists. `auth: true` is what makes it get
  // skipped, with a reason, when e2e/.env is absent, rather than capturing a 404 page.
  {
    id: 'profile',
    path: `/u/${username || 'unknown'}`,
    auth: true,
    label: 'Public profile',
    ready: '.up-page .up-tabs',
  },
  {
    id: 'account',
    path: '/account',
    auth: true,
    label: 'Account — edit profile',
    ready: '.pe-page .pe-card',
  },
  // Only the first step is captured. The commander and review steps each sit behind a
  // minutes-long model call that costs real money, which is not something a capture run
  // should spend on every invocation.
  {
    id: 'ai-builder',
    path: '/deck/build',
    auth: true,
    label: 'Deck — build with AI',
    ready: '.ab-page .ab-card',
  },
];

// ---- Browser-side audit -------------------------------------------------------------
//
// Self-contained on purpose: it is serialised into the page, so it can close over
// nothing from this file.
const AUDIT = `
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  // Past the viewport is only a DEFECT when it is also unreachable. An element inside a
  // strip that scrolls sideways still reports a rect beyond the screen, but a thumb can
  // bring it into view - that is the intended mobile treatment for tab bars, not a bug.
  //
  // The trap this walked into first time round: it accepted ANY scrollable ancestor,
  // including the page's own content column. Sideways-scrolling the whole page is the
  // single most obvious mobile defect there is, and excusing it made kb - whose content
  // pane was squeezed to 135px and scrolled 128px - report a clean bill of health.
  //
  // So a scroller only counts as deliberate when it is a STRIP: short relative to the
  // viewport. A tab bar or chip row is ~70px tall; a page content column fills the
  // screen. Height is what separates them, and it needs no per-app selector list.
  const vh = window.innerHeight;
  const isStrip = (el) => el.clientHeight > 0 && el.clientHeight < vh * 0.5;
  const reachableByScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (p === document.body) continue;
      const ox = getComputedStyle(p).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
        return isStrip(p);
      }
    }
    return false;
  };

  // The page column scrolling sideways at all. Reported on its own because it is a
  // whole-page defect rather than an element one, and because a route can have zero
  // clipped elements and still slide left-right under the thumb.
  const pageScrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox !== 'auto' && ox !== 'scroll') || el.scrollWidth <= el.clientWidth + 1) continue;
    if (isStrip(el)) continue;
    pageScrollers.push({
      sel: describe(el),
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      over: el.scrollWidth - el.clientWidth,
    });
    if (pageScrollers.length >= 4) break;
  }

  // Only report the element that *originates* the overflow. A wide child drags every
  // ancestor's scrollWidth with it, so listing all of them buries the one you can fix:
  // an offender counts only when its parent still fits.

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

  const causes = [];
  let reachable = 0;
  let decorative = 0;
  let collapsed = 0;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    const p = el.parentElement;
    if (p && p !== document.body) {
      const pr = p.getBoundingClientRect();
      if (pr.right > vw + 1 || pr.left < -1) continue;
    }
    if (insideCollapsed(el)) { collapsed++; continue; }
    if (reachableByScroll(el)) { reachable++; continue; }

    // Ambient decoration is SUPPOSED to bleed off the edge — the blurred background orbs
    // on kb and the community pages are 600px by design and would be reported forever.
    // Nothing with no text and nothing focusable inside it can strand functionality, so
    // it is counted separately rather than mixed in with real defects.
    const hasText = el.textContent.trim().length > 0;
    const hasControls = el.querySelector('a,button,input,select,textarea,[tabindex]');
    if (!hasText && !hasControls) { decorative++; continue; }

    causes.push({
      sel: describe(el),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
    });
    if (causes.length >= 12) break;
  }

  // Touch targets. 44px is the Apple HIG floor and close enough to Android's 48dp to
  // use as one number. Disabled and hidden controls are exempt.
  const small = [];
  for (const el of document.querySelectorAll('a,button,input,select,textarea,[role="button"]')) {
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    small.push({ sel: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
  }

  return {
    vw,
    docW,
    // Document-level overflow, and it is a trap: this app's shell is a 100vh flex column
    // whose body sets overflow:hidden (see .detail-body in global.scss), so content that
    // runs past the right edge is CLIPPED rather than made scrollable. docW therefore
    // never exceeds vw and this number reads 0 on a page whose navbar is half off-screen.
    // The causes list is the metric that means anything here - it measures against the
    // viewport directly, so it still sees what the shell clipped into unreachability.
    // (No backticks in this comment: it lives inside a template literal.)
    overflow: Math.max(0, docW - vw),
    clipped: causes.length,
    // Off-screen but scrollable-to. Not defects - reported so a drop in the clipped
    // count is never mistaken for content having quietly vanished.
    reachable,
    decorative,
    collapsed,
    pageScrollers,
    causes,
    smallTargets: small.length,
    smallSample: small.slice(0, 8),
    scrollH: document.documentElement.scrollHeight,
    title: document.title,
    url: location.pathname,
  };
`;

// ---- Helpers ------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { dpr: null, devices: null, routes: null };
  for (const a of argv.slice(2)) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'dpr') out.dpr = Number(m[2]);
    if (m[1] === 'devices') out.devices = m[2].split(',').map((s) => s.trim());
    if (m[1] === 'routes') out.routes = m[2].split(',').map((s) => s.trim());
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the SPA to have painted something real. readyState alone is useless here —
 * every route is lazy (loadComponent), so the document is "complete" long before the
 * chunk has landed and rendered.
 */
async function settle(driver) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await driver
      .executeScript(
        `const r = document.querySelector('app-root');
         return document.readyState === 'complete' && !!r && r.children.length > 0;`,
      )
      .catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  // Card art and fonts land after the component does, and both move layout.
  await driver
    .executeScript(
      `return Promise.race([
         Promise.all([
           document.fonts ? document.fonts.ready : Promise.resolve(),
           ...Array.from(document.images).filter(i => !i.complete).map(i =>
             new Promise(res => { i.addEventListener('load', res, {once:true});
                                  i.addEventListener('error', res, {once:true}); })),
         ]),
         new Promise(res => setTimeout(res, 6000)),
       ]).then(() => true);`,
    )
    .catch(() => null);
  await sleep(600);
}

// ---- Main ---------------------------------------------------------------------------

(async () => {
  const args = parseArgs(process.argv);
  const devices = DEVICES.filter((d) => !args.devices || args.devices.includes(d.id));
  const haveCreds = Boolean(username && password);
  const routes = ROUTES.filter((r) => !args.routes || args.routes.includes(r.id)).filter(
    (r) => !r.auth || haveCreds,
  );

  const skipped = ROUTES.filter((r) => r.auth && !haveCreds).map((r) => r.id);
  if (skipped.length) {
    console.log(`! No E2E_USERNAME/E2E_PASSWORD in e2e/.env — skipping: ${skipped.join(', ')}`);
  }

  const outDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const device of devices) {
    console.log(`\n=== ${device.label} (${device.width}x${device.height}) ===`);
    const devDir = path.join(outDir, device.id);
    fs.mkdirSync(devDir, { recursive: true });

    const driver = await buildDriver({ device, dpr: args.dpr ?? undefined });
    try {
      if (haveCreds) {
        try {
          await loginAs(driver);
        } catch (e) {
          console.log(`  ! login failed (${e.message}) — auth routes will redirect`);
        }
      }

      for (const route of routes) {
        try {
          await driver.get(baseUrl + route.path);
          // `ready` names an element that only exists once the page's data has arrived.
          // Without it a route whose content comes from a second request is photographed
          // as its own loading state, and the audit measures a layout no user sees.
          if (route.ready) {
            await driver.wait(until.elementLocated(By.css(route.ready)), 15000);
          }
          await settle(driver);

          const audit = await driver.executeScript(AUDIT);
          const png = await driver.takeScreenshot();
          const file = path.join(devDir, `${route.id}.png`);
          fs.writeFileSync(file, png, 'base64');

          results.push({
            device: device.id,
            deviceLabel: device.label,
            os: device.os,
            viewport: `${device.width}x${device.height}`,
            route: route.id,
            routeLabel: route.label,
            file: path.relative(outDir, file).replace(/\\/g, '/'),
            ...audit,
          });

          const worst = audit.causes.reduce((m, c) => Math.max(m, c.right - audit.vw), 0);
          const bits = [];
          if (audit.clipped) bits.push(`${audit.clipped} CLIPPED (worst +${worst}px)`);
          if (audit.pageScrollers.length) {
            const w = audit.pageScrollers[0];
            bits.push(`PAGE SCROLLS X ${w.sel} +${w.over}px`);
          }
          const flag = bits.length ? bits.join(' | ') : 'ok';
          const scrollNote = audit.reachable ? ` (+${audit.reachable} in strips)` : '';
          console.log(`  ${route.id.padEnd(12)} ${flag}${scrollNote}`);
        } catch (e) {
          console.log(`  ${route.id.padEnd(12)} FAILED: ${e.message}`);
          results.push({
            device: device.id,
            deviceLabel: device.label,
            route: route.id,
            routeLabel: route.label,
            error: e.message,
          });
        }
      }
    } finally {
      await driver.quit();
    }
  }

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} shots to ${outDir}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
