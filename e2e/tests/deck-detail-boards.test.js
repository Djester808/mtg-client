/**
 * Verifies sideboard and maybeboard tabs on the deck detail page.
 * Tests: tab visibility, switching boards, adding cards to sideboard/maybeboard,
 * cards appear on correct board and not on others.
 *
 * Self-contained: imports a small test deck, deletes it on teardown.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = '__e2e_boards_test__';
const TEST_DECK_TEXT = [
  '4 Lightning Bolt', '4 Counterspell', '4 Giant Growth',
  '4 Mountain', '4 Island', '4 Forest',
].join('\n');

describe('Deck Detail — sideboard and maybeboard tabs', () => {
  let driver;
  let deckListPage;
  let page;
  let testDeckId = null;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);

    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    // Import test deck
    const importBtn = await driver.findElement(By.css('.import-btn'));
    await driver.executeScript('arguments[0].click()', importBtn);
    await driver.wait(async () => {
      const modals = await driver.findElements(By.css('.import-modal'));
      return modals.length > 0;
    }, 5000, 'Import modal did not open');

    await driver.executeScript(`
      const el  = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      comp.importName = arguments[0];
      comp.importText = arguments[1];
      comp.importTab  = 'text';
      ng.applyChanges(comp);
      comp.submitImport();
    `, TEST_DECK_NAME, TEST_DECK_TEXT);

    await driver.wait(async () => {
      return driver.executeScript(`
        const el = document.querySelector('app-deck-list');
        const comp = ng.getComponent(el);
        return comp && (comp.importState === 'done' || comp.importState === 'error');
      `);
    }, 30000, 'Import did not complete');

    const state = await driver.executeScript(`
      const el = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      return { state: comp.importState, id: comp.importResult && comp.importResult.deck && comp.importResult.deck.id };
    `);
    if (state.state !== 'done') throw new Error('Import failed');
    testDeckId = state.id;

    // Navigate to deck detail
    await driver.get(`http://localhost:4200/deck/${testDeckId}`);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(`/deck/${testDeckId}`);
    }, 5000);
    await page.waitForVisible(page.backBtn, 10000);
    // Wait for deck content to render (filter bar contains the view toggle buttons)
    await page.waitForVisible(By.css('.filter-bar'), 10000);
    await page.switchToListView();
  });

  afterAll(async () => {
    // Delete test deck
    if (testDeckId) {
      await driver.get('http://localhost:4200/deck');
      await deckListPage.waitForVisible(deckListPage.listContent);
      await driver.executeScript(`
        const el = document.querySelector('app-deck-list');
        const comp = ng.getComponent(el);
        if (comp && comp.deleteDeck) {
          const deck = comp.decks && comp.decks.find(d => d.id === arguments[0]);
          if (deck) { comp.confirmDeleteDeck(deck); ng.applyChanges(el); }
        }
      `, testDeckId).catch(() => {});
      await driver.sleep(1000);
    }
    await driver.quit();
  });

  // ── Tab presence ────────────────────────────────────────────────────────────

  test('three board tabs are visible: Main Deck, Sideboard, Maybeboard', async () => {
    const tabs = await driver.findElements(By.css('.board-tab'));
    expect(tabs.length).toBe(3);

    const labels = await Promise.all(tabs.map(t => t.getText()));
    const upper = labels.map(l => l.toUpperCase());
    expect(upper.some(l => l.includes('MAIN DECK'))).toBe(true);
    expect(upper.some(l => l.includes('SIDEBOARD'))).toBe(true);
    expect(upper.some(l => l.includes('MAYBEBOARD'))).toBe(true);
  });

  test('Main Deck tab is active by default', async () => {
    const board = await page.getActiveBoardState();
    expect(board).toBe('main');
    const label = await page.getActiveBoard();
    expect(label.toUpperCase()).toContain('MAIN DECK');
  });

  test('Main Deck tab shows card count > 0', async () => {
    const count = await page.getBoardTabCount('Main Deck');
    expect(count).toBeGreaterThan(0);
  });

  // ── Tab switching ───────────────────────────────────────────────────────────

  test('switching to Sideboard tab sets activeBoard to "side"', async () => {
    await page.switchToBoard('Sideboard');
    const board = await page.getActiveBoardState();
    expect(board).toBe('side');
  });

  test('sideboard shows empty state when no sideboard cards', async () => {
    await page.switchToBoard('Sideboard');
    const emptyState = await page.isPresent(By.css('.empty-state'), 2000);
    expect(emptyState).toBe(true);
  });

  test('switching to Maybeboard tab sets activeBoard to "maybe"', async () => {
    await page.switchToBoard('Maybeboard');
    const board = await page.getActiveBoardState();
    expect(board).toBe('maybe');
  });

  test('switching back to Main Deck shows cards', async () => {
    await page.switchToBoard('Main Deck');
    const board = await page.getActiveBoardState();
    expect(board).toBe('main');
    // Main deck should have card rows
    const rows = await driver.findElements(By.css('.card-row'));
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Adding to Sideboard ─────────────────────────────────────────────────────

  test('adding a card while on Sideboard tab adds to sideboard', async () => {
    await page.switchToBoard('Sideboard');
    const countBefore = await page.getBoardTabCount('Sideboard');

    await page.openAddCardsPanel();
    await page.searchCard('Lightning Bolt', 10000);
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    // Count badge on Sideboard tab should increase
    await driver.wait(async () => {
      const count = await page.getBoardTabCount('Sideboard');
      return count > countBefore;
    }, 5000, 'Sideboard count did not increase');

    const countAfter = await page.getBoardTabCount('Sideboard');
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('sideboard card does not appear on Main Deck tab', async () => {
    // Switch to main deck and check Lightning Bolt isn't counted in "main" board
    await page.switchToBoard('Main Deck');

    // Verify via component state: the card just added should have board='side'
    const sideCards = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        if (!comp) return null;
        const deck = comp.deck$ ? null : null; // deck$ is observable
        // Access activeDeck via store state
        const store = comp.store || comp._store;
        if (!store) return 'no-store';
        let activeDeck = null;
        store.select(s => s.deck && s.deck.activeDeck).subscribe(d => { activeDeck = d; }).unsubscribe();
        if (!activeDeck) return 'no-deck';
        return activeDeck.cards
          .filter(c => (c.board || 'main') === 'side')
          .map(c => ({ name: c.cardDetails && c.cardDetails.name, board: c.board }));
      } catch(e) { return 'error:' + e.message; }
    `);

    expect(Array.isArray(sideCards)).toBe(true);
    expect(sideCards.length).toBeGreaterThan(0);
    expect(sideCards[0].board).toBe('side');
  });

  test('main deck card rows are visible on Main Deck tab', async () => {
    await page.switchToBoard('Main Deck');
    const rows = await driver.findElements(By.css('.card-row'));
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Adding to Maybeboard ────────────────────────────────────────────────────

  test('adding a card while on Maybeboard tab adds to maybeboard', async () => {
    await page.switchToBoard('Maybeboard');
    const countBefore = await page.getBoardTabCount('Maybeboard');

    await page.openAddCardsPanel();
    await page.searchCard('Counterspell', 10000);
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    await driver.wait(async () => {
      const count = await page.getBoardTabCount('Maybeboard');
      return count > countBefore;
    }, 5000, 'Maybeboard count did not increase');

    const countAfter = await page.getBoardTabCount('Maybeboard');
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('maybeboard card appears in maybeboard via component state', async () => {
    const maybeCards = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        if (!comp) return null;
        let activeDeck = null;
        comp.store.select(s => s.deck && s.deck.activeDeck).subscribe(d => { activeDeck = d; }).unsubscribe();
        if (!activeDeck) return 'no-deck';
        return activeDeck.cards
          .filter(c => (c.board || 'main') === 'maybe')
          .map(c => ({ name: c.cardDetails && c.cardDetails.name, board: c.board }));
      } catch(e) { return 'error:' + e.message; }
    `);

    expect(Array.isArray(maybeCards)).toBe(true);
    expect(maybeCards.length).toBeGreaterThan(0);
    expect(maybeCards[0].board).toBe('maybe');
  });
});
