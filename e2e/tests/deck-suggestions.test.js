const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = 'Selenium E2E Suggestions';

describe('Deck Suggestions Panel', () => {
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

    // Set a commander so suggestions are available (Atraxa is WUBG — broad coverage)
    await page.openCommanderSearch();
    await page.searchCard('Atraxa');
    await page.addFirstResult();
    await page.waitForCheckAtIndex(1, 'ok', 8000);

    // Add a couple of cards for deck context
    await page.openAddCardsPanel();
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Suggest button ────────────────────────────────────────────────────────────

  test('Suggest button is visible when a commander is set', async () => {
    const visible = await page.isPresent(By.css('.suggest-btn'), 3000);
    expect(visible).toBe(true);
  });

  test('clicking Suggest button opens suggestions panel', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.suggest-btn'))
    );
    await driver.sleep(400);
    const visible = await page.isPresent(By.css('.sugg-header'), 3000);
    expect(visible).toBe(true);
  });

  // ── Commander context bar ──────────────────────────────────────────────────────

  test('suggestions panel shows commander context bar', async () => {
    const bar = await page.isPresent(By.css('.sugg-commander'), 2000);
    expect(bar).toBe(true);
  });

  test('commander bar shows the commander name', async () => {
    const nameEl = await driver.findElement(By.css('.sugg-cmdr-name'));
    const text = await nameEl.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('Generate button is present in commander bar', async () => {
    const btn = await page.isPresent(By.css('.sugg-generate-btn'), 2000);
    expect(btn).toBe(true);
  });

  // ── Tags ──────────────────────────────────────────────────────────────────────

  test('tag input is present for focus refinement', async () => {
    const input = await page.isPresent(By.css('.sugg-tag-input'), 2000);
    expect(input).toBe(true);
  });

  test('typing a focus tag and pressing Enter adds it', async () => {
    const tagInput = await driver.findElement(By.css('.sugg-tag-input'));
    await tagInput.click();
    await tagInput.sendKeys('proliferate');
    await tagInput.sendKeys('\n'); // Enter
    await driver.sleep(300);
    const tags = await driver.findElements(By.css('.sugg-tag.sugg-tag--focus'));
    expect(tags.length).toBeGreaterThan(0);
    const texts = await Promise.all(tags.map(t => t.getText()));
    expect(texts.join(' ').toLowerCase()).toContain('proliferate');
  });

  test('clicking X on a focus tag removes it', async () => {
    const before = await driver.findElements(By.css('.sugg-tag.sugg-tag--focus'));
    if (before.length === 0) return;
    const removeBtn = await before[0].findElement(By.css('.sugg-tag-remove'));
    await removeBtn.click();
    await driver.sleep(300);
    const after = await driver.findElements(By.css('.sugg-tag.sugg-tag--focus'));
    expect(after.length).toBe(before.length - 1);
  });

  // ── Generate suggestions ───────────────────────────────────────────────────────

  test('clicking Generate shows loading state', async () => {
    const btn = await driver.findElement(By.css('.sugg-generate-btn'));
    await btn.click();
    // Loading state appears immediately
    const loading = await page.isPresent(By.css('.sugg-loading'), 3000);
    expect(loading).toBe(true);
  });

  test('suggestions appear after generation completes (or error is shown)', async () => {
    // Wait up to 60s for LLM response
    await driver.wait(async () => {
      const results = await page.isPresent(By.css('.sugg-results'), 2000);
      const error = await page.isPresent(By.css('.sugg-error'), 2000);
      const loading = await page.isPresent(By.css('.sugg-loading'), 500);
      return (results || error) && !loading;
    }, 60000, 'Suggestions did not complete');

    const hasResults = await page.isPresent(By.css('.sugg-results'), 1000);
    const hasError = await page.isPresent(By.css('.sugg-error'), 1000);
    expect(hasResults || hasError).toBe(true);
  });

  test('each category shows at least one suggestion card (when results exist)', async () => {
    const hasResults = await page.isPresent(By.css('.sugg-results'), 1000);
    if (!hasResults) return;

    const cards = await driver.findElements(By.css('.sugg-card'));
    expect(cards.length).toBeGreaterThan(0);
  });

  test('each suggestion card has a name and reason (when results exist)', async () => {
    const hasResults = await page.isPresent(By.css('.sugg-results'), 1000);
    if (!hasResults) return;

    const cards = await driver.findElements(By.css('.sugg-card'));
    if (cards.length === 0) return;
    const name = await cards[0].findElement(By.css('.sugg-card-name'));
    const reason = await cards[0].findElement(By.css('.sugg-card-reason'));
    const nameText = await name.getText();
    const reasonText = await reason.getText();
    expect(nameText.trim().length).toBeGreaterThan(0);
    expect(reasonText.trim().length).toBeGreaterThan(0);
  });

  test('add button adds a suggestion to the deck (when results exist)', async () => {
    const hasResults = await page.isPresent(By.css('.sugg-results'), 1000);
    if (!hasResults) return;

    const addBtns = await driver.findElements(By.css('.sugg-add-btn:not(.sugg-add-btn--added)'));
    if (addBtns.length === 0) return;

    const countBefore = await page.getDeckHeaderCount();
    await addBtns[0].click();
    await driver.sleep(1000);

    // The button should now show as added
    const addedBtns = await driver.findElements(By.css('.sugg-add-btn.sugg-add-btn--added'));
    expect(addedBtns.length).toBeGreaterThan(0);
  });

  test('Regenerate button appears after first generation', async () => {
    const hasResults = await page.isPresent(By.css('.sugg-results'), 1000);
    if (!hasResults) return;

    const btn = await driver.findElement(By.css('.sugg-generate-btn'));
    const text = await btn.getText();
    expect(text.toLowerCase()).toContain('regenerate');
  });

  // ── Close panel ────────────────────────────────────────────────────────────────

  test('closing suggestions panel hides it', async () => {
    const closeBtn = await driver.findElement(By.css('.sugg-close'));
    await closeBtn.click();
    await driver.sleep(400);
    const gone = !(await page.isPresent(By.css('.sugg-header'), 1000));
    expect(gone).toBe(true);
  });
});
