#!/usr/bin/env node
//
// Interaction-state capture.
//
//   node shoot-states.js [--devices=iphone-se,pixel-8] [--dpr=1] [--only=id,prefix]
//
// shoot.js only ever sees a route's initial paint. Everything a user actually opens —
// modals, view-mode toggles, scrolled tab strips — is a layout that has never been
// measured at phone width. This drives those states and audits each one.
//
// Writes screenshots/<device>/state-<id>.png and screenshots/states.json.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay, paceAiBuildReplay } = require('./helpers/ai-build-replay');
const { armGameReplay } = require('./helpers/game-replay');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same viewport-relative audit shoot.js uses, minus the root-cause narrowing: inside an
// opened overlay we want everything that sits off-screen, not just the origin.
const AUDIT = `
  const vw = window.innerWidth, vh = window.innerHeight;
  const describe = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const root = document.querySelector(arguments[0]);
  if (!root) return { missing: true };
  const r = root.getBoundingClientRect();
  const off = [];
  for (const el of root.querySelectorAll('*')) {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.right > vw + 1 || b.left < -1) off.push({ sel: describe(el), l: Math.round(b.left), r: Math.round(b.right) });
    if (off.length >= 6) break;
  }
  const small = [];
  for (const el of root.querySelectorAll('a,button,input,select,textarea,[role="button"]')) {
    if (el.disabled) continue;
    // Untappable by construction, so not a tap target. pointer-events:none, opacity:0 and
    // visibility:hidden are how a custom file picker hides its <input> behind a styled
    // label — the avatar upload does exactly that at 1x1, which the width<1 guard misses
    // by a pixel and which nobody can tap anyway.
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    // A checkbox or radio wrapped in a label is not the tap target — the label is, and
    // tapping anywhere on it works. Measuring the 13x13 glyph inside a 44px label reports
    // a miss that cannot happen.
    if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
      const lb = el.closest('label').getBoundingClientRect();
      if (lb.width >= 44 && lb.height >= 44) continue;
    }
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.width >= 44 && b.height >= 44) continue;
    small.push({ sel: describe(el), w: Math.round(b.width), h: Math.round(b.height) });
  }
  // Vertical overflow only means something for a pinned overlay. A list of 40 posts is
  // taller than the screen by design; a modal taller than the screen has controls you
  // cannot reach, because it does not scroll with the page.
  const pos = getComputedStyle(root).position;
  const pinned = pos === 'fixed' || pos === 'absolute';
  return {
    vw, vh, pinned,
    box: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    overflowsX: r.right > vw + 1 || r.left < -1,
    overflowsY: pinned && (r.bottom > vh + 1 || r.top < -1),
    offscreenChildren: off,
    smallTargets: small.length,
    // Distinct kinds — see the note in shoot.js.
    smallSelectors: [...new Set(small.map((s) => s.sel))].length,
    smallSample: small.slice(0, 5),
  };
`;

/**
 * Signs in once per driver, if the app is not already holding a token.
 *
 * Every other state here is a public route. The AI builder is not, and repeating a login
 * for each of its five states would spend most of the run on the login form.
 */
async function ensureSignedIn(d) {
  await d.get(baseUrl + '/login');
  await sleep(600);
  const token = await d.executeScript("return localStorage.getItem('auth_token')");
  if (token) return;

  await d.wait(until.elementLocated(By.id('username')), 15000);
  await d.findElement(By.id('username')).sendKeys(username);
  await d.findElement(By.id('password')).sendKeys(password);
  await d.findElement(By.css('.submit-btn')).click();
  await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
  await sleep(800);
}

/**
 * Drives the builder to its shortlist, from recorded server output.
 *
 * See helpers/ai-build-replay.js for why this is replayed rather than run: a live journey
 * is three Opus 5 calls and about three minutes, to measure a layout the client decides on
 * its own.
 */
async function toSuggestions(d) {
  await armAiBuildReplay(d);
  await ensureSignedIn(d);
  await d.get(baseUrl + '/deck/build');
  await d.wait(until.elementLocated(By.css('.ab-textarea')), 20000);
  await sleep(900);
  await d.findElement(By.css('.ab-textarea')).sendKeys('wolf tribal');
  await d.executeScript("document.querySelector('.ab-go').click();");
  await d.wait(until.elementLocated(By.css('.ab-cmd')), 20000);
  await sleep(900);
}

