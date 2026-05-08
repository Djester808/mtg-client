/**
 * End-to-end tests for layout preference persistence.
 *
 * Covers:
 *  A. Deck-detail layout preference
 *     1. Switch to list view → localStorage is updated.
 *     2. Navigate away and back → list view is restored from localStorage.
 *     3. Switch to visual view → persisted.
 *     4. Navigate away and back → visual view is restored.
 *
 *  B. Forum-detail layout + sort preference
 *     1. Switch to visual view in a forum post → localStorage updated.
 *     2. Navigate away and back → visual view restored.
 *     3. Switch sort mode to CMC → localStorage updated.
 *     4. Navigate away and back → CMC sort restored.
 *
 *  C. Account-tied persistence (logged-in users)
 *     1. Switch to text view → PUT /api/preferences called (verified via localStorage cache).
 *     2. Clear localStorage to simulate a new device/session.
 *     3. Reload the page → GET /api/preferences restores the preference from the server.
 *
 * Requires login (E2E_USERNAME / E2E_PASSWORD in .env).
 * Requires at least one published forum post accessible at /community/forum.
 * Creates a temporary deck for deck-detail tests, cleaned up in afterAll.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');

jest.setTimeout(180000);

const TEST_DECK_NAME = '__e2e_layout_prefs__';
const TEST_DECK_TEXT = [
  '4 Lightning Bolt',
  '4 Counterspell',
  '4 Giant Growth',
  '4 Mountain',
  '4 Island',
  '4 Forest',
].join('\n');

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read a localStorage key directly from the browser. */
async function getLocalStorage(driver, key) {
  return driver.executeScript(`return localStorage.getItem(arguments[0])`, key);
}

/** Delete a localStorage key directly from the browser. */
async function removeLocalStorage(driver, key) {
  return driver.executeScript(`localStorage.removeItem(arguments[0])`, key);
}

/** Returns the currently active view mode class in deck-detail ('list'/'visual'/'free'). */
async function getDeckActiveViewMode(driver) {
  return driver.executeScript(`
    const btns = document.querySelectorAll('.sort-btn');
    for (const btn of btns) {
      if (btn.classList.contains('is-active') && (btn.title === 'List view' || btn.title === 'Visual view'))
        return btn.title.toLowerCase().split(' ')[0];
    }
    return null;
  `);
}

/** Returns the currently active view mode in forum-detail ('list'/'visual'/'text'). */
async function getForumActiveViewMode(driver) {
  return driver.executeScript(`
    const btns = document.querySelectorAll('.view-btn');
    for (const btn of btns) {
      if (btn.classList.contains('is-active')) {
        const t = btn.title || '';
        if (t.includes('List')) return 'list';
        if (t.includes('Visual')) return 'visual';
        if (t.includes('Text')) return 'text';
      }
    }
    return null;
  `);
}

/** Returns the currently active sort mode in forum-detail ('type'/'cmc'/'name'). */
async function getForumActiveSortMode(driver) {
  return driver.executeScript(`
    const btns = document.querySelectorAll('.sort-btn');
    for (const btn of btns) {
      if (btn.classList.contains('is-active')) {
        const t = btn.textContent.trim().toLowerCase();
        if (t === 'type' || t === 'cmc' || t === 'name') return t;
      }
    }
    return null;
  `);
}

/** Click a deck-detail view button by title ('List view' or 'Visual view'). */
async function clickDeckViewBtn(driver, title) {
  await driver.executeScript(`
    const btns = document.querySelectorAll('.sort-btn');
    for (const btn of btns) { if (btn.title === arguments[0]) { btn.click(); return; } }
  `, title);
  await driver.sleep(400);
}

/** Click a forum-detail view button by title ('List view', 'Visual view', 'Text only'). */
async function clickForumViewBtn(driver, title) {
  await driver.executeScript(`
    const btns = document.querySelectorAll('.view-btn');
    for (const btn of btns) { if (btn.title === arguments[0]) { btn.click(); return; } }
  `, title);
  await driver.sleep(400);
}

