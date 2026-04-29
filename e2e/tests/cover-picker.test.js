const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const CollectionListPage = require('../pages/CollectionListPage');

jest.setTimeout(120000);

const TEST_COLLECTION = 'Selenium E2E Cover Picker';

describe('Cover Picker Modal — Open, Search, Select, Dismiss', () => {
  let driver;
  let page;
  let collectionCreated = false;

  // Opens the cover picker for the test collection from the collection list page.
  async function openCoverPicker() {
    await page.navigate();
    await page.waitForVisible(page.listContent);
    const cards = await driver.findElements(By.css('.collection-card'));
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
      for (const nameEl of nameEls) {
        const text = await nameEl.getText();
        if (text.trim() === TEST_COLLECTION) {
          const menuBtns = await card.findElements(By.css('.menu-btn'));
          if (menuBtns.length === 0) continue;
          await driver.executeScript('arguments[0].click()', menuBtns[0]);
          await driver.sleep(300);
          const items = await driver.findElements(By.css('.col-menu .menu-item'));
          for (const item of items) {
            const t = await item.getText();
            if (t.toLowerCase().includes('cover')) {
              await driver.executeScript('arguments[0].click()', item);
              await driver.wait(async () => {
                const overlays = await driver.findElements(By.css('.cp-overlay'));
                return overlays.length > 0;
              }, 5000, 'Cover picker overlay did not open');
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new CollectionListPage(driver);

    await page.navigate();
    await page.waitForVisible(page.listContent);
    await page.openCreateModal();
    const input = await driver.findElement(By.css('.modal .form-input, .modal .field-input'));
    await input.clear();
    await input.sendKeys(TEST_COLLECTION);
    await driver.findElement(By.css('.modal .submit-btn')).then(b => b.click());
    await driver.sleep(500);
    collectionCreated = true;
  });

  afterAll(async () => {
    if (collectionCreated) {
      try {
        await page.navigate();
        await page.waitForVisible(page.listContent);
        const cards = await driver.findElements(By.css('.collection-card'));
        for (const card of cards) {
          const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
          for (const nameEl of nameEls) {
            const text = await nameEl.getText();
            if (text.trim() === TEST_COLLECTION) {
              const menuBtns = await card.findElements(By.css('.menu-btn'));
              if (menuBtns.length > 0) {
                await driver.executeScript('arguments[0].click()', menuBtns[0]);
                await driver.sleep(300);
                const dangers = await driver.findElements(By.css('.menu-item-danger'));
                if (dangers.length > 0) {
                  await driver.executeScript('arguments[0].click()', dangers[0]);
                }
              }
              break;
            }
          }
        }
      } catch {}
    }
    await driver.quit();
  });

  // ── Menu entry ─────────────────────────────────────────────────────────────────

  test('collection menu has a "Set Cover Image" option', async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
    const cards = await driver.findElements(By.css('.collection-card'));
    let found = false;
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
      for (const nameEl of nameEls) {
        const text = await nameEl.getText();
        if (text.trim() === TEST_COLLECTION) {
          const menuBtns = await card.findElements(By.css('.menu-btn'));
          await driver.executeScript('arguments[0].click()', menuBtns[0]);
          await driver.sleep(300);
          const items = await driver.findElements(By.css('.col-menu .menu-item'));
          const texts = await Promise.all(items.map(i => i.getText()));
          found = texts.some(t => t.toLowerCase().includes('cover'));
          // Close menu by toggling
          await driver.executeScript('arguments[0].click()', menuBtns[0]);
          await driver.sleep(200);
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  test('clicking "Set Cover Image" opens the cover picker modal', async () => {
    await openCoverPicker();
    const present = await page.isPresent(By.css('.cp-overlay'), 3000);
    expect(present).toBe(true);
  });

  // ── Modal structure ─────────────────────────────────────────────────────────────

  test('picker shows a "Set Cover Image" header', async () => {
    const header = await driver.findElement(By.css('.cp-header h2'));
    const text = await header.getText();
    expect(text.toLowerCase()).toContain('cover');
  });

  test('picker has a search input', async () => {
    const present = await page.isPresent(By.css('.cp-search-input'), 2000);
    expect(present).toBe(true);
  });

  test('picker shows hint text before any search', async () => {
    const hint = await page.isPresent(By.css('.cp-hint'), 2000);
    expect(hint).toBe(true);
  });

  test('picker has a close button', async () => {
    const btn = await page.isPresent(By.css('.cp-close'), 2000);
    expect(btn).toBe(true);
  });

  // ── Search ──────────────────────────────────────────────────────────────────────

  test('typing a card name shows thumbnails', async () => {
    const input = await driver.findElement(By.css('.cp-search-input'));
    await input.click();
    await input.sendKeys('Lightning Bolt');
    // Wait for results grid to appear (debounce is 350ms)
    await driver.wait(async () => {
      const thumbs = await driver.findElements(By.css('.cp-thumb'));
      return thumbs.length > 0;
    }, 12000, 'Cover picker thumbnails did not load');
    const thumbs = await driver.findElements(By.css('.cp-thumb'));
    expect(thumbs.length).toBeGreaterThan(0);
  });

  test('thumbnails include card images', async () => {
    const imgs = await driver.findElements(By.css('.cp-thumb img'));
    expect(imgs.length).toBeGreaterThan(0);
  });

  test('searching for a non-existent name shows empty state', async () => {
    const input = await driver.findElement(By.css('.cp-search-input'));
    await driver.executeScript(`
      const el = arguments[0]; el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, input);
    await driver.sleep(450);
    await input.sendKeys('zzzznotacardname12345');
    await driver.wait(async () => {
      const empty = await driver.findElements(By.css('.cp-empty'));
      const loading = await driver.findElements(By.css('.cp-loading'));
      return empty.length > 0 || (loading.length === 0 && (await driver.findElements(By.css('.cp-grid'))).length === 0);
    }, 10000, 'Cover picker empty state did not appear');
    const empty = await page.isPresent(By.css('.cp-empty'), 3000);
    expect(empty).toBe(true);
  });

  // ── Selection ───────────────────────────────────────────────────────────────────

  test('clicking a thumbnail closes the picker (cover selected)', async () => {
    // Re-open and search for a real card
    await openCoverPicker();
    const input = await driver.findElement(By.css('.cp-search-input'));
    await input.click();
    await input.sendKeys('Sol Ring');
    await driver.wait(async () => {
      const thumbs = await driver.findElements(By.css('.cp-thumb'));
      return thumbs.length > 0;
    }, 12000, 'Thumbnails did not appear for selection test');
    const thumbs = await driver.findElements(By.css('.cp-thumb'));
    await driver.executeScript('arguments[0].click()', thumbs[0]);
    await driver.sleep(400);
    const gone = !(await page.isPresent(By.css('.cp-overlay'), 1000));
    expect(gone).toBe(true);
  });

  // ── Dismiss ─────────────────────────────────────────────────────────────────────

  test('close button dismisses the picker', async () => {
    await openCoverPicker();
    const btn = await driver.findElement(By.css('.cp-close'));
    await btn.click();
    await driver.sleep(300);
    const gone = !(await page.isPresent(By.css('.cp-overlay'), 1000));
    expect(gone).toBe(true);
  });

  test('clicking the overlay background dismisses the picker', async () => {
    await openCoverPicker();
    const overlay = await driver.findElement(By.css('.cp-overlay'));
    await driver.executeScript('arguments[0].click()', overlay);
    await driver.sleep(300);
    const gone = !(await page.isPresent(By.css('.cp-overlay'), 1000));
    expect(gone).toBe(true);
  });
});