/** Shortlist, then build the first commander and wait for the review list. */
async function toReview(d) {
  await toSuggestions(d);
  await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
  await d.wait(until.elementLocated(By.css('.ab-row-btn')), 30000);
  await sleep(1200);
}

/** Each state: navigate, drive it open, then audit the named root element. */
const STATES = [
  {
    id: 'game-lobby',
    label: 'Play — start a game',
    root: '.gl-page',
    extra: `return {
      decks: document.querySelectorAll('.gl-select option').length,
      invites: document.querySelectorAll('.gl-invite').length,
    };`,
    async drive(d) {
      await armGameReplay(d);
      await ensureSignedIn(d);
      await d.get(baseUrl + '/play');
      await d.wait(until.elementLocated(By.css('.gl-page')), 20000);
      await sleep(900);
    },
  },
  {
    id: 'game-board-combat',
    label: 'Game board — declaring attackers',
    root: '.gb-root',
    extra: `return {
      attackButton: !!Array.from(document.querySelectorAll('.gb-btn-primary'))
        .find((b) => /attack/i.test(b.textContent || '')),
    };`,
    async drive(d) {
      await armGameReplay(d, { currentStep: 'DeclareAttackers' });
      await ensureSignedIn(d);
      await d.get(baseUrl + '/play/11111111-2222-3333-4444-555555555555');
      // The board seeds from REST and then waits on a socket that will not connect, so the
      // action bar settles a beat after .gb-root appears. 900ms caught it mid-render once.
      await d.wait(until.elementLocated(By.css('.gb-actions button')), 20000);
      await sleep(1500);
    },
  },
  {
    id: 'game-board',
    label: 'Game board — mid-turn, stack of two',
    // The whole board: what matters at 375 is whether the column of strips, two battlefields
    // and a panning hand all fit the viewport at once, which is a page-level question.
    root: '.gb-root',
    extra: `return {
      handCards: document.querySelectorAll('.gb-card').length,
      stackDepth: document.querySelectorAll('.gb-stack-item').length,
      permanents: document.querySelectorAll('.gb-permanent').length,
      handPans: (() => {
        const hand = document.querySelector('.gb-hand');
        return hand ? hand.scrollWidth > hand.clientWidth : false;
      })(),
      // The audit's own leak check: the opponent's hand is null in the fixture, so any card
      // element beyond the viewer's seven would mean the board invented one.
      opponentHandShown: document.querySelectorAll('.gb-opponents .gb-card').length,
    };`,
    async drive(d) {
      await armGameReplay(d);
      await ensureSignedIn(d);
      await d.get(baseUrl + '/play/11111111-2222-3333-4444-555555555555');
      await d.wait(until.elementLocated(By.css('.gb-root')), 20000);
      await sleep(900);
    },
  },
  {
    id: 'ai-build-brief',
    label: 'AI builder — brief form',
    root: '.ab-card',
    async drive(d) {
      await armAiBuildReplay(d);
      await ensureSignedIn(d);
      await d.get(baseUrl + '/deck/build');
      await d.wait(until.elementLocated(By.css('.ab-textarea')), 20000);
      await sleep(1200);
    },
  },
  {
    id: 'ai-build-suggestions',
    label: 'AI builder — commander shortlist (10)',
    // The whole page: the shortlist's own <section> carries no class, and the audit that
    // matters here is whether ten tiles overflow 375px, which is a page-level question.
    root: '.ab-page',
    // Ten, not the four this screen had only ever been looked at with. The shortlist is
    // capped at twelve, so ten is the count the layout actually has to survive.
    extra: `return {
      commanders: document.querySelectorAll('.ab-cmd').length,
      firstTileHeight: Math.round((document.querySelector('.ab-cmd') || {getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
    };`,
    async drive(d) {
      await toSuggestions(d);
    },
  },
  {
    id: 'ai-build-progress',
    label: 'AI builder — building',
    root: '.ab-page',
    extra: `const bar = document.querySelector('.ab-bar, .ab-track > *');
      const stage = document.querySelector('.ab-stage');
      return {
        stage: stage ? stage.textContent.trim() : null,
        barWidth: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        indeterminate: bar ? bar.classList.contains('is-indeterminate') : null,
      };`,
    async drive(d) {
      await toSuggestions(d);
      // Slowed right down, or there is no such moment to photograph: at full speed the
      // recorded stream lands in about a fifth of a second and the build is over before
      // the bar has painted.
      await paceAiBuildReplay(d);
      await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
      await sleep(2600);
      await d.executeScript(
        "const t = document.querySelector('.ab-track'); if (t) t.scrollIntoView({block:'center'});",
      );
      await sleep(400);
    },
  },
  {
    id: 'ai-build-review',
    label: 'AI builder — review tabs',
    root: '.ab-review',
    extra: `return {
      tabs: Array.from(document.querySelectorAll('.ab-review-tab')).map(t => t.textContent.trim().replace(/\s+/g, ' ')),
      rowsInOpenTab: document.querySelectorAll('.ab-row-btn').length,
    };`,
    async drive(d) {
      await toReview(d);
      // The review block starts ~2,200px down a phone page, so an unscrolled shot is a
      // picture of the summary and tells you nothing about the list.
      await d.executeScript(
        "document.querySelector('.ab-review-tabs').scrollIntoView({block:'start'});",
      );
      await sleep(500);
    },
  },
  {
    id: 'ai-build-card-modal',
    label: 'AI builder — card modal from a review row',
    root: '.card-modal',
    // The real app-card-modal, opened from the plan. A lightbox stood here once and the
    // difference is not visible in a screenshot of the row.
    async drive(d) {
      await toReview(d);
      await d.executeScript("document.querySelector('.ab-row-btn').click();");
      await d.wait(until.elementLocated(By.css('.card-modal')), 15000);
      await sleep(1400);
    },
  },
  {
    id: 'card-modal',
    label: 'Card modal',
    root: '.card-modal',
    // Reached via a commander page, not Home search: /api/cards/search is behind auth and
    // 401s for a logged-out run, while /commanders/:oracleId is public and mounts the
    // same app-card-modal. Same component, same measurements, no credentials needed.
    async drive(d) {
      await d.get(baseUrl + '/community/commanders');
      await d.wait(
        until.elementLocated(By.css('.commander-card, .cl-card, a[href*="/commanders/"]')),
        20000,
      );
      await sleep(2000);
      const first = await d.findElement(
        By.css('a[href*="/commanders/"], .commander-card, .cl-card'),
      );
      await d.executeScript('arguments[0].click();', first);
      await sleep(3500);
      // Any card image on the commander page opens the modal.
      const card = await d.findElement(
        By.css('.card-tile, .cd-card, img[src*="scryfall"], .card-img'),
      );
      await d.executeScript('arguments[0].scrollIntoView({block:"center"});', card);
      await sleep(500);
      await d.executeScript('arguments[0].click();', card);
      await d.wait(until.elementLocated(By.css('.card-modal')), 12000);
      await sleep(1500);
    },
  },
  {
    id: 'forum-filters-collapsed',
    label: 'Forum — filters collapsed (default)',
    root: '.forum-filters',
    async drive(d) {
      await d.get(baseUrl + '/community/forum');
      await d.wait(until.elementLocated(By.css('.forum-filters')), 15000);
      await sleep(2200);
    },
  },
  {
    id: 'forum-filters-open',
    label: 'Forum — filters expanded',
    root: '.forum-filters',
    async drive(d) {
      await d.get(baseUrl + '/community/forum');
      await d.wait(until.elementLocated(By.css('.ff-menu-btn')), 15000);
      await sleep(2000);
      const btn = await d.findElement(By.css('.ff-menu-btn'));
      await d.executeScript('arguments[0].click();', btn);
      await sleep(1200);
    },
  },
  {
    id: 'forum-list-view',
    label: 'Forum — list layout',
    root: '.posts-list',
    async drive(d) {
      await d.get(baseUrl + '/community/forum');
      await d.wait(until.elementLocated(By.css('.ff-view-toggle')), 12000);
      await sleep(1500);
      const btns = await d.findElements(By.css('.ff-view-btn'));
      await d.executeScript('arguments[0].click();', btns[1]); // list
      await d.wait(until.elementLocated(By.css('.posts-list')), 10000);
      await sleep(1200);
    },
  },
  {
    id: 'forum-grid-view',
    label: 'Forum — grid layout',
    root: '.posts-grid',
    async drive(d) {
      await d.get(baseUrl + '/community/forum');
      await d.wait(until.elementLocated(By.css('.ff-view-toggle')), 15000);
      await sleep(1500);
      // Click grid explicitly rather than trusting the default: the view mode persists,
      // so whichever of these two states ran last would decide what the other one sees.
      const btns = await d.findElements(By.css('.ff-view-btn'));
      await d.executeScript('arguments[0].click();', btns[0]);
      await d.wait(until.elementLocated(By.css('.posts-grid')), 10000);
      await sleep(1200);
    },
  },
  {
    id: 'community-tabs-players',
    label: 'Community tabs — landing on the last tab',
    root: '.community-tabs',
    async drive(d) {
      await d.get(baseUrl + '/community/players');
      await d.wait(until.elementLocated(By.css('.community-tabs')), 12000);
      await sleep(1600);
    },
    // The question this state exists to answer: is the ACTIVE tab actually on screen?
    extra: `
      const strip = document.querySelector('.community-tabs');
      const active = strip && strip.querySelector('.community-tab.active');
      if (!strip || !active) return { activeVisible: null };
      const s = strip.getBoundingClientRect(), a = active.getBoundingClientRect();
      return {
        activeLabel: active.textContent.trim(),
        activeVisible: a.left >= s.left - 1 && a.right <= s.right + 1,
        scrollLeft: Math.round(strip.scrollLeft),
        scrollable: strip.scrollWidth > strip.clientWidth + 1,
        fadeClasses: strip.className.match(/can-scroll-(left|right)/g) || [],
      };
    `,
  },
  // ---- Rules knowledge base -------------------------------------------------
  //
  // The page is a master-detail: below $bp-nav the list and the article share one column
  // and replace each other, so "the list fits" says nothing about the article and vice
  // versa. Both halves, all three lists, and the sheet that opens over a card are states
  // shoot.js never reaches — it only ever sees /kb's initial paint.
  {
    id: 'kb-keywords',
    label: 'Rules — keyword list (324 entries)',
    root: '.kb-sidebar',
    async drive(d) {
      await d.get(baseUrl + '/kb');
      await d.wait(until.elementLocated(By.css('.kb-tabs')), 20000);
      await sleep(2000);
      await d.executeScript(
        `[...document.querySelectorAll('.kb-tabs button')]
           .find((b) => b.textContent.trim().toLowerCase() === 'keywords').click();`,
      );
      await sleep(1500);
    },
    // Names are the content of this list. The standard puts ellipsis last, after giving
    // the text the width, so count anything the row had to cut.
    extra: `
      const labels = [...document.querySelectorAll('.sidebar-item .item-label')];
      const cut = labels.filter((l) => l.scrollWidth > l.clientWidth + 1);
      return {
        rows: labels.length,
        truncatedNames: cut.length,
        worst: cut.slice(0, 4).map((l) => l.textContent.trim()),
      };
    `,
  },
  {
    id: 'kb-glossary',
    label: 'Rules — glossary list',
    root: '.kb-sidebar',
    async drive(d) {
      await d.get(baseUrl + '/kb');
      await d.wait(until.elementLocated(By.css('.kb-tabs')), 20000);
      await sleep(2000);
      await d.executeScript(
        `[...document.querySelectorAll('.kb-tabs button')]
           .find((b) => b.textContent.trim().toLowerCase() === 'glossary').click();`,
      );
      await sleep(2000);
    },
  },
  {
    id: 'kb-search',
    label: 'Rules — search results',
    root: '.kb-sidebar',
    async drive(d) {
      await d.get(baseUrl + '/kb');
      await d.wait(until.elementLocated(By.css('.kb-sidebar input')), 20000);
      await sleep(1800);
      const box = await d.findElement(By.css('.kb-sidebar input'));
      await box.click();
      await box.sendKeys('summoning sickness');
      await sleep(2200);
    },
    // A hit is a kind badge, a reference and a snippet on one row; the snippet is the only
    // part allowed to clamp.
    extra: `
      const hits = [...document.querySelectorAll('.sidebar-item.hit')];
      const refs = hits.map((h) => h.querySelector('.hit-ref')).filter(Boolean);
      return {
        hits: hits.length,
        truncatedRefs: refs.filter((r) => r.scrollWidth > r.clientWidth + 1).length,
      };
    `,
  },
  {
    id: 'kb-rule-group',
    label: 'Rules — a rule group, detail pane',
    root: '.kb-detail',
    async drive(d) {
      await d.get(baseUrl + '/kb?group=509');
      await d.wait(until.elementLocated(By.css('app-rule-block')), 20000);
      await sleep(2000);
    },
    // The detail replaces the list on a phone, so the way back has to be present and
    // tappable or the pane is a dead end.
    extra: `
      const back = document.querySelector('.kb-back');
      const b = back && back.getBoundingClientRect();
      return {
        ruleBlocks: document.querySelectorAll('app-rule-block').length,
        subrules: document.querySelectorAll('.subrule').length,
        backVisible: !!back && getComputedStyle(back).display !== 'none',
        backTap: b ? Math.round(b.height) : null,
      };
    `,
  },
  {
    id: 'kb-keyword',
    label: 'Rules — a keyword, detail pane',
    root: '.kb-detail',
    async drive(d) {
      await d.get(baseUrl + '/kb?kw=Cascade');
      await d.wait(until.elementLocated(By.css('.detail-card')), 20000);
      await sleep(2000);
    },
  },
  {
    id: 'keyword-sheet',
    label: 'Keyword sheet over card text',
    root: '.kws-panel',
    // Driven from the commander page for the same reason card-modal is: it renders card
    // text through the same pipe and is public, so this runs without credentials.
    //
    // It walks the list rather than trusting the first entry: plenty of commanders have
    // no keyword at all ("At the beginning of your end step, you may sacrifice...") and
    // a driver that assumed one reported this state as broken when it was working.
    async drive(d) {
      for (let i = 0; i < 8; i++) {
        await d.get(baseUrl + '/community/commanders');
        await d.wait(
          until.elementLocated(By.css('a[href*="/commanders/"], .commander-card, .cl-card')),
          20000,
        );
        await sleep(1800);

        const opened = await d.executeScript(
          `const list = [...document.querySelectorAll('a[href*="/commanders/"], .commander-card, .cl-card')];
           if (!list[arguments[0]]) return false;
           list[arguments[0]].click();
           return true;`,
          i,
        );
        if (!opened) break;
        await sleep(3200);

        const hasKeyword = await d.executeScript(
          `return document.querySelectorAll('a.kw-link').length > 0;`,
        );
        if (!hasKeyword) continue;

        await d.executeScript(
          `const a = document.querySelector('a.kw-link');
           a.scrollIntoView({ block: 'center' });
           a.click();`,
        );
        await d.wait(until.elementLocated(By.css('.kws-panel')), 15000);
        await sleep(1800);
        return;
      }

      throw new Error('no commander in the first 8 renders a keyword in its rules text');
    },
    // Below $bp-phone this is a full-screen sheet, so the backdrop is covered and the X is
    // the only visible way out — it has to clear $tap-min.
    extra: `
      const panel = document.querySelector('.kws-panel');
      const close = document.querySelector('.kws-close');
      const p = panel && panel.getBoundingClientRect();
      const c = close && close.getBoundingClientRect();
      return {
        keyword: document.querySelector('.kws-title')?.textContent.trim() ?? null,
        fullScreen: p ? Math.round(p.width) === window.innerWidth : null,
        closeTap: c ? Math.round(Math.min(c.width, c.height)) : null,
        cardStillBehind: !!document.querySelector('.modal-oracle, .cd-oracle, [class*="oracle"]'),
      };
    `,
  },
  {
    id: 'players-grid',
    label: 'Players — directory grid',
    root: '.pl-grid',
    async drive(d) {
      await d.get(baseUrl + '/community/players');
      await d.wait(until.elementLocated(By.css('.pl-card')), 12000);
      await sleep(1200);
    },
    // Rows carry an avatar, a name and two stat clusters. The question at 375px is whether
    // the stats stay on the row rather than being pushed off its right edge.
    extra: `
      const card = document.querySelector('.pl-card');
      if (!card) return { cards: 0 };
      const stats = card.querySelector('.pl-stats');
      return {
        cards: document.querySelectorAll('.pl-card').length,
        cardWidth: Math.round(card.getBoundingClientRect().width),
        statsInside: stats ? stats.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1 : null,
      };
    `,
  },

  // ---- Profile ---------------------------------------------------------------
  //
  // Two states because the page has two halves that never share the screen: the stat
  // tiles and rails above the tab strip, and whichever tab is open below it.
  {
    id: 'profile-decks',
    label: 'Profile — stats and decks tab',
    root: '.up-page',
    async drive(d) {
      await d.get(baseUrl + '/u/' + (username || 'unknown'));
      await d.wait(until.elementLocated(By.css('.up-tabs')), 12000);
      await sleep(1400);
    },
    // The tiles are the part most likely to overflow: six of them, three across at 375px,
    // each holding a number that grows with the account.
    extra: `
      const tiles = [...document.querySelectorAll('.up-stat')];
      if (!tiles.length) return { tiles: 0 };
      const widths = tiles.map((t) => Math.round(t.getBoundingClientRect().width));
      return {
        tiles: tiles.length,
        perRow: tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - tiles[0].getBoundingClientRect().top) < 2).length,
        minWidth: Math.min(...widths),
      };
    `,
  },
  {
    id: 'profile-comments',
    label: 'Profile — comment history tab',
    root: '.up-page',
    async drive(d) {
      await d.get(baseUrl + '/u/' + (username || 'unknown'));
      await d.wait(until.elementLocated(By.css('.up-tabs')), 12000);
      await sleep(1200);
      const tabs = await d.findElements(By.css('.up-tab'));
      await d.executeScript('arguments[0].click();', tabs[1]);
      await d.wait(until.elementLocated(By.css('.up-comments')), 8000);
      await sleep(900);
    },
  },
];

