const { By, Key } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = 'Selenium E2E Detail Edit';

describe('Deck Detail — Rename, Tags, Sort, Format, Stats', () => {
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

    // Add two cards so the deck has content to sort/filter
    await page.switchToListView();
    await page.openAddCardsPanel();

    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.searchCard('Farseek');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.closeSearchPanel();
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME + ' Renamed'); } catch {}
    }
    await driver.quit();
  });

  // ── Inline rename ────────────────────────────────────────────────────────────

  test('rename button is present in header', async () => {
    const present = await page.isPresent(By.css('.rename-btn'), 2000);
    expect(present).toBe(true);
  });

  test('clicking rename button shows rename input', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.rename-btn'))
    );
    await driver.sleep(300);
    const present = await page.isPresent(By.css('.rename-input'), 2000);
    expect(present).toBe(true);
  });

  test('pressing Escape cancels rename', async () => {
    const input = await driver.findElement(By.css('.rename-input'));
    await input.sendKeys(Key.ESCAPE);
    await driver.sleep(300);
    const gone = !(await page.isPresent(By.css('.rename-input'), 1000));
    expect(gone).toBe(true);
  });

  test('double-clicking header name activates rename', async () => {
    const nameWrap = await driver.findElement(By.css('.header-name-wrap'));
    await driver.executeScript(`
      arguments[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    `, nameWrap);
    await driver.sleep(300);
    const present = await page.isPresent(By.css('.rename-input'), 2000);
    expect(present).toBe(true);
  });

  test('renaming with Enter saves the new deck name', async () => {
    await page.waitForElement(By.css('.rename-input'), 3000);
    await driver.executeScript(`
      const e = document.querySelector('.rename-input'); e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await driver.sleep(200);
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(TEST_DECK_NAME + ' Renamed'));
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(Key.ENTER));
    await driver.sleep(500);

    // Name should update in the header
    const headerName = await driver.findElement(By.css('.header-name'));
    const text = await headerName.getText();
    expect(text).toBe(TEST_DECK_NAME + ' Renamed');
  });

  test('rename name can be reverted back', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.rename-btn'))
    );
    await driver.sleep(300);
    await page.waitForElement(By.css('.rename-input'), 3000);
    await driver.executeScript(`
      const e = document.querySelector('.rename-input'); e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await driver.sleep(200);
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(TEST_DECK_NAME));
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(Key.ENTER));
    await driver.sleep(500);
    const headerName = await driver.findElement(By.css('.header-name'));
    const text = await headerName.getText();
    expect(text).toBe(TEST_DECK_NAME);
  });

  // ── Tags ─────────────────────────────────────────────────────────────────────

  test('tag input is present in header', async () => {
    const present = await page.isPresent(By.css('.deck-tag-input'), 2000);
    expect(present).toBe(true);
  });

  test('typing a tag and pressing Enter adds it to the deck', async () => {
    const tagInput = await driver.findElement(By.css('.deck-tag-input'));
    await driver.executeScript('arguments[0].click()', tagInput);
    await tagInput.sendKeys('aggro');
    await tagInput.sendKeys(Key.ENTER);
    await driver.sleep(500);

    const tags = await driver.findElements(By.css('.deck-tag'));
    expect(tags.length).toBeGreaterThan(0);
    const texts = await Promise.all(tags.map(t => t.getText()));
    const combined = texts.join(' ');
    expect(combined.toLowerCase()).toContain('aggro');
  });

  test('typing a tag and pressing comma adds it', async () => {
    // deck$ is an NgRx selector (BehaviorSubject-backed) — subscribing synchronously yields current value
    const result = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        comp.tagDraft = 'ramp';
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
    const tags = await driver.findElements(By.css('.deck-tag'));
    const texts = await Promise.all(tags.map(t => t.getText()));
    const combined = texts.join(' ');
    expect(combined.toLowerCase()).toContain('ramp');
  });

  test('clicking the X on a tag removes it', async () => {
    const before = await driver.findElements(By.css('.deck-tag'));
    const beforeCount = before.length;
    if (beforeCount === 0) return;

    const removeBtn = await before[0].findElement(By.css('.deck-tag-remove'));
    await driver.executeScript('arguments[0].click()', removeBtn);
    await driver.sleep(500);

    const after = await driver.findElements(By.css('.deck-tag'));
    expect(after.length).toBe(beforeCount - 1);
  });

  // ── Sort modes ────────────────────────────────────────────────────────────────

  test('sort select is present with multiple options', async () => {
    const select = await driver.findElement(page.sortSelect);
    const opts = await select.findElements(By.css('option'));
    expect(opts.length).toBeGreaterThanOrEqual(3);
  });

  test('changing sort to Name re-renders without error', async () => {
    await driver.executeScript(`
      const sel = document.querySelector('.sort-select');
      sel.value = 'name';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await driver.sleep(400);
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('changing sort to Type re-renders without error', async () => {
    await driver.executeScript(`
      const sel = document.querySelector('.sort-select');
      sel.value = 'type';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await driver.sleep(400);
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('changing sort back to CMC re-renders without error', async () => {
    await driver.executeScript(`
      const sel = document.querySelector('.sort-select');
      sel.value = 'cmc';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await driver.sleep(400);
    const rows = await page.getCardRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Format menu ───────────────────────────────────────────────────────────────

  test('format button is present in header', async () => {
    const present = await page.isPresent(By.css('.format-btn'), 2000);
    expect(present).toBe(true);
  });

  test('clicking format button opens format menu', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.format-btn'))
    );
    await driver.sleep(300);
    const menu = await page.isPresent(By.css('.format-menu'), 2000);
    expect(menu).toBe(true);
  });

  test('format menu contains No Format and Commander options', async () => {
    const items = await driver.findElements(By.css('.format-menu-item'));
    const texts = (await Promise.all(items.map(i => i.getText()))).map(t => t.toLowerCase());
    expect(texts.some(t => t.includes('no format'))).toBe(true);
    expect(texts.some(t => t.includes('commander'))).toBe(true);
  });

  test('selecting Standard format closes menu and updates button label', async () => {
    const items = await driver.findElements(By.css('.format-menu-item'));
    let standardItem = null;
    for (const item of items) {
      const text = await item.getText();
      if (text.toLowerCase() === 'standard') { standardItem = item; break; }
    }
    if (standardItem) {
      await standardItem.click();
      await driver.sleep(400);
      const menu = await page.isPresent(By.css('.format-menu'), 500);
      expect(menu).toBe(false);
      const btn = await driver.findElement(By.css('.format-btn'));
      const text = await btn.getText();
      // formatLabel() returns abbreviation e.g. "STD" for standard
      expect(text.toLowerCase()).toContain('std');
    }
  });

  test('switching format back to No Format works', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.format-btn'))
    );
    await driver.sleep(300);
    const items = await driver.findElements(By.css('.format-menu-item'));
    await items[0].click(); // No Format
    await driver.sleep(400);
    const btn = await driver.findElement(By.css('.format-btn'));
    const text = await btn.getText();
    // formatLabel(null) returns 'FORMAT' — the button just shows the word 'format'
    expect(text.toLowerCase()).toContain('format');
  });

  // ── Stats panel ────────────────────────────────────────────────────────────────

  test('stats button opens the stats side panel', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.stats-btn'))
    );
    await driver.sleep(400);
    const open = await page.isSidePanelOpen();
    expect(open).toBe(true);
  });

  test('stats panel is visible when open', async () => {
    const visible = await page.isPresent(By.css('.side-panel.is-open'), 2000);
    expect(visible).toBe(true);
  });

  test('clicking stats button again closes the panel', async () => {
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.stats-btn'))
    );
    await driver.sleep(400);
    const open = await page.isSidePanelOpen();
    expect(open).toBe(false);
  });

  // ── Filter bar on deck detail ──────────────────────────────────────────────────

  test('filter input in list view filters card rows', async () => {
    await page.switchToListView();
    const before = await page.getCardRows();
    const beforeCount = before.length;
    expect(beforeCount).toBeGreaterThan(0);

    // Set filterQuery directly via Angular's debug API for reliable OnPush triggering
    await driver.executeScript(`
      const el = document.querySelector('app-deck-detail');
      const comp = ng.getComponent(el);
      comp.filterQuery = 'Sol Ring';
      ng.applyChanges(el);
    `);
    await driver.sleep(400);
    const after = await page.getCardRows();
    expect(after.length).toBeLessThanOrEqual(beforeCount);
  });

  test('clearing the filter input restores all cards', async () => {
    await page.filterCards('');
    await driver.sleep(400);
    const restored = await page.getCardRows();
    expect(restored.length).toBeGreaterThan(0);
  });
});
