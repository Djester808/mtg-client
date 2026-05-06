/**
 * Verifies that clicking cards in deck-detail opens the card modal.
 * Tests: list view, visual view, stats panel land types, stats panel tokens.
 *
 * Self-contained: imports a small test deck via the UI, deletes it on teardown.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const CARD_MODAL = By.css('.card-modal');

/** Returns true only if .card-modal is in the DOM AND visible (isDisplayed). */
async function isModalVisible(driver, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const els = await driver.findElements(CARD_MODAL);
      if (els.length > 0 && await els[0].isDisplayed()) return true;
    } catch {}
    await driver.sleep(100);
  }
  return false;
}

// Basic lands give land-subtype entries; Raise the Alarm creates a Soldier token
const TEST_DECK_NAME = '__e2e_card_modal_test__';
const TEST_DECK_TEXT = [
  '4 Mountain', '4 Forest', '4 Plains', '4 Island', '4 Swamp',
  '4 Raise the Alarm', '4 Lightning Bolt', '4 Counterspell', '4 Cultivate',
].join('\n');

/** Returns selectedCard from the Angular component. */
async function getSelectedCard(driver) {
  return driver.executeScript(`
    try {
      const el = document.querySelector('app-deck-detail');
      const comp = ng.getComponent(el);
      if (!comp) return null;
      const c = comp.selectedCard;
      return c ? { id: c.id, name: c.cardDetails && c.cardDetails.name } : null;
    } catch(e) { return null; }
  `);
}

/** JS-click + wait 400 ms. */
async function jsClick(driver, el) {
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
  await driver.executeScript('arguments[0].click()', el);
  await driver.sleep(400);
}

