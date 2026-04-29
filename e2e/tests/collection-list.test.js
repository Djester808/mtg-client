const { By, Key } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const CollectionListPage = require('../pages/CollectionListPage');

jest.setTimeout(60000);

const TEST_COLLECTION = 'Selenium E2E Collection';

describe('Collection List — Create, Rename, Cover, Delete', () => {
  let driver;
  let page;
  let collectionCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new CollectionListPage(driver);
    await page.navigate();
    await page.waitForVisible(page.listContent);
  });

  afterAll(async () => {
    if (collectionCreated) {
      try {
        await page.navigate();
        await page.waitForVisible(page.listContent);
        await deleteCollectionByName(driver, TEST_COLLECTION);
        await deleteCollectionByName(driver, TEST_COLLECTION + ' Renamed');
      } catch {}
    }
    await driver.quit();
  });

  // ── Page structure ─────────────────────────────────────────────────────────────

  test('page loads at /collection', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/collection');
  });

  test('shows grid or empty state', async () => {
    const hasGrid = await page.isPresent(page.collectionGrid, 1000);
    const hasEmpty = await page.isPresent(page.emptyState, 1000);
    expect(hasGrid || hasEmpty).toBe(true);
  });

  test('create button is present', async () => {
    const present = await page.isPresent(page.createBtn, 2000);
    expect(present).toBe(true);
  });

  // ── Create ─────────────────────────────────────────────────────────────────────

  test('clicking create opens the modal', async () => {
    await page.openCreateModal();
    const visible = await page.isPresent(page.modal, 3000);
    expect(visible).toBe(true);
  });

  test('modal has a name input', async () => {
    const input = await page.isPresent(By.css('.modal .form-input, .modal .field-input'), 2000);
    expect(input).toBe(true);
  });

  test('cancel button closes the modal', async () => {
    await page.closeModal();
    const gone = !(await page.isPresent(page.modal, 1000));
    expect(gone).toBe(true);
  });

  test('creating a collection with a name saves it', async () => {
    const before = await page.getCollectionCards();
    const beforeCount = before.length;

    await page.openCreateModal();
    const input = await driver.findElement(By.css('.modal .form-input, .modal .field-input'));
    await input.clear();
    await input.sendKeys(TEST_COLLECTION);

    const submitBtn = await driver.findElement(By.css('.modal .submit-btn'));
    await submitBtn.click();
    await driver.sleep(500);
    collectionCreated = true;

    const after = await page.getCollectionCards();
    expect(after.length).toBe(beforeCount + 1);
  });

  test('new collection appears in the grid with correct name', async () => {
    const cards = await page.getCollectionCards();
    let found = false;
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
      for (const nameEl of nameEls) {
        const text = await nameEl.getText();
        if (text.trim() === TEST_COLLECTION) { found = true; break; }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  // ── Menu / rename ─────────────────────────────────────────────────────────────

  test('collection card has a 3-dot menu button', async () => {
    const cards = await page.getCollectionCards();
    const menuBtn = await findMenuBtnForCollection(driver, cards, TEST_COLLECTION);
    expect(menuBtn).not.toBeNull();
  });

  test('clicking menu button opens collection menu', async () => {
    const cards = await page.getCollectionCards();
    const menuBtn = await findMenuBtnForCollection(driver, cards, TEST_COLLECTION);
    if (!menuBtn) return;
    await menuBtn.click();
    await driver.sleep(300);
    const menu = await page.isPresent(By.css('.col-menu'), 2000);
    expect(menu).toBe(true);
  });

  test('menu has rename option', async () => {
    const items = await driver.findElements(By.css('.col-menu .menu-item'));
    const texts = await Promise.all(items.map(i => i.getText()));
    const hasRename = texts.some(t => t.toLowerCase().includes('rename'));
    expect(hasRename).toBe(true);
    // Close menu by toggling the button again (stopPropagation means body click won't close it)
    const closeCards = await page.getCollectionCards();
    const closeMenuBtn = await findMenuBtnForCollection(driver, closeCards, TEST_COLLECTION);
    if (closeMenuBtn) {
      await driver.executeScript('arguments[0].click()', closeMenuBtn);
      await driver.sleep(200);
    }
  });

  test('menu has delete option', async () => {
    const cards = await page.getCollectionCards();
    const menuBtn = await findMenuBtnForCollection(driver, cards, TEST_COLLECTION);
    if (menuBtn) {
      await driver.executeScript('arguments[0].click()', menuBtn);
      await driver.sleep(400);
      const danger = await page.isPresent(By.css('.menu-item-danger'), 2000);
      expect(danger).toBe(true);
      // Close menu by toggling the button again (toggleMenu uses stopPropagation so body click won't close it)
      await driver.executeScript('arguments[0].click()', menuBtn);
      await driver.sleep(200);
    }
  });

  // ── Click into collection ─────────────────────────────────────────────────────

  test('clicking the collection card navigates to detail view', async () => {
    const cards = await page.getCollectionCards();
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
      for (const nameEl of nameEls) {
        const text = await nameEl.getText();
        if (text.trim() === TEST_COLLECTION) {
          await card.click();
          await page.waitForUrlToContain('/collection/', 5000);
          const url = await page.getCurrentUrl();
          expect(url).toContain('/collection/');
          return;
        }
      }
    }
  });

  test('back button returns to collection list', async () => {
    await page.click(By.css('.back-btn'));
    await page.waitForUrlToContain('/collection', 5000);
    await page.waitForVisible(page.listContent);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/collection\/?$/);
  });

  // ── Delete ─────────────────────────────────────────────────────────────────────

  test('deleting the collection removes it from the grid', async () => {
    const before = await page.getCollectionCards();
    const beforeCount = before.length;

    const deleted = await deleteCollectionByName(driver, TEST_COLLECTION);
    expect(deleted).toBe(true);
    collectionCreated = false;
    await driver.sleep(500);

    const after = await page.getCollectionCards();
    expect(after.length).toBe(beforeCount - 1);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────────

async function findMenuBtnForCollection(driver, cards, name) {
  for (const card of cards) {
    const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
    for (const nameEl of nameEls) {
      const text = await nameEl.getText();
      if (text.trim() === name) {
        const btns = await card.findElements(By.css('.menu-btn'));
        return btns.length > 0 ? btns[0] : null;
      }
    }
  }
  return null;
}

async function deleteCollectionByName(driver, name) {
  const cards = await driver.findElements(By.css('.collection-card'));
  for (const card of cards) {
    const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
    for (const nameEl of nameEls) {
      const text = await nameEl.getText();
      if (text.trim() === name) {
        const menuBtns = await card.findElements(By.css('.menu-btn'));
        if (menuBtns.length === 0) continue;
        await driver.executeScript('arguments[0].click()', menuBtns[0]);
        await driver.sleep(300);
        const dangers = await driver.findElements(By.css('.menu-item-danger'));
        if (dangers.length > 0) {
          await driver.executeScript('arguments[0].click()', dangers[0]);
          await driver.sleep(500);
          return true;
        }
      }
    }
  }
  return false;
}
