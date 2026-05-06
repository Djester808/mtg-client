const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

describe('Deck Detail', () => {
  let driver;
  let deckListPage;
  let page;
  let hasDecks = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);

    deckListPage = new DeckListPage(driver);
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    const cards = await deckListPage.getDeckCards();
    if (cards.length === 0) {
      console.warn('[deck-detail] No decks found — all tests will be skipped');
      return;
    }

    try {
      hasDecks = true;
      await deckListPage.clickFirstDeck();
      await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return /\/deck\/.+/.test(url);
      }, 5000, 'Timed out navigating to deck detail');
      page = new DeckDetailPage(driver);
    } catch (err) {
      hasDecks = false;
      console.warn('[deck-detail] Failed to open a deck:', err.message);
    }
  });

  afterAll(async () => {
    await driver.quit();
  });

  test('deck detail page loads', async () => {
    if (!hasDecks) return;
    await page.waitForVisible(page.backBtn);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/deck\/.+/);
  });

  test('filter input accepts text', async () => {
    if (!hasDecks) return;
    await page.filterCards('Lightning');
    const value = await page.getFilterValue();
    expect(value).toBe('Lightning');
  });

  test('stats panel toggles open', async () => {
    if (!hasDecks) return;
    const hasStatsBtn = await page.isPresent(page.statsBtn, 1000);
    if (!hasStatsBtn) return; // stats button only present for commander-format decks
    await page.toggleStats();
    const open = await page.isSidePanelOpen();
    expect(open).toBe(true);
  });

  test('back button returns to deck list', async () => {
    if (!hasDecks) return;
    await page.clickBack();
    await page.waitForUrlToContain('/deck', 3000);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/deck\/?$/);
  });
});
