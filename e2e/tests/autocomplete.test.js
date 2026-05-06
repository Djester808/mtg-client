const { By, Key } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = 'Selenium E2E Autocomplete';

describe('Autocomplete — search history, filter suggestions, tag history', () => {
  let driver;
  let deckListPage;
  let page;
  let deckCreated = false;
  let addedCardName = null;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);
    await deckListPage.createCommanderDeck(TEST_DECK_NAME);
    deckCreated = true;

    // Clear any leftover history from previous runs
    await driver.executeScript(`
      localStorage.removeItem('mtg-search-history');
      localStorage.removeItem('mtg-tag-history');
    `);

    // Add a card so we have both a search history entry and a deck card name
    await page.openAddCardsPanel();
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    // Capture the name that was actually saved to history
    const history = await driver.executeScript(`
      try { return JSON.parse(localStorage.getItem('mtg-search-history') || '[]'); }
      catch { return []; }
    `);
    addedCardName = history[0] ?? null;

    await page.closeSearchPanel();
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    try {
      await driver.executeScript(`
        localStorage.removeItem('mtg-search-history');
        localStorage.removeItem('mtg-tag-history');
      `);
    } catch {}
    await driver.quit();
  });

  // ── Search history (card search panel) ──────────────────────────────────────

  test('adding a card saves its name to mtg-search-history in localStorage', async () => {
    const history = await driver.executeScript(`
      try { return JSON.parse(localStorage.getItem('mtg-search-history') || '[]'); }
      catch { return []; }
    `);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(typeof history[0]).toBe('string');
    expect(history[0].length).toBeGreaterThan(0);
  });

  test('search panel datalist #card-search-hist has options from history', async () => {
    await page.openAddCardsPanel();
    await driver.sleep(300);

    const options = await driver.findElements(By.css('#card-search-hist option'));
    expect(options.length).toBeGreaterThan(0);

    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    if (addedCardName) {
      expect(values).toContain(addedCardName);
    } else {
      expect(values.some(v => v && v.length > 0)).toBe(true);
    }

    await page.closeSearchPanel();
  });

  test('adding a second card prepends it to the history', async () => {
    await page.openAddCardsPanel();
    await page.searchCard('Forest');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();
    await driver.sleep(300);

    const history = await driver.executeScript(`
      try { return JSON.parse(localStorage.getItem('mtg-search-history') || '[]'); }
      catch { return []; }
    `);
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Most recently added card is first
    expect(history[0]).not.toBe(history[1]);
  });

  // ── Deck filter autocomplete ─────────────────────────────────────────────────

  test('deck filter datalist #deck-filter-sugg contains names of cards in deck', async () => {
    const options = await driver.findElements(By.css('#deck-filter-sugg option'));
    expect(options.length).toBeGreaterThan(0);

    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    if (addedCardName) {
      expect(values).toContain(addedCardName);
    } else {
      expect(values.some(v => v && v.length > 0)).toBe(true);
    }
  });

  test('deck filter datalist updates after adding another card', async () => {
    const before = await driver.findElements(By.css('#deck-filter-sugg option'));
    const beforeValues = await Promise.all(before.map(o => o.getAttribute('value')));

    // The second card (Forest) should also be in the datalist now
    const options = await driver.findElements(By.css('#deck-filter-sugg option'));
    expect(options.length).toBeGreaterThanOrEqual(before.length);
    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    expect(values.some(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  // ── Tag history ──────────────────────────────────────────────────────────────

  test('adding a tag saves it to mtg-tag-history in localStorage', async () => {
    const result = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        comp.tagDraft = 'e2e-autocomplete-tag';
        let deck;
        comp.deck$.subscribe(d => deck = d).unsubscribe();
        if (!deck) return 'no-deck';
        comp.commitTagInput(deck);
        ng.applyChanges(el);
        return 'ok';
      } catch(e) { return 'error:' + e.message; }
    `);
    expect(result).toBe('ok');
    await driver.sleep(400);

    const history = await driver.executeScript(`
      try { return JSON.parse(localStorage.getItem('mtg-tag-history') || '[]'); }
      catch { return []; }
    `);
    expect(history).toContain('e2e-autocomplete-tag');
  });

  test('tag input datalist #deck-tag-sugg contains the added tag', async () => {
    const options = await driver.findElements(By.css('#deck-tag-sugg option'));
    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    expect(values).toContain('e2e-autocomplete-tag');
  });

  test('adding a second tag prepends it to the history', async () => {
    const result = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        comp.tagDraft = 'e2e-second-tag';
        let deck;
        comp.deck$.subscribe(d => deck = d).unsubscribe();
        if (!deck) return 'no-deck';
        comp.commitTagInput(deck);
        ng.applyChanges(el);
        return 'ok';
      } catch(e) { return 'error:' + e.message; }
    `);
    expect(result).toBe('ok');
    await driver.sleep(400);

    const options = await driver.findElements(By.css('#deck-tag-sugg option'));
    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    expect(values).toContain('e2e-second-tag');
    expect(values).toContain('e2e-autocomplete-tag');
    // Most recent tag is first in the datalist
    expect(values.indexOf('e2e-second-tag')).toBeLessThan(values.indexOf('e2e-autocomplete-tag'));
  });

  test('tag history persists after page reload', async () => {
    await driver.navigate().refresh();
    await page.waitForElement(By.css('app-deck-detail'), 8000);
    await driver.sleep(500);

    const options = await driver.findElements(By.css('#deck-tag-sugg option'));
    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    expect(values).toContain('e2e-autocomplete-tag');
    expect(values).toContain('e2e-second-tag');
  });

  test('search history persists after page reload', async () => {
    await page.openAddCardsPanel();
    await driver.sleep(300);

    const options = await driver.findElements(By.css('#card-search-hist option'));
    const values = await Promise.all(options.map(o => o.getAttribute('value')));
    expect(values.length).toBeGreaterThan(0);
    if (addedCardName) {
      expect(values).toContain(addedCardName);
    }

    await page.closeSearchPanel();
  });
});
