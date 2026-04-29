const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000); // e2e setup can take up to 2 min

const TEST_DECK_NAME = 'Selenium E2E Free Mode';

describe('Deck Free Mode', () => {
  let driver;
  let deckListPage;
  let page;
  let deckCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);
    await deckListPage.createCommanderDeck(TEST_DECK_NAME);
    deckCreated = true;

    // Add three cards across two CMC groups:
    //   Sol Ring (CMC 1) + Lightning Bolt (CMC 1) → one column
    //   Farseek (CMC 2) → second column
    await page.openAddCardsPanel();

    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.searchCard('Lightning Bolt');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.searchCard('Farseek');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.closeSearchPanel();
    await page.switchToFreeView();

    // Wait for free columns to initialise
    await driver.wait(async () => {
      const cols = await page.getFreeColumnInfo();
      return Array.isArray(cols) && cols.length >= 2;
    }, 5000, 'Free columns did not initialise with 2+ groups');
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  test('free view shows at least two CMC columns', async () => {
    const cols = await page.getFreeCols();
    expect(cols.length).toBeGreaterThanOrEqual(2);
  });

  test('free view shows all three cards as tiles', async () => {
    const cards = await page.getFreeCards();
    expect(cards.length).toBe(3);
  });

  test('column info reflects correct card distribution', async () => {
    const info = await page.getFreeColumnInfo();
    expect(Array.isArray(info)).toBe(true);
    const total = info.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(3);
  });

  test('header count stays at 3 in free view', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(3);
  });

  // ── Drag card between columns ─────────────────────────────────────────────

  test('drag card from CMC-1 col to CMC-2 col decrements source and increments target', async () => {
    const before = await page.getFreeColumnInfo();
    const fromColIdx = before.findIndex(c => c.count >= 2); // CMC-1 col has 2 cards
    expect(fromColIdx).toBeGreaterThanOrEqual(0);
    const toColIdx = before.findIndex((c, i) => i !== fromColIdx); // any other col
    expect(toColIdx).toBeGreaterThanOrEqual(0);

    const fromCountBefore = before[fromColIdx].count;
    const toCountBefore   = before[toColIdx].count;

    await page.dragFreeCardByNg(fromColIdx, 0, toColIdx);

    await driver.sleep(400); // allow Angular OnPush to re-render
    const after = await page.getFreeColumnInfo();
    expect(after[fromColIdx].count).toBe(fromCountBefore - 1);
    expect(after[toColIdx].count).toBe(toCountBefore + 1);
  });

  test('total deck count unchanged after between-column drag', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(3);
  });

  // ── Drag card within the same column (reorder) ────────────────────────────

  test('drag card within same column keeps column count unchanged', async () => {
    // Find a column with at least 2 cards for a meaningful reorder
    const before = await page.getFreeColumnInfo();
    const colIdx = before.findIndex(c => c.count >= 2);
    if (colIdx < 0) {
      // After the previous drag, one col may have 2 cards; if not, skip gracefully
      console.warn('[free-mode] No column with 2+ cards for reorder test');
      return;
    }

    const countBefore = before[colIdx].count;
    // Move card at index 0 to the end of the same column
    await page.dragFreeCardByNg(colIdx, 0, colIdx, true);
    await driver.sleep(400);

    const after = await page.getFreeColumnInfo();
    expect(after[colIdx].count).toBe(countBefore);
  });

  test('total deck count unchanged after within-column reorder', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(3);
  });

  // ── Rubber-band multi-card drag ───────────────────────────────────────────

  test('multi-card drag moves selected cards to target column', async () => {
    // Make sure there's a column with 2+ cards by dragging the moved card back
    // first, then do the multi-drag
    const cols = await page.getFreeColumnInfo();
    const twoCardCol = cols.findIndex(c => c.count >= 2);
    if (twoCardCol < 0) {
      // Restore by dragging card 0 from col 1 back to col 0
      await page.dragFreeCardByNg(1, 0, 0);
      await driver.sleep(400);
    }

    const before = await page.getFreeColumnInfo();
    const srcIdx = before.findIndex(c => c.count >= 2);
    expect(srcIdx).toBeGreaterThanOrEqual(0);
    const dstIdx = before.findIndex((c, i) => i !== srcIdx);
    expect(dstIdx).toBeGreaterThanOrEqual(0);

    const srcCountBefore = before[srcIdx].count;
    const dstCountBefore = before[dstIdx].count;

    // Select cards at indices 0 and 1 from the source column
    await page.multiDragFreeCardsByNg(srcIdx, [0, 1], dstIdx);
    await driver.sleep(400);

    const after = await page.getFreeColumnInfo();
    expect(after[srcIdx].count).toBe(srcCountBefore - 2);
    expect(after[dstIdx].count).toBe(dstCountBefore + 2);
  });

  test('total deck count unchanged after multi-card drag', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(3);
  });

  // ── Add column ────────────────────────────────────────────────────────────

  test('clicking + Column adds a new empty column', async () => {
    const before = await page.getFreeColumnInfo();
    await page.addFreeColumn();
    await driver.sleep(400);
    const after = await page.getFreeColumnInfo();
    expect(after.length).toBe(before.length + 1);
    const newCol = after[after.length - 1];
    expect(newCol.count).toBe(0);
  });

  test('total deck count unchanged after adding a column', async () => {
    const count = await page.getDeckHeaderCount();
    expect(count).toBe(3);
  });

  // ── Free-mode qty controls ────────────────────────────────────────────────

  test('ctrl-inc increments a card qty in free mode', async () => {
    const countBefore = await page.getDeckHeaderCount();
    await page.freeModeIncrement();
    await driver.wait(async () => {
      const c = await page.getDeckHeaderCount();
      return c === countBefore + 1;
    }, 5000, 'Card count did not increment in free mode');
    const countAfter = await page.getDeckHeaderCount();
    expect(countAfter).toBe(countBefore + 1);
  });

  test('ctrl-dec decrements a card qty in free mode', async () => {
    const countBefore = await page.getDeckHeaderCount();
    await page.freeModeDecrement();
    await driver.wait(async () => {
      const c = await page.getDeckHeaderCount();
      return c === countBefore - 1;
    }, 5000, 'Card count did not decrement in free mode');
    const countAfter = await page.getDeckHeaderCount();
    expect(countAfter).toBe(countBefore - 1);
  });

  // ── Add card via search panel in free view ────────────────────────────────

  test('can add a card while in free view and total count increases', async () => {
    const countBefore = await page.getDeckHeaderCount();

    await page.openAddCardsPanel();
    await page.searchCard('Cultivate');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    await driver.wait(async () => {
      const c = await page.getDeckHeaderCount();
      return c === countBefore + 1;
    }, 5000, 'Card count did not increase after adding via search in free view');
    const countAfter = await page.getDeckHeaderCount();
    expect(countAfter).toBe(countBefore + 1);
  });

  // ── Save layout ───────────────────────────────────────────────────────────

  test('save layout button changes to Saved state after click', async () => {
    await page.waitForVisible(page.freeSaveBtn);
    const btn = await driver.findElement(page.freeSaveBtn);
    await btn.click();
    await driver.wait(async () => {
      const cls = await driver.findElement(page.freeSaveBtn).then(e => e.getAttribute('class'));
      return cls.includes('is-saved');
    }, 3000, 'Save button did not reach is-saved state');
    const cls = await driver.findElement(page.freeSaveBtn).then(e => e.getAttribute('class'));
    expect(cls).toContain('is-saved');
  });
});
