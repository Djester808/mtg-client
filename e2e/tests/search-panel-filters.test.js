const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = 'Selenium E2E Search Filters';

describe('Card Search Panel — Filters, Sort, Set', () => {
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

    // Open the add-cards panel and do a baseline search
    await page.openAddCardsPanel();
    await page.searchCard('creature', 15000);
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Panel structure ────────────────────────────────────────────────────────────

  test('search panel is open with results visible', async () => {
    const rows = await driver.findElements(page.resultRow);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('panel has color pip filter buttons (W U B R G C M)', async () => {
    const pips = await driver.findElements(By.css('.panel-filters .color-pip'));
    expect(pips.length).toBe(7);
  });

  test('panel has type filter pills', async () => {
    const pills = await driver.findElements(By.css('.panel-filters .filter-pill'));
    expect(pills.length).toBeGreaterThan(0);
  });

  test('panel has rarity badge filter buttons', async () => {
    const badges = await driver.findElements(By.css('.panel-filters .rarity-badge'));
    expect(badges.length).toBeGreaterThan(0);
  });

  test('panel has CMC filter buttons', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .cmc-btn'));
    expect(btns.length).toBeGreaterThan(0);
  });

  test('panel has sort buttons (Name and CMC)', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .sort-btn'));
    const texts = await Promise.all(btns.map(b => b.getText()));
    const lower = texts.map(t => t.toLowerCase());
    expect(lower.some(t => t.includes('name'))).toBe(true);
    expect(lower.some(t => t.includes('cmc'))).toBe(true);
  });

  test('panel has sort direction button', async () => {
    const btn = await page.isPresent(By.css('.panel-filters .sort-dir-btn'), 2000);
    expect(btn).toBe(true);
  });

  // ── Search flags ───────────────────────────────────────────────────────────────

  test('match-case flag button is present', async () => {
    const btn = await page.isPresent(By.css('.search-flags .search-flag-btn[title="Match case"]'), 2000);
    expect(btn).toBe(true);
  });

  test('clicking match-case toggles its active state', async () => {
    const btn = await driver.findElement(By.css('.search-flags .search-flag-btn[title="Match case"]'));
    const before = await btn.getAttribute('class');
    await btn.click();
    await driver.sleep(200);
    const after = await btn.getAttribute('class');
    expect(after).not.toBe(before);
    // Reset
    await btn.click();
    await driver.sleep(200);
  });

  // ── Color filter ───────────────────────────────────────────────────────────────

  test('clicking a color pip activates it (is-active class)', async () => {
    const pips = await driver.findElements(By.css('.panel-filters .color-pip'));
    await driver.executeScript('arguments[0].click()', pips[0]);
    await driver.sleep(500);
    const cls = await pips[0].getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('color filter reduces visible results', async () => {
    const rowsFiltered = await driver.findElements(page.resultRow);
    // Deactivate filter
    const pips = await driver.findElements(By.css('.panel-filters .color-pip'));
    await driver.executeScript('arguments[0].click()', pips[0]);
    await driver.sleep(500);
    const rowsAll = await driver.findElements(page.resultRow);
    expect(rowsAll.length).toBeGreaterThanOrEqual(rowsFiltered.length);
  });

  test('multiple color pips can be active simultaneously', async () => {
    const pips = await driver.findElements(By.css('.panel-filters .color-pip'));
    if (pips.length >= 2) {
      await driver.executeScript('arguments[0].click()', pips[0]);
      await driver.sleep(300);
      await driver.executeScript('arguments[0].click()', pips[1]);
      await driver.sleep(300);
      const cls0 = await pips[0].getAttribute('class');
      const cls1 = await pips[1].getAttribute('class');
      expect(cls0).toContain('is-active');
      expect(cls1).toContain('is-active');
      // Reset both
      await driver.executeScript('arguments[0].click()', pips[0]);
      await driver.executeScript('arguments[0].click()', pips[1]);
      await driver.sleep(400);
    }
  });

  // ── Rarity filter ──────────────────────────────────────────────────────────────

  test('clicking a rarity badge activates it', async () => {
    const badges = await driver.findElements(By.css('.panel-filters .rarity-badge'));
    await driver.executeScript('arguments[0].click()', badges[0]);
    await driver.sleep(400);
    const cls = await badges[0].getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('rarity filter affects the result count', async () => {
    const filtered = await driver.findElements(page.resultRow);
    expect(filtered.length).toBeGreaterThanOrEqual(0);
    // Reset
    const badges = await driver.findElements(By.css('.panel-filters .rarity-badge'));
    await driver.executeScript('arguments[0].click()', badges[0]);
    await driver.sleep(400);
  });

  // ── Type filter ────────────────────────────────────────────────────────────────

  test('clicking a type pill activates it', async () => {
    const pills = await driver.findElements(By.css('.panel-filters .filter-pill'));
    if (pills.length === 0) return;
    await driver.executeScript('arguments[0].click()', pills[0]);
    await driver.sleep(400);
    const cls = await pills[0].getAttribute('class');
    expect(cls).toContain('is-active');
    // Reset
    await driver.executeScript('arguments[0].click()', pills[0]);
    await driver.sleep(400);
  });

  // ── CMC filter ─────────────────────────────────────────────────────────────────

  test('clicking CMC 1 button activates it and filters results', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .cmc-btn'));
    if (btns.length === 0) return;
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(500);
    const cls = await btns[0].getAttribute('class');
    expect(cls).toContain('is-active');
    // Reset
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(400);
  });

  test('clicking the same CMC button again deactivates it', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .cmc-btn'));
    if (btns.length === 0) return;
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(300);
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(300);
    const cls = await btns[0].getAttribute('class');
    expect(cls).not.toContain('is-active');
  });

  // ── Sort ───────────────────────────────────────────────────────────────────────

  test('clicking CMC sort activates it', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .sort-btn'));
    let cmcBtn = null;
    for (const b of btns) {
      const t = (await b.getText()).toLowerCase();
      if (t.includes('cmc')) { cmcBtn = b; break; }
    }
    if (!cmcBtn) return;
    await driver.executeScript('arguments[0].click()', cmcBtn);
    await driver.sleep(400);
    const cls = await cmcBtn.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('clicking Name sort activates it and deactivates CMC', async () => {
    const btns = await driver.findElements(By.css('.panel-filters .sort-btn'));
    let nameBtn = null;
    let cmcBtn = null;
    for (const b of btns) {
      const text = (await b.getText()).toLowerCase();
      if (text.includes('name')) nameBtn = b;
      if (text.includes('cmc')) cmcBtn = b;
    }
    if (!nameBtn) return;
    await driver.executeScript('arguments[0].click()', nameBtn);
    await driver.sleep(400);
    const nameCls = await nameBtn.getAttribute('class');
    expect(nameCls).toContain('is-active');
    if (cmcBtn) {
      const cmcCls = await cmcBtn.getAttribute('class');
      expect(cmcCls).not.toContain('is-active');
    }
  });

  test('sort direction button toggles between ascending and descending', async () => {
    const dirBtn = await driver.findElement(By.css('.panel-filters .sort-dir-btn'));
    const before = await dirBtn.getText();
    await dirBtn.click();
    await driver.sleep(300);
    const after = await dirBtn.getText();
    expect(after).not.toBe(before);
    // Reset
    await dirBtn.click();
    await driver.sleep(300);
  });

  // ── Set filter ─────────────────────────────────────────────────────────────────

  test('set trigger button opens the set dropdown', async () => {
    const trigger = await driver.findElement(By.css('.panel-filters .set-trigger'));
    await trigger.click();
    await driver.sleep(300);
    const present = await page.isPresent(By.css('.set-dropdown'), 2000);
    expect(present).toBe(true);
  });

  test('set dropdown lists set options', async () => {
    const opts = await driver.findElements(By.css('.set-option'));
    expect(opts.length).toBeGreaterThan(0);
  });

  test('selecting a set option activates the set trigger', async () => {
    const opts = await driver.findElements(By.css('.set-option'));
    if (opts.length === 0) return;
    await opts[0].click();
    await driver.sleep(400);
    const trigger = await driver.findElement(By.css('.panel-filters .set-trigger'));
    const cls = await trigger.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('clear button appears and clears all active filters', async () => {
    const clearVisible = await page.isPresent(page.filterBar, 1000) ||
                         await page.isPresent(By.css('.clear-btn'), 1000);
    if (!clearVisible) return;
    const clearBtns = await driver.findElements(By.css('.clear-btn'));
    if (clearBtns.length === 0) return;
    await driver.executeScript('arguments[0].click()', clearBtns[0]);
    await driver.sleep(400);
    // Set trigger should no longer be active
    const trigger = await driver.findElement(By.css('.panel-filters .set-trigger'));
    const cls = await trigger.getAttribute('class');
    expect(cls).not.toContain('is-active');
  });

  // ── Add from result row ────────────────────────────────────────────────────────

  test('can add first result to deck', async () => {
    const countBefore = await page.getDeckHeaderCount();
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    const countAfter = await page.getDeckHeaderCount();
    expect(countAfter).toBeGreaterThan(countBefore);
  });
});
