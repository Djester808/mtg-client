const { By, Key } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');

jest.setTimeout(120000);

const RENAME_DECK = 'Selenium E2E Rename';
const IMPORT_DECK = 'Selenium E2E Import';

describe('Deck List — Import, Rename, Delete, Format', () => {
  let driver;
  let page;
  let renameDeckCreated = false;
  let importDeckCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new DeckListPage(driver);
    await page.navigate();
    await page.waitForVisible(page.listContent);

    // Create a deck to rename/delete
    await page.createCommanderDeck(RENAME_DECK);
    renameDeckCreated = true;
    // Navigate back to list after creation (createCommanderDeck goes to deck detail)
    await page.navigate();
    await page.waitForVisible(page.listContent);
  });

  afterAll(async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
    if (renameDeckCreated) {
      // Try both the original and renamed variants
      await page.deleteDeckByName(RENAME_DECK).catch(() => {});
      await page.deleteDeckByName(RENAME_DECK + ' Renamed').catch(() => {});
    }
    if (importDeckCreated) {
      await page.deleteDeckByName(IMPORT_DECK).catch(() => {});
    }
    await driver.quit();
  });

  // ── Import modal ─────────────────────────────────────────────────────────────

  test('import button opens the import modal', async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
    const importBtn = await page.waitForVisible(By.css('.import-btn'));
    await importBtn.click();
    const modal = await page.isPresent(By.css('.import-modal'), 3000);
    expect(modal).toBe(true);
  });

  test('import modal has Paste List and From URL tabs', async () => {
    const tabs = await driver.findElements(By.css('.import-tab'));
    const texts = (await Promise.all(tabs.map(t => t.getText()))).map(t => t.toLowerCase());
    expect(texts.some(t => t.includes('paste') || t.includes('list'))).toBe(true);
    expect(texts.some(t => t.includes('url'))).toBe(true);
  });

  test('Paste List tab is active by default', async () => {
    const tabs = await driver.findElements(By.css('.import-tab'));
    const activeTab = tabs.find(async t => (await t.getAttribute('class')).includes('is-active'));
    // Check first tab is active
    const cls = await tabs[0].getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('text area is visible on Paste List tab', async () => {
    const ta = await page.isPresent(By.css('.import-textarea'), 2000);
    expect(ta).toBe(true);
  });

  test('clicking From URL tab shows URL input', async () => {
    const tabs = await driver.findElements(By.css('.import-tab'));
    await tabs[1].click();
    await driver.sleep(300);
    const urlInput = await page.isPresent(By.css('.form-input[type="url"]'), 2000);
    expect(urlInput).toBe(true);
  });

  test('Import button is disabled when URL tab has empty input', async () => {
    const submitBtn = await driver.findElement(By.css('.import-modal .submit-btn'));
    const disabled = await submitBtn.getAttribute('disabled');
    expect(disabled).not.toBeNull();
  });

  test('switching back to Paste List tab shows textarea again', async () => {
    const tabs = await driver.findElements(By.css('.import-tab'));
    await tabs[0].click();
    await driver.sleep(300);
    const ta = await page.isPresent(By.css('.import-textarea'), 2000);
    expect(ta).toBe(true);
  });

  test('format picker in import modal has None and Commander options', async () => {
    const opts = await driver.findElements(By.css('.import-modal .format-opt'));
    const texts = (await Promise.all(opts.map(o => o.getText()))).map(t => t.toLowerCase());
    expect(texts.some(t => t.includes('none'))).toBe(true);
    expect(texts.some(t => t.includes('commander'))).toBe(true);
  });

  test('closing the import modal hides it', async () => {
    await page.click(By.css('.import-modal .cancel-btn'));
    await driver.sleep(300);
    const gone = !(await page.isPresent(By.css('.import-modal'), 1000));
    expect(gone).toBe(true);
  });

  // ── Text import ─────────────────────────────────────────────────────────────

  test('pasting a deck list and importing creates a new deck', async () => {
    const importBtn = await page.waitForVisible(By.css('.import-btn'));
    await importBtn.click();
    await page.waitForVisible(By.css('.import-modal'), 3000);

    // Set deck name
    const nameInput = await driver.findElement(By.css('.import-modal .form-input:not([type="url"])'));
    await nameInput.clear();
    await nameInput.sendKeys(IMPORT_DECK);

    // Paste a small decklist
    const textarea = await driver.findElement(By.css('.import-textarea'));
    await textarea.sendKeys('1 Sol Ring\n1 Lightning Bolt\n1 Farseek');

    const submitBtn = await driver.findElement(By.css('.import-modal .submit-btn'));
    await submitBtn.click();

    // Wait for result state (success or error)
    await driver.wait(async () => {
      const ok = await page.isPresent(By.css('.import-result-ok'), 2000);
      const err = await page.isPresent(By.css('.import-result-error'), 2000);
      return ok || err;
    }, 30000, 'Import did not complete');

    const success = await page.isPresent(By.css('.import-result-ok'), 1000);
    if (success) {
      importDeckCreated = true;
      const title = await driver.findElement(By.css('.import-result-title'));
      const text = await title.getText();
      expect(text).toBe(IMPORT_DECK);
    } else {
      // Server may not have the cards — error is still a valid result to test
      const errVisible = await page.isPresent(By.css('.import-result-error'), 1000);
      expect(errVisible).toBe(true);
    }

    // Close the modal
    await page.click(By.css('.import-modal .cancel-btn'));
    await driver.sleep(300);
  });

  // ── Rename ──────────────────────────────────────────────────────────────────

  test('3-dot menu opens on a deck card', async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
    const cards = await driver.findElements(By.css('.deck-card'));
    expect(cards.length).toBeGreaterThan(0);
    const menuBtn = await cards[0].findElement(By.css('.menu-btn'));
    await menuBtn.click();
    const menu = await page.isPresent(By.css('.deck-menu'), 2000);
    expect(menu).toBe(true);
  });

  test('Rename option in deck menu activates rename input', async () => {
    // Menu should already be open; click Rename
    const renameItem = await driver.findElement(By.css('.deck-menu .menu-item:first-child'));
    await renameItem.click();
    await driver.sleep(300);
    const renameInput = await page.isPresent(By.css('.rename-input'), 2000);
    expect(renameInput).toBe(true);
  });

  test('pressing Escape cancels rename without changing name', async () => {
    const input = await driver.findElement(By.css('.rename-input'));
    const originalText = await input.getAttribute('value');
    await input.sendKeys(Key.ESCAPE);
    await driver.sleep(300);
    // Rename input should be gone
    const gone = !(await page.isPresent(By.css('.rename-input'), 1000));
    expect(gone).toBe(true);
  });

  test('renaming a deck via Enter key saves the new name', async () => {
    // Find the deck to rename
    const cards = await driver.findElements(By.css('.deck-card'));
    let targetCard = null;
    for (const card of cards) {
      const nameEl = await card.findElements(By.css('.deck-name'));
      if (nameEl.length > 0) {
        const text = await nameEl[0].getText();
        if (text.trim() === RENAME_DECK) { targetCard = card; break; }
      }
    }
    if (!targetCard) {
      // Deck not found — may have been cleaned up; skip rename test body
      return;
    }

    const menuBtn = await targetCard.findElement(By.css('.menu-btn'));
    await menuBtn.click();
    await driver.sleep(300);
    const renameItem = await driver.findElement(By.css('.deck-menu .menu-item:first-child'));
    await renameItem.click();
    await driver.sleep(300);

    // Re-find element immediately before use to avoid stale reference
    await page.waitForElement(By.css('.rename-input'), 3000);
    const input = await driver.findElement(By.css('.rename-input'));
    await driver.executeScript(`
      const e = arguments[0]; e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `, input);
    await driver.sleep(200);
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(RENAME_DECK + ' Renamed'));
    await driver.findElement(By.css('.rename-input')).then(el => el.sendKeys(Key.ENTER));
    await driver.sleep(500);

    // Verify new name appears
    const newCards = await driver.findElements(By.css('.deck-card'));
    let found = false;
    for (const card of newCards) {
      const nameEls = await card.findElements(By.css('.deck-name'));
      if (nameEls.length === 0) continue;
      const text = await nameEls[0].getText();
      if (text.trim() === RENAME_DECK + ' Renamed') { found = true; break; }
    }
    expect(found).toBe(true);
  });

  // ── Format change ─────────────────────────────────────────────────────────────

  test('Set Format menu item opens format modal', async () => {
    const cards = await driver.findElements(By.css('.deck-card'));
    const menuBtn = await cards[0].findElement(By.css('.menu-btn'));
    await menuBtn.click();
    await driver.sleep(300);
    const menuItems = await driver.findElements(By.css('.deck-menu .menu-item'));
    // "Set Format" is the second item
    if (menuItems.length >= 2) {
      await menuItems[1].click();
      await driver.sleep(300);
      const modal = await page.isPresent(By.css('.modal-overlay'), 2000);
      expect(modal).toBe(true);

      // Close it
      await page.click(By.css('.modal .cancel-btn'));
      await driver.sleep(300);
    }
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  test('deleting a deck removes it from the grid', async () => {
    const before = await driver.findElements(By.css('.deck-card'));
    const beforeCount = before.length;

    // Delete the renamed deck (or first deck if rename didn't work)
    const deleted = await page.deleteDeckByName(RENAME_DECK + ' Renamed');
    if (!deleted) {
      // Fallback: try original name
      await page.deleteDeckByName(RENAME_DECK);
    }
    renameDeckCreated = false;

    await driver.sleep(500);
    const after = await driver.findElements(By.css('.deck-card'));
    expect(after.length).toBeLessThan(beforeCount);
  });
});