function parseArgs(argv) {
  const out = { dpr: 1, devices: ['iphone-se', 'pixel-8'], only: null };
  for (const a of argv.slice(2)) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'dpr') out.dpr = Number(m[2]);
    if (m[1] === 'devices') out.devices = m[2].split(',').map((s) => s.trim());
    // Ids or id prefixes. Re-running one state while working on it beat sitting through
    // the whole sheet, and the whole sheet is what you ran to see one screen.
    if (m[1] === 'only')
      out.only = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  const devices = DEVICES.filter((d) => args.devices.includes(d.id));
  const states = args.only
    ? STATES.filter((s) => args.only.some((p) => s.id === p || s.id.startsWith(p)))
    : STATES;
  if (!states.length) {
    console.error(`No states match --only=${args.only.join(',')}`);
    process.exit(1);
  }
  const outDir = path.join(__dirname, 'screenshots');
  const results = [];

  for (const device of devices) {
    console.log(`\n=== ${device.label} (${device.width}x${device.height}) ===`);
    const devDir = path.join(outDir, device.id);
    fs.mkdirSync(devDir, { recursive: true });
    const d = await buildDriver({ device, dpr: args.dpr });
    try {
      for (const state of states) {
        try {
          await state.drive(d);
          const audit = await d.executeScript(AUDIT, state.root);
          const extra = state.extra ? await d.executeScript(state.extra) : null;
          const file = path.join(devDir, `state-${state.id}.png`);
          fs.writeFileSync(file, await d.takeScreenshot(), 'base64');

          results.push({
            device: device.id,
            deviceLabel: device.label,
            state: state.id,
            label: state.label,
            file: path.relative(outDir, file).replace(/\\/g, '/'),
            ...audit,
            extra,
          });

          if (audit.missing) {
            console.log(`  ${state.id.padEnd(24)} root not found (${state.root})`);
          } else {
            const flags = [
              audit.overflowsX ? 'OVERFLOWS-X' : '',
              audit.overflowsY ? 'OVERFLOWS-Y' : '',
            ]
              .filter(Boolean)
              .join(' ');
            console.log(
              `  ${state.id.padEnd(24)} ${String(audit.box.w + 'x' + audit.box.h).padEnd(11)} @${audit.box.l},${audit.box.t} ` +
                `${(flags || 'fits').padEnd(22)} ${audit.smallTargets} small`,
            );
            if (extra) console.log(`      ${JSON.stringify(extra)}`);
          }
        } catch (e) {
          console.log(`  ${state.id.padEnd(24)} FAILED: ${e.message.split('\n')[0]}`);
          results.push({
            device: device.id,
            state: state.id,
            label: state.label,
            error: e.message,
          });
        }
      }
    } finally {
      await d.quit();
    }
  }

  // A filtered run contributes its states and leaves the rest of the file alone. Writing
  // only what this run measured would tell check-ui-audit that every other state had
  // stopped working, which is exactly what happened the first time --only was used.
  const statesFile = path.join(outDir, 'states.json');
  let merged = results;
  if (args.only && fs.existsSync(statesFile)) {
    const measured = new Set(results.map((r) => `${r.device}:${r.state}`));
    let previous = [];
    try {
      previous = JSON.parse(fs.readFileSync(statesFile, 'utf8'));
    } catch {
      previous = [];
    }
    merged = previous.filter((r) => !measured.has(`${r.device}:${r.state}`)).concat(results);
  }

  fs.writeFileSync(statesFile, JSON.stringify(merged, null, 2));
  console.log(
    `
Wrote ${results.length} state(s) to ${outDir}` +
      (args.only ? ` (merged into ${merged.length} total)` : ''),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
