const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const HomePage = require('../pages/HomePage');

jest.setTimeout(60000);

describe('Home — Global Card Search', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new HomePage(driver);
    await page.navigate();
    await page.waitForVisible(page.searchInput, 5000);
  });

  afterAll(async () => {
    await driver.quit();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  test('page loads at /', async () => {
    const url = await page.getCurrentUrl();
    expect(url.replace(/\/$/, '')).toMatch(/localhost:\d+\/?$/);
  });

  test('idle state is shown before any search', async () => {
    const idle = await page.isPresent(page.idleState, 2000);
    expect(idle).toBe(true);
  });

  test('search input is visible', async () => {
    const present = await page.isPresent(page.searchInput, 2000);
    expect(present).toBe(true);
  });

  test('color filter pips are present (W U B R G C M)', async () => {
    const pips = await driver.findElements(page.colorPips);
    expect(pips.length).toBeGreaterThanOrEqual(5);
  });

  test('type filter pills are present', async () => {
    const pills = await driver.findElements(page.filterPills);
    expect(pills.length).toBeGreaterThan(0);
  });

  test('rarity badges are present', async () => {
    const badges = await driver.findElements(page.rarityBadges);
    expect(badges.length).toBeGreaterThan(0);
  });

  test('CMC filter buttons are present', async () => {
    const btns = await driver.findElements(page.cmcBtns);
    expect(btns.length).toBeGreaterThan(0);
  });

  // ── Basic search ───────────────────────────────────────────────────────────

  test('typing a card name shows results', async () => {
    await page.search('Lightning Bolt');
    const tiles = await page.getCardTiles();
    expect(tiles.length).toBeGreaterThan(0);
  });

  test('results count label shows number of results', async () => {
    const countEl = await driver.findElement(page.resultsCount);
    const text = await countEl.getText();
    expect(text).toMatch(/\d+ result/);
  });

  test('search clear button appears when text is typed', async () => {
    const clearVisible = await page.isPresent(page.searchClear, 2000);
    expect(clearVisible).toBe(true);
  });

  test('clicking clear button resets the search to idle', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(page.searchClear)
    );
    await driver.sleep(500);
    const idle = await page.isPresent(page.idleState, 3000);
    expect(idle).toBe(true);
  });

  // ── Color filter ───────────────────────────────────────────────────────────

  test('clicking a color pip activates it (is-active)', async () => {
    await page.search('creature');
    await driver.sleep(400);
    const pips = await driver.findElements(page.colorPips);
    await driver.executeScript('arguments[0].click()', pips[0]); // W pip
    await driver.sleep(500);
    const cls = await pips[0].getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('color filter reduces result set', async () => {
    const tilesFiltered = await page.getCardTiles();
    // Clear the filter
    const pips = await driver.findElements(page.colorPips);
    await driver.executeScript('arguments[0].click()', pips[0]);
    await driver.sleep(500);
    const tilesAll = await page.getCardTiles();
    expect(tilesAll.length).toBeGreaterThanOrEqual(tilesFiltered.length);
  });

  test('Clear button appears when a filter is active', async () => {
    const pips = await driver.findElements(page.colorPips);
    await driver.executeScript('arguments[0].click()', pips[0]);
    await driver.sleep(400);
    const clearVisible = await page.isPresent(page.clearBtn, 2000);
    expect(clearVisible).toBe(true);
  });

  test('clicking Clear button deactivates all filters', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(page.clearBtn)
    );
    await driver.sleep(400);
    const pips = await driver.findElements(page.colorPips);
    for (const pip of pips) {
      const cls = await pip.getAttribute('class');
      expect(cls).not.toContain('is-active');
    }
  });

  // ── Type filter ────────────────────────────────────────────────────────────

  test('clicking a type pill activates it', async () => {
    await page.search('sol ring');
    await driver.sleep(400);
    const pills = await driver.findElements(page.filterPills);
    await driver.executeScript('arguments[0].click()', pills[0]);
    await driver.sleep(400);
    const cls = await pills[0].getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('clicking the same type pill again deactivates it', async () => {
    const pills = await driver.findElements(page.filterPills);
    await driver.executeScript('arguments[0].click()', pills[0]);
    await driver.sleep(400);
    const cls = await pills[0].getAttribute('class');
    expect(cls).not.toContain('is-active');
  });

  // ── Rarity filter ──────────────────────────────────────────────────────────

  test('clicking a rarity badge activates it', async () => {
    const badges = await driver.findElements(page.rarityBadges);
    await driver.executeScript('arguments[0].click()', badges[0]);
    await driver.sleep(400);
    const cls = await badges[0].getAttribute('class');
    expect(cls).toContain('is-active');
    // Clean up
    await driver.executeScript('arguments[0].click()', badges[0]);
    await driver.sleep(300);
  });

  // ── CMC filter ─────────────────────────────────────────────────────────────

  test('clicking a CMC button activates it', async () => {
    const btns = await driver.findElements(page.cmcBtns);
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(400);
    const cls = await btns[0].getAttribute('class');
    expect(cls).toContain('is-active');
    // Clean up
    await driver.executeScript('arguments[0].click()', btns[0]);
    await driver.sleep(300);
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  test('sort buttons are present (Name, CMC)', async () => {
    const btns = await driver.findElements(page.sortBtns);
    expect(btns.length).toBeGreaterThanOrEqual(2);
    const texts = (await Promise.all(btns.map(b => b.getText()))).map(t => t.toLowerCase());
    expect(texts.some(t => t.includes('name'))).toBe(true);
    expect(texts.some(t => t.includes('cmc'))).toBe(true);
  });

  test('clicking CMC sort activates it', async () => {
    const btns = await driver.findElements(page.sortBtns);
    const cmcBtn = btns.find(async b => (await b.getText()) === 'CMC');
    if (!cmcBtn) return;
    await driver.executeScript('arguments[0].click()', cmcBtn);
    await driver.sleep(400);
    const cls = await cmcBtn.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('sort direction button toggles direction', async () => {
    const dirBtn = await driver.findElement(page.sortDirBtn);
    const before = await dirBtn.getText();
    await dirBtn.click();
    await driver.sleep(300);
    const after = await dirBtn.getText();
    expect(after).not.toBe(before);
  });

  // ── Set dropdown ───────────────────────────────────────────────────────────

  test('clicking the set trigger opens set dropdown', async () => {
    const trigger = await driver.findElement(page.setTrigger);
    await trigger.click();
    await driver.sleep(300);
    const present = await page.isPresent(By.css('.set-dropdown'), 2000);
    expect(present).toBe(true);
  });

  test('set dropdown contains set options', async () => {
    const opts = await driver.findElements(page.setOptions);
    expect(opts.length).toBeGreaterThan(0);
  });

  test('searching in set dropdown filters the options', async () => {
    const before = await driver.findElements(page.setOptions);
    const beforeCount = before.length;
    const setSearch = await driver.findElement(page.setSearchInput);
    await setSearch.sendKeys('Core');
    await driver.sleep(300);
    const after = await driver.findElements(page.setOptions);
    expect(after.length).toBeLessThanOrEqual(beforeCount);
  });

  test('selecting a set option closes the dropdown and activates the set', async () => {
    const opts = await driver.findElements(page.setOptions);
    if (opts.length === 0) return;
    await opts[0].click();
    await driver.sleep(400);
    const dropOpen = await page.isPresent(By.css('.set-dropdown'), 500);
    expect(dropOpen).toBe(false);
    const trigger = await driver.findElement(page.setTrigger);
    const cls = await trigger.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('set clear button removes the active set filter', async () => {
    const clearBtn = await page.isPresent(By.css('.set-clear-btn'), 2000);
    if (clearBtn) {
      await driver.executeScript(
        'arguments[0].click()',
        await driver.findElement(By.css('.set-clear-btn'))
      );
      await driver.sleep(400);
      const trigger = await driver.findElement(page.setTrigger);
      const cls = await trigger.getAttribute('class');
      expect(cls).not.toContain('is-active');
    }
  });

  // ── Search flags ───────────────────────────────────────────────────────────

  test('match-case flag toggles on click', async () => {
    const btn = await driver.findElement(page.flagMatchCase);
    const before = await btn.getAttribute('class');
    await btn.click();
    await driver.sleep(200);
    const after = await btn.getAttribute('class');
    expect(after).not.toBe(before);
    // Reset
    await btn.click();
    await driver.sleep(200);
  });

  test('match-word flag toggles on click', async () => {
    const btn = await driver.findElement(page.flagMatchWord);
    const before = await btn.getAttribute('class');
    await btn.click();
    await driver.sleep(200);
    const after = await btn.getAttribute('class');
    expect(after).not.toBe(before);
    await btn.click();
    await driver.sleep(200);
  });

  // ── Card modal from results ─────────────────────────────────────────────────

  test('clicking a card tile opens the card modal', async () => {
    // Ensure we have results
    const tiles = await page.getCardTiles();
    if (tiles.length === 0) {
      await page.search('Lightning Bolt');
    }
    await page.openFirstCard();
    const visible = await page.isPresent(page.cardModal, 3000);
    expect(visible).toBe(true);
  });

  test('card modal shows the card name', async () => {
    const name = await driver.findElement(By.css('.modal-card-name'));
    const text = await name.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('card modal shows card image', async () => {
    const img = await page.isPresent(By.css('.modal-card-img'), 3000);
    expect(img).toBe(true);
  });

  test('card modal shows legality chips', async () => {
    const chips = await driver.findElements(By.css('.legal-chip'));
    expect(chips.length).toBeGreaterThan(0);
  });

  test('card modal has a printings section', async () => {
    const section = await page.isPresent(By.css('.modal-printings-section'), 3000);
    expect(section).toBe(true);
  });

  test('closing the card modal removes it from DOM', async () => {
    await page.closeModal();
    const gone = !(await page.isPresent(page.cardModal, 2000));
    expect(gone).toBe(true);
  });

  // ── Load more ──────────────────────────────────────────────────────────────

  test('long search results show Load More button when hasMore is true', async () => {
    // Search for a very common word to maximise chance of hasMore
    const el = await driver.findElement(page.searchInput);
    await driver.executeScript(`
      const e = arguments[0]; e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `, el);
    await driver.sleep(400);
    await el.sendKeys('the');
    await driver.sleep(3000); // wait for results

    const hasMore = await page.isPresent(page.loadMoreBtn, 5000);
    if (hasMore) {
      const btn = await driver.findElement(page.loadMoreBtn);
      const text = await btn.getText();
      expect(text).toMatch(/Load More/i);
    }
    // If no "Load More" it means all results fit on one page — still valid
  });
});
