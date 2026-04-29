const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

const TEST_DECK_NAME = 'Selenium E2E Commander';

describe('Deck CRUD + Commander Validation', () => {
  let driver;
  let deckListPage;
  let page;
  let deckCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);
  });

  afterAll(async () => {
    if (deckCreated) {
      try {
        await deckListPage.deleteDeckByName(TEST_DECK_NAME);
      } catch (e) {
        console.warn('[cleanup] Could not delete test deck:', e.message);
      }
    }
    await driver.quit();
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  test('creates a Commander deck and redirects to detail', async () => {
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);
    await deckListPage.createCommanderDeck(TEST_DECK_NAME);

    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/deck\/.+/);
    deckCreated = true;
  });

  // ── Validation bar ──────────────────────────────────────────────────────────

  test('validation bar is visible for Commander format', async () => {
    await page.waitForVisible(page.validationBar);
    const checks = await page.getCheckClasses();
    expect(checks.length).toBeGreaterThanOrEqual(5);
  });

  test('commander check starts bad — no commander set', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[1]).toContain('bad');
  });

  test('count check starts bad — 0 of 100 cards', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[0]).toContain('bad');
  });

  // ── Commander ───────────────────────────────────────────────────────────────

  test('opens commander search via side panel', async () => {
    await page.openCommanderSearch();
    const visible = await page.isPresent(page.searchInput, 2000);
    expect(visible).toBe(true);
  });

  test('sets Atraxa as commander — commander check becomes ok', async () => {
    await page.searchCard('Atraxa');
    await page.addFirstResult();
    await page.waitForCheckAtIndex(1, 'ok', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[1]).toContain('ok');
  });

  // ── Add cards ───────────────────────────────────────────────────────────────

  test('opens add-cards panel', async () => {
    await page.switchToListView();
    await page.closeSearchPanel();
    await page.openAddCardsPanel();
    const visible = await page.isPresent(page.searchInput, 2000);
    expect(visible).toBe(true);
  });

  test('adds Sol Ring — card row appears in deck', async () => {
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    // Confirm the card reached the deck store before closing the panel
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();
    // Switch to list view after the panel closes to ensure card rows are rendered
    await page.switchToListView();
    await page.waitForVisible(page.cardRows, 5000);
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Remove cards ─────────────────────────────────────────────────────────────

  test('decrement removes the card when qty reaches 0', async () => {
    const rowsBefore = await page.getCardRows();
    expect(rowsBefore.length).toBeGreaterThan(0);

    await page.click(page.qtyDec);

    await driver.wait(async () => {
      const rows = await page.getCardRows();
      return rows.length < rowsBefore.length;
    }, 5000, 'Card row did not disappear after decrement to 0');

    const rowsAfter = await page.getCardRows();
    expect(rowsAfter.length).toBeLessThan(rowsBefore.length);
  });

  // ── Singleton violation ──────────────────────────────────────────────────────

  test('adding the same card twice triggers singleton violation', async () => {
    await page.openAddCardsPanel();
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.addFirstResult();
    await page.closeSearchPanel();
    await page.waitForCheckAtIndex(2, 'bad-singleton', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[2]).toContain('bad-singleton');
  });

  // ── Color identity violation ─────────────────────────────────────────────────

  test('adding an off-color card triggers color identity violation', async () => {
    await page.openAddCardsPanel();
    await page.searchCard('Lightning Bolt');
    await page.addFirstResult();
    await page.closeSearchPanel();
    await page.waitForCheckAtIndex(3, 'bad-color-id', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[3]).toContain('bad-color-id');
  });
});
