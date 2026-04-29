const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000); // e2e setup can take up to 2 min

const TEST_DECK_NAME = 'Selenium E2E Views';

describe('Deck View Modes', () => {
  let driver;
  let deckListPage;
  let page;
  let deckCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    // Create a Commander deck (no commander set — saves time)
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);
    await deckListPage.createCommanderDeck(TEST_DECK_NAME);
    deckCreated = true;

    // Add Sol Ring (CMC 1) and Farseek (CMC 2) for multi-group coverage
    await page.openAddCardsPanel();
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.searchCard('Farseek');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.closeSearchPanel();
    // Ensure we're in list view (default) before tests
    await page.switchToListView();
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Header count ─────────────────────────────────────────────────────────

  test('header shows correct card count', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(2);
  });

  // ── List view ─────────────────────────────────────────────────────────────

  test('list view is active by default after adding cards', async () => {
    const btn = await driver.findElement(page.listViewBtn);
    const cls = await btn.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('list view shows .card-row elements', async () => {
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('filter bar is visible in list view', async () => {
    const visible = await page.isPresent(page.filterBar, 2000);
    expect(visible).toBe(true);
  });

  test('list view thumbnail mode shows qty buttons', async () => {
    const btns = await driver.findElements(page.qtyDec);
    expect(btns.length).toBeGreaterThan(0);
  });

  // ── Text style ────────────────────────────────────────────────────────────

  test('enabling text style in list view shows list-row elements', async () => {
    await page.enableTextStyle();
    const rows = await driver.findElements(page.listTextRows);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('text style shows list-dec buttons instead of qty-btn', async () => {
    const listDecBtns = await driver.findElements(By.css('.list-btn.list-dec'));
    expect(listDecBtns.length).toBeGreaterThan(0);
  });

  test('card count unchanged after enabling text style', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(2);
  });

  // ── Visual view ───────────────────────────────────────────────────────────

  test('switching to visual view shows .visual-card elements', async () => {
    await page.disableTextStyle();
    await page.switchToVisualView();
    const cards = await page.getVisualCards();
    expect(cards.length).toBeGreaterThan(0);
  });

  test('visual view hides .card-row thumbnail layout', async () => {
    // card-row (without list-row) is rendered only in list thumbnail mode
    const rows = await driver.findElements(By.css('.card-row:not(.list-row)'));
    expect(rows.length).toBe(0);
  });

  test('filter bar remains visible in visual view', async () => {
    const visible = await page.isPresent(page.filterBar, 2000);
    expect(visible).toBe(true);
  });

  test('card count unchanged after switching to visual view', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(2);
  });

  test('visual view shows ctrl-dec/ctrl-inc buttons', async () => {
    const btns = await driver.findElements(page.ctrlDec);
    expect(btns.length).toBeGreaterThan(0);
  });

  // ── Free view ─────────────────────────────────────────────────────────────

  test('switching to free view renders free columns', async () => {
    await page.switchToFreeView();
    const cols = await page.getFreeCols();
    expect(cols.length).toBeGreaterThan(0);
  });

  test('free view renders free-card tiles', async () => {
    const cards = await page.getFreeCards();
    expect(cards.length).toBeGreaterThan(0);
  });

  test('filter bar is hidden in free view', async () => {
    const visible = await page.isPresent(page.filterBar, 1000);
    expect(visible).toBe(false);
  });

  test('free toolbar is visible in free view', async () => {
    const visible = await page.isPresent(By.css('.free-toolbar'), 2000);
    expect(visible).toBe(true);
  });

  test('card count unchanged after switching to free view', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(2);
  });

  test('free view shows ctrl-dec/ctrl-inc buttons', async () => {
    const btns = await driver.findElements(page.ctrlInc);
    expect(btns.length).toBeGreaterThan(0);
  });

  // ── Text style in free view ───────────────────────────────────────────────

  test('enabling text style in free view shows list-row inside free columns', async () => {
    await page.enableTextStyle();
    const rows = await driver.findElements(By.css('.free-col .card-row.list-row'));
    expect(rows.length).toBeGreaterThan(0);
  });

  test('free-card tiles are hidden when text style is active', async () => {
    const cards = await driver.findElements(page.freeCards);
    expect(cards.length).toBe(0);
  });

  // ── Switching back ────────────────────────────────────────────────────────

  test('switching back to list view shows card rows again', async () => {
    await page.switchToListView();
    await page.disableTextStyle();
    await page.waitForVisible(page.cardRows, 3000);
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('final card count still matches initial count', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(2);
  });
});
