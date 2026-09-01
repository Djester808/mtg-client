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

  // A token that is present is not the same as a token that works. This returned as soon as it
  // found one, so a stale or seeded value was treated as a session — and the first authenticated
  // call of the next state got a 401, the interceptor logged the browser out, and the screen
  // being captured emptied halfway through with nothing on it to say why. That is what had the
  // profile's comment tab failing on every run since it was written.
  const usable = await d.executeAsyncScript(
    [
      'var done = arguments[arguments.length - 1];',
      "var token = localStorage.getItem('auth_token');",
      'if (!token) return done(false);',
      "fetch('/api/profile/me', { headers: { Authorization: 'Bearer ' + token } })",
      '  .then(function (r) { done(r.ok); })',
      '  .catch(function () { done(false); });',
    ].join(''),
  );
  if (usable) return;

  await d.executeScript(
    "localStorage.removeItem('auth_token'); localStorage.removeItem('auth_username');",
  );
  await d.get(baseUrl + '/login');
  await sleep(400);

  await d.wait(until.elementLocated(By.id('username')), 15000);
  await d.findElement(By.id('username')).sendKeys(username);
  await d.findElement(By.id('password')).sendKeys(password);
  await d.findElement(By.css('.submit-btn')).click();
  await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
  await sleep(800);
}

/**
 * Signs in if this machine has credentials, and shrugs if it does not.
 *
 * The game states use this rather than ensureSignedIn because they have a second way in: the
 * replay helper seeds a session of its own. A real sign-in has to be attempted first — the seed
 * only fills an empty slot, and a fake token that outlives the game states logs the browser out
 * of everything that follows — but it must not be the thing that stops the state running.
 */