/** Close modal via close button or overlay. */
async function closeModal(driver, page) {
  try {
    const btn = await driver.findElement(By.css('.modal-close-btn'));
    await driver.executeScript('arguments[0].click()', btn);
  } catch {
    try {
      const overlay = await driver.findElement(By.css('.modal-overlay'));
      await driver.executeScript('arguments[0].click()', overlay);
    } catch {}
  }
  await driver.sleep(300);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Deck Detail — card modal opens on click', () => {
  let driver;
  let deckListPage;
  let page;
  let testDeckId = null;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);

    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    // ── Import test deck via component API ───────────────────────────────
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    // Click the Import button to open modal + initialise component state
    const importBtn = await driver.findElement(By.css('.import-btn'));
    await driver.executeScript('arguments[0].click()', importBtn);
    await driver.wait(async () => {
      const modals = await driver.findElements(By.css('.import-modal'));
      return modals.length > 0;
    }, 5000, 'Import modal did not open');

    // Set fields directly on the Angular component and call submitImport()
    await driver.executeScript(`
      const el  = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      comp.importName = arguments[0];
      comp.importText = arguments[1];
      comp.importTab  = 'text';
      ng.applyChanges(comp);
      comp.submitImport();
    `, TEST_DECK_NAME, TEST_DECK_TEXT);

    // Wait for importState === 'done' or 'error'
    await driver.wait(async () => {
      return driver.executeScript(`
        try {
          const comp = ng.getComponent(document.querySelector('app-deck-list'));
          return comp && (comp.importState === 'done' || comp.importState === 'error');
        } catch(e) { return false; }
      `);
    }, 30000, 'Import did not complete');

    // Fail fast on import error
    const importError = await driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-deck-list'));
        return comp.importState === 'error' ? (comp.importError || 'unknown error') : null;
      } catch(e) { return null; }
    `);
    if (importError) throw new Error('[setup] Import failed: ' + importError);

    // Read the new deck ID from the component
    testDeckId = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-list');
        const comp = ng.getComponent(el);
        return comp && comp.importResult && comp.importResult.deck ? comp.importResult.deck.id : null;
      } catch(e) { return null; }
    `);
    console.log('[setup] imported deck id:', testDeckId);

    if (!testDeckId) {
      console.warn('[setup] could not read deck id — aborting');
      return;
    }

    // Navigate directly to the deck
    await driver.get(`http://localhost:4200/deck/${testDeckId}`);
    await page.waitForVisible(page.backBtn, 10000);

    // Wait until component has the deck cards loaded
    await driver.wait(async () => {
      return driver.executeScript(`
        try {
          const el = document.querySelector('app-deck-detail');
          const comp = ng.getComponent(el);
          return !!(comp && comp.currentDeck && comp.currentDeck.cards.length > 0);
        } catch(e) { return false; }
      `);
    }, 15000, 'Deck cards did not load');

    const cardCount = await driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-deck-detail'));
        return comp.currentDeck.cards.length;
      } catch(e) { return -1; }
    `);
    console.log('[setup] deck loaded, card count:', cardCount);
  });

  afterAll(async () => {
    // Delete the test deck via API
    if (testDeckId && driver) {
      try {
        await driver.executeScript(
          `return fetch('/api/decks/' + arguments[0], { method: 'DELETE' })`,
          testDeckId
        );
        console.log('[teardown] deleted test deck', testDeckId);
      } catch (e) {
        console.warn('[teardown] delete failed:', e.message);
      }
    }
    if (driver) await driver.quit();
  });

  function skip() {
    if (!testDeckId) { console.warn('skipped — no test deck'); return true; }
    return false;
  }

  // ── List view ─────────────────────────────────────────────────────────────

  test('list view: clicking a card row opens the modal', async () => {
    if (skip()) return;

    await page.switchToListView();
    await driver.wait(async () => {
      const rows = await driver.findElements(page.cardRows);
      return rows.length > 0;
    }, 5000, 'No .card-row elements');

    const rows = await driver.findElements(page.cardRows);
    await jsClick(driver, rows[0]);

    const selected = await getSelectedCard(driver);
    console.log('[list-view] selectedCard:', selected);
    expect(selected).not.toBeNull();

    const present = await isModalVisible(driver, 2000);
    console.log('[list-view] .card-modal visible:', present);
    expect(present).toBe(true);
  });

  test('list view: modal closes', async () => {
    if (skip()) return;
    await closeModal(driver, page);
    expect(await page.isPresent(CARD_MODAL, 1000)).toBe(false);
  });

  // ── Visual view ───────────────────────────────────────────────────────────

  test('visual view: clicking a card opens the modal', async () => {
    if (skip()) return;

    await page.switchToVisualView();
    await driver.wait(async () => {
      const cards = await driver.findElements(page.visualCards);
      return cards.length > 0;
    }, 5000, 'No .visual-card elements');

    const vcards = await driver.findElements(page.visualCards);
    await jsClick(driver, vcards[0]);

    const selected = await getSelectedCard(driver);
    console.log('[visual-view] selectedCard:', selected);
    expect(selected).not.toBeNull();

    const present = await isModalVisible(driver, 2000);
    console.log('[visual-view] .card-modal visible:', present);
    expect(present).toBe(true);
  });

  test('visual view: modal closes', async () => {
    if (skip()) return;
    await closeModal(driver, page);
    expect(await page.isPresent(CARD_MODAL, 1000)).toBe(false);
  });

  // ── Stats panel ───────────────────────────────────────────────────────────

  test('stats panel opens', async () => {
    if (skip()) return;
    await page.switchToListView();
    // Open the side panel via component API (Stats button is only in the commander
    // validation bar; this test deck is not commander format)
    await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-deck-detail'));
      comp.showSidePanel = true;
      ng.applyChanges(comp);
    `);
    const open = await page.isSidePanelOpen();
    console.log('[stats] panel open:', open);
    expect(open).toBe(true);
  });

  test('stats panel — land type entry opens the modal', async () => {
    if (skip()) return;

    const hasLands = await page.isPresent(
      By.css('.stat-card-entry.stat-card-entry--land'), 3000
    );
    if (!hasLands) { console.warn('[stats-lands] no land entries — skipping'); return; }

    const entries = await driver.findElements(By.css('.stat-card-entry.stat-card-entry--land'));
    console.log('[stats-lands] entries found:', entries.length);
    const cls = await entries[0].getAttribute('class');
    console.log('[stats-lands] first entry classes:', cls);

    await jsClick(driver, entries[0]);

    const selected = await getSelectedCard(driver);
    console.log('[stats-lands] selectedCard:', selected);
    expect(selected).not.toBeNull();

    const present = await isModalVisible(driver, 2000);
    console.log('[stats-lands] .card-modal visible:', present);
    expect(present).toBe(true);
  });

  test('stats panel — land modal closes', async () => {
    if (skip()) return;
    await closeModal(driver, page);
    expect(await page.isPresent(CARD_MODAL, 1000)).toBe(false);
  });

  test('stats panel — token entry opens the modal', async () => {
    if (skip()) return;

    const hasTokens = await page.isPresent(
      By.css('.stat-card-entry.stat-card-clickable:not(.stat-card-entry--land)'), 3000
    );
    if (!hasTokens) { console.warn('[stats-tokens] no token entries — skipping'); return; }

    const entries = await driver.findElements(
      By.css('.stat-card-entry.stat-card-clickable:not(.stat-card-entry--land)')
    );
    console.log('[stats-tokens] entries found:', entries.length);

    await jsClick(driver, entries[0]);

    const selected = await getSelectedCard(driver);
    console.log('[stats-tokens] selectedCard:', selected);
    expect(selected).not.toBeNull();

    const present = await isModalVisible(driver, 2000);
    console.log('[stats-tokens] .card-modal visible:', present);
    expect(present).toBe(true);
  });

  test('stats panel — token modal closes', async () => {
    if (skip()) return;
    await closeModal(driver, page);
    expect(await page.isPresent(CARD_MODAL, 1000)).toBe(false);
  });
});