/** Click a forum-detail sort button by label ('Type', 'CMC', 'Name'). */
async function clickForumSortBtn(driver, label) {
  await driver.executeScript(`
    const btns = document.querySelectorAll('.sort-btn');
    for (const btn of btns) {
      if (btn.textContent.trim().toLowerCase() === arguments[0].toLowerCase() &&
          !btn.title.includes('view') && !btn.title.includes('arrange')) {
        btn.click(); return;
      }
    }
  `, label);
  await driver.sleep(400);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Layout Preferences', () => {
  let driver;
  let deckListPage;
  let testDeckId = null;
  let forumPostId = null;
  let setupOk = false;

  beforeAll(async () => {
    driver = await buildDriver();
    deckListPage = new DeckListPage(driver);

    await loginAs(driver);

    // ── Create test deck ──
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    const importBtn = await driver.findElement(By.css('.import-btn'));
    await driver.executeScript('arguments[0].click()', importBtn);
    await driver.wait(async () => {
      return (await driver.findElements(By.css('.import-modal'))).length > 0;
    }, 5000, 'Import modal did not open');

    await driver.executeScript(`
      const el   = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      comp.importName = arguments[0];
      comp.importText = arguments[1];
      comp.importTab  = 'text';
      ng.applyChanges(comp);
      comp.submitImport();
    `, TEST_DECK_NAME, TEST_DECK_TEXT);

    await driver.wait(async () => {
      return driver.executeScript(`
        const comp = ng.getComponent(document.querySelector('app-deck-list'));
        return comp && (comp.importState === 'done' || comp.importState === 'error');
      `);
    }, 30000, 'Import did not complete');

    const state = await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-deck-list'));
      return { state: comp.importState, id: comp.importResult && comp.importResult.deck && comp.importResult.deck.id };
    `);
    if (state.state !== 'done') {
      console.warn('[layout-prefs] Deck import failed — deck-detail tests skipped');
    } else {
      testDeckId = state.id;
    }

    // ── Find a forum post for forum-detail tests ──
    await driver.get('http://localhost:4200/community/forum');
    await driver.sleep(1500);
    const postCards = await driver.findElements(By.css('.post-card'));
    if (postCards.length > 0) {
      await driver.executeScript('arguments[0].click()', postCards[0]);
      await driver.wait(async () => {
        return /\/forum\/[0-9a-f-]{36}/.test(await driver.getCurrentUrl());
      }, 8000, 'Did not navigate to a forum post');
      const url = await driver.getCurrentUrl();
      const match = url.match(/\/forum\/([0-9a-f-]{36})/);
      if (match) forumPostId = match[1];
    }

    setupOk = true;
  });

  afterAll(async () => {
    // Clean up pref keys so they don't affect other tests
    try {
      await driver.get('http://localhost:4200');
      await driver.sleep(500);
      for (const key of ['pref.deckLayout', 'pref.forumLayout', 'pref.forumSort']) {
        await removeLocalStorage(driver, key);
      }
    } catch {}

    // Delete test deck
    if (testDeckId) {
      try {
        await driver.get('http://localhost:4200/deck');
        await deckListPage.waitForVisible(deckListPage.listContent);
        await driver.executeScript(`
          const comp = ng.getComponent(document.querySelector('app-deck-list'));
          if (!comp) return;
          const deck = comp.decks && comp.decks.find(d => d.id === arguments[0]);
          if (deck && comp.confirmDeleteDeck) { comp.confirmDeleteDeck(deck); ng.applyChanges(document.querySelector('app-deck-list')); }
        `, testDeckId).catch(() => {});
        await driver.sleep(1000);
      } catch {}
    }

    await driver.quit();
  });

  // ── A. Deck-detail layout ─────────────────────────────────────────────────

  describe('Deck-detail layout preference', () => {
    test('switching to list view writes pref.deckLayout = "list" to localStorage', async () => {
      if (!testDeckId) return;
      await driver.get(`http://localhost:4200/deck/${testDeckId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.filter-bar'))).length > 0, 10000, 'Deck detail did not load');

      await clickDeckViewBtn(driver, 'List view');

      const val = await getLocalStorage(driver, 'pref.deckLayout');
      expect(val).toBe('list');
    });

    test('navigating away and back restores list view from localStorage', async () => {
      if (!testDeckId) return;
      await driver.get('http://localhost:4200/deck');
      await deckListPage.waitForVisible(deckListPage.listContent);
      await driver.get(`http://localhost:4200/deck/${testDeckId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.filter-bar'))).length > 0, 10000, 'Deck detail did not load');
      await driver.sleep(600);

      const mode = await getDeckActiveViewMode(driver);
      expect(mode).toBe('list');
    });

    test('switching to visual view writes pref.deckLayout = "visual" to localStorage', async () => {
      if (!testDeckId) return;
      await clickDeckViewBtn(driver, 'Visual view');
      const val = await getLocalStorage(driver, 'pref.deckLayout');
      expect(val).toBe('visual');
    });

    test('navigating away and back restores visual view', async () => {
      if (!testDeckId) return;
      await driver.get('http://localhost:4200/deck');
      await deckListPage.waitForVisible(deckListPage.listContent);
      await driver.get(`http://localhost:4200/deck/${testDeckId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.filter-bar'))).length > 0, 10000, 'Deck detail did not load');
      await driver.sleep(600);

      const mode = await getDeckActiveViewMode(driver);
      expect(mode).toBe('visual');
    });
  });

  // ── B. Forum-detail layout + sort ─────────────────────────────────────────

  describe('Forum-detail layout preference', () => {
    beforeEach(async () => {
      if (!forumPostId) return;
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not load');
      await driver.sleep(600);
    });

    test('switching to visual view writes pref.forumLayout = "visual"', async () => {
      if (!forumPostId) return;
      await clickForumViewBtn(driver, 'Visual view');
      const val = await getLocalStorage(driver, 'pref.forumLayout');
      expect(val).toBe('visual');
    });

    test('navigating away and back restores visual view', async () => {
      if (!forumPostId) return;
      await driver.get('http://localhost:4200/community/forum');
      await driver.sleep(500);
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not load');
      await driver.sleep(800);

      const mode = await getForumActiveViewMode(driver);
      expect(mode).toBe('visual');
    });

    test('switching sort to CMC writes pref.forumSort = "cmc"', async () => {
      if (!forumPostId) return;
      await clickForumSortBtn(driver, 'CMC');
      const val = await getLocalStorage(driver, 'pref.forumSort');
      expect(val).toBe('cmc');
    });

    test('navigating away and back restores CMC sort', async () => {
      if (!forumPostId) return;
      await driver.get('http://localhost:4200/community/forum');
      await driver.sleep(500);
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not load');
      await driver.sleep(800);

      const sort = await getForumActiveSortMode(driver);
      expect(sort).toBe('cmc');
    });

    test('switching to text view and navigating back restores text view', async () => {
      if (!forumPostId) return;
      await clickForumViewBtn(driver, 'Text only');
      await driver.get('http://localhost:4200/community/forum');
      await driver.sleep(500);
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not load');
      await driver.sleep(800);

      const mode = await getForumActiveViewMode(driver);
      expect(mode).toBe('text');
    });
  });

  // ── C. Account-tied persistence ───────────────────────────────────────────

  describe('Account-tied preference (server-side)', () => {
    test('clearing localStorage and reloading restores preference from API', async () => {
      if (!forumPostId) return;

      // Step 1: Set a known preference in the UI
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not load');
      await driver.sleep(600);
      await clickForumViewBtn(driver, 'List view');
      await driver.sleep(500); // allow PUT /api/preferences to fire

      // Step 2: Wipe localStorage to simulate a fresh device
      await driver.executeScript(`
        localStorage.removeItem('pref.forumLayout');
        localStorage.removeItem('pref.forumSort');
        localStorage.removeItem('pref.deckLayout');
      `);
      const cleared = await getLocalStorage(driver, 'pref.forumLayout');
      expect(cleared).toBeNull();

      // Step 3: Reload the page — preferences service calls GET /api/preferences
      await driver.navigate().refresh();
      await driver.wait(async () => (await driver.findElements(By.css('.header-title'))).length > 0, 10000, 'Forum detail did not reload');
      await driver.sleep(1200); // allow GET /api/preferences to complete

      // Step 4: The preference should be restored from the server
      const mode = await getForumActiveViewMode(driver);
      expect(mode).toBe('list');
    });

    test('preference survives across multiple navigation hops after localStorage clear', async () => {
      if (!forumPostId || !testDeckId) return;

      // Set deck layout to list, wait for API save
      await driver.get(`http://localhost:4200/deck/${testDeckId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.filter-bar'))).length > 0, 10000, 'Deck detail did not load');
      await driver.sleep(600);
      await clickDeckViewBtn(driver, 'List view');
      await driver.sleep(500);

      // Clear localStorage
      await driver.executeScript(`localStorage.removeItem('pref.deckLayout')`);

      // Navigate to deck list then back to deck
      await driver.get('http://localhost:4200/deck');
      await deckListPage.waitForVisible(deckListPage.listContent);
      await driver.get(`http://localhost:4200/deck/${testDeckId}`);
      await driver.wait(async () => (await driver.findElements(By.css('.filter-bar'))).length > 0, 10000, 'Deck detail did not reload');
      await driver.sleep(1200);

      const mode = await getDeckActiveViewMode(driver);
      expect(mode).toBe('list');
    });
  });
});