async function trySignIn(d) {
  if (!username || !password) return false;
  try {
    await ensureSignedIn(d);
    return true;
  } catch {
    console.log('  (no session: sign-in failed, falling back to the replay stub)');
    return false;
  }
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

/**
 * Deals a fresh life-counter table of `count` seats.
 *
 * The clear-and-reload is the point. The counter keeps its table in localStorage, so a run
 * that captured one state opens the *next* one straight onto that table with no setup form
 * in sight — which is the counter working, and the reason four of these states failed the
 * first time they were driven.
 */
async function dealTable(d, count = 4) {
  await d.get(baseUrl + '/tools/life-counter');
  await d.executeScript(
    // Only the counter's own keys. `localStorage.clear()` also takes `auth_token`, which
    // signs the browser out — and the state after this one then captures a logged-out screen
    // with nothing on it to say why.
    "Object.keys(localStorage).filter((k) => k.startsWith('mtg.life-counter'))" +
      '.forEach((k) => localStorage.removeItem(k));',
  );
  await d.get(baseUrl + '/tools/life-counter');
  await d.wait(until.elementLocated(By.css('.setup')), 20000);
  await sleep(300);

  await d.executeScript(
    `
    const groups = [...document.querySelectorAll('.setup-group')];
    const byText = (group, text) => [...group.querySelectorAll('.pick')]
      .find((b) => b.textContent.trim() === text);
    byText(groups[0], String(arguments[0])).click();
    byText(groups[1], '40').click();
  `,
    count,
  );
  await sleep(200);

  await d.executeScript(`document.querySelector('.setup-actions .primary-btn').click();`);
  await d.wait(until.elementLocated(By.css('.lc-grid')), 10000);
  await sleep(600);
}

/** Deals a table and opens the first seat's sheet on the named tab. */
async function openSeatSheet(d, tab = 'Counters') {
  await dealTable(d, 4);
  await d.executeScript(`document.querySelector('.seat-menu').click();`);
  await d.wait(until.elementLocated(By.css('.sheet')), 10000);
  await d.executeScript(
    `[...document.querySelectorAll('.sheet-tab')]
       .find((b) => b.textContent.trim() === arguments[0]).click();`,
    tab,
  );
  await sleep(600);
}

/** Each state: navigate, drive it open, then audit the named root element. */
const STATES = [
  {
    id: 'nav-drawer',
    label: 'Navigation drawer',
    // Where a phone finds anything at all. It had no state of its own, which is how the game
    // came to have routes and no way in: nothing captured the one surface that would have
    // shown a destination missing.
    root: '.mobile-nav',
    extra: `return {
      destinations: [...document.querySelectorAll('.mobile-nav-link')].map((a) =>
        (a.textContent || '').trim(),
      ),
    };`,
    async drive(d) {
      await trySignIn(d);
      await d.get(baseUrl + '/');
      await d.wait(until.elementLocated(By.css('.nav-toggle')), 20000);
      await sleep(600);
      await d.executeScript(`document.querySelector('.nav-toggle').click();`);
      await d.wait(until.elementLocated(By.css('.mobile-nav')), 10000);
      await sleep(700);
    },
  },
  // ---- Life counter ---------------------------------------------------------------------
  //
  // The table is the one layout in the app whose height is divided rather than scrolled, so
  // the audit's usual "taller than the screen is fine" does not apply: at eight seats every
  // panel has to hold a life total, a name and a row of chips inside about 150px, and the
  // only way to know it does is to photograph it.
  //
  // Driven through the UI rather than seeded into storage — the setup form is how a table
  // actually gets dealt, and a state that skipped it would stop covering it.
  {
    id: 'life-counter-8',
    label: 'Life counter — eight players',
    root: '.lc-grid',
    extra: `return {
      panels: document.querySelectorAll('app-player-panel').length,
      flipped: document.querySelectorAll('.panel.is-flipped').length,
      // The number the whole panel is built around. If it has been squeezed under about
      // 26px at eight seats, the layout has stopped working even though nothing overflowed.
      smallestLife: Math.min(...[...document.querySelectorAll('.life')].map(
        (el) => Math.round(parseFloat(getComputedStyle(el).fontSize)))),
    };`,
    async drive(d) {
      await dealTable(d, 8);
    },
  },
  {
    id: 'life-counter-2',
    label: 'Life counter — a duel',
    root: '.lc-grid',
    extra: `return {
      panels: document.querySelectorAll('app-player-panel').length,
      // One column, and the top seat turned to face the player across the table.
      columns: getComputedStyle(document.querySelector('.lc-grid')).gridTemplateColumns.split(' ').length,
      flipped: document.querySelectorAll('.panel.is-flipped').length,
    };`,
    async drive(d) {
      await dealTable(d, 2);
    },
  },
  {
    id: 'life-counter-setup',
    label: 'Life counter — setup',
    root: '.setup',
    async drive(d) {
      await d.get(baseUrl + '/tools/life-counter');
      await d.executeScript(
        // Only the counter's own keys. `localStorage.clear()` also takes `auth_token`, which
        // signs the browser out — and the state after this one then captures a logged-out screen
        // with nothing on it to say why.
        "Object.keys(localStorage).filter((k) => k.startsWith('mtg.life-counter'))" +
          '.forEach((k) => localStorage.removeItem(k));',
      );
      await d.get(baseUrl + '/tools/life-counter');
      await d.wait(until.elementLocated(By.css('.setup')), 20000);
      await sleep(500);
    },
  },
  {
    id: 'life-counter-seat-sheet',
    label: 'Life counter — seat sheet',
    root: '.sheet',
    extra: `return {
      tabs: [...document.querySelectorAll('.sheet-tab')].map((b) => b.textContent.trim()),
      counterRows: document.querySelectorAll('.sheet-body .row').length,
    };`,
    async drive(d) {
      await openSeatSheet(d, 'Counters');
    },
  },
  {
    id: 'life-counter-commander-damage',
    label: 'Life counter — commander damage',
    root: '.sheet',
    extra: `return {
      // One row per opponent commander, not per opponent (CR 702.124d). Three other seats
      // with one commander each, plus the partners toggle, is four rows.
      rows: document.querySelectorAll('.sheet-body .row').length,
    };`,
    async drive(d) {
      await openSeatSheet(d, 'Commander');
    },
  },
  {
    id: 'life-counter-seat-tab',
    label: 'Life counter — seat, signed in',
    root: '.sheet',
    extra: `return {
      // Present only once a seat has signed in; absent on a machine with no credentials,
      // which is a legitimate capture of the same tab rather than a failure.
      recordCells: [...document.querySelectorAll('.record-cell dt')].map((d) => d.textContent.trim()),
      signedIn: !!document.querySelector('.signin-block .row-name'),
    };`,
    async drive(d) {
      await openSeatSheet(d, 'Seat');

      // The record block only exists for a signed-in seat, and signing in at a seat is its
      // own act — the app's session does not confer it, which is the whole point.
      if (!username || !password) return;

      await d.executeScript(`
        const b = [...document.querySelectorAll('.link-btn')]
          .find((x) => /Sign in at this seat/.test(x.textContent));
        if (b) b.click();
      `);
      await sleep(400);
      const form = await d.findElements(By.css('.signin-form input[name="username"]'));
      if (form.length === 0) return;

      await form[0].sendKeys(username);
      await d.findElement(By.css('.signin-form input[name="password"]')).sendKeys(password);
      await d.executeScript(`document.querySelector('.signin-form .primary-btn').click();`);
      await sleep(1600);
    },
  },
  {
    id: 'life-counter-backdrop',
    label: 'Life counter — backdrop picker',
    root: '.picker',
    async drive(d) {
      await openSeatSheet(d, 'Seat');
      await d.executeScript(`
        [...document.querySelectorAll('.link-btn')]
          .find((b) => /picture/i.test(b.textContent)).click();
      `);
      await d.wait(until.elementLocated(By.css('.picker')), 10000);
      await sleep(600);
    },
  },
  {
    id: 'tools-hub',
    label: 'Tools hub',
    root: '.tools',
    async drive(d) {
      await d.get(baseUrl + '/tools');
      await d.wait(until.elementLocated(By.css('.tool-card')), 20000);
      await sleep(500);
    },
  },
  {
    id: 'game-lobby',
    label: 'Play — start a game',
    root: '.gl-page',
    extra: `return {
      decks: document.querySelectorAll('.gl-select option').length,
      invites: document.querySelectorAll('.gl-invite').length,
      // An option whose value is empty looks perfectly fine on screen and addresses nobody.
      // The picker read the public directory, which carries no user id, so every option here
      // was worth undefined and no invitation could be sent at all.
      opponentsWithoutAnId: (() => {
        const select = document.querySelector('select[name="opponent"]');
        if (!select) return null;
        // The first option is the "Choose a player…" placeholder, empty on purpose.
        return [...select.options].slice(1).filter((o) => !o.value || o.value === 'undefined').length;
      })(),
    };`,
    async drive(d) {
      await trySignIn(d);
      await armGameReplay(d);
      await d.get(baseUrl + '/play');
      await d.wait(until.elementLocated(By.css('.gl-page')), 20000);
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

      // Wait for the detail page rather than sleeping at it. The 3.5s guess held while this
      // state ran early in a short run; once the run grew it started clicking whatever was
      // still on screen from the list, and the modal never opened.
      await d.wait(until.elementLocated(By.css('.commander-detail-page')), 20000);
      await d.wait(
        until.elementLocated(By.css('.card-tile, .cd-card, img[src*="scryfall"], .card-img')),
        20000,
      );
      await sleep(800);

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
      // Sign in first, and then look at *that* account's profile.
      //
      // This state never did either: it went straight to /u/<username from .env>, which is
      // empty on a machine without credentials, so every run opened /u/unknown — a profile with
      // no tabs on it — and then waited eight seconds for a panel that could not appear. It has
      // failed on every capture run since it was written.
      const signedIn = await trySignIn(d);
      const who = await d.executeScript('return localStorage.getItem("auth_username");');
      console.log(
        '    (profile-comments: signedIn=' + signedIn + ' who=' + JSON.stringify(who) + ')',
      );
      await d.get(baseUrl + '/u/' + (who || username || 'unknown'));
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
      // By its label, not its position: the index assumed a tab order, and when the click
      // landed on the wrong one this waited eight seconds for a panel that was never going to
      // open. The tab renders its panel whether or not there are any comments in it.
      const clicked = await d.executeScript(
        [
          'var tab = [].slice.call(document.querySelectorAll(".up-tab"))',
          '  .filter(function (t) { return /comment/i.test(t.textContent); })[0];',
          'if (!tab) return null;',
          'tab.click();',
          'return tab.textContent.trim().replace(/\s+/g, " ");',
        ].join(''),
      );
      if (!clicked) {
        throw new Error('no Comments tab on this profile');
      }
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
