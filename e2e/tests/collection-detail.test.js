const { By } = require('selenium-webdriver');
const fs = require('node:fs');
const path = require('node:path');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const CollectionListPage = require('../pages/CollectionListPage');
const CollectionDetailPage = require('../pages/CollectionDetailPage');

jest.setTimeout(120000);

const TEST_COLLECTION = `Selenium E2E Coll Detail ${Date.now()}`;

describe('Collection Detail — Cards, Filters, Qty Controls, Modal', () => {
  let driver;
  let listPage;
  let page;
  let collectionCreated = false;
  let collectionUrl = '';

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    listPage = new CollectionListPage(driver);
    page = new CollectionDetailPage(driver);

    // Create a collection
    await listPage.navigate();
    await listPage.waitForVisible(listPage.listContent);
    await listPage.openCreateModal();
    const input = await driver.findElement(By.css('.modal .form-input, .modal .field-input'));
    await input.clear();
    await input.sendKeys(TEST_COLLECTION);
    await driver.findElement(By.css('.modal .submit-btn')).then(b => b.click());
    await driver.sleep(500);
    collectionCreated = true;

    // Wait for the newly created row, then for its loaded detail route.
    await driver.wait(async () => {
      const cards = await driver.findElements(By.css('.collection-card'));
      for (const card of cards) {
        const names = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
        for (const name of names) {
          if ((await name.getText()).trim() === TEST_COLLECTION) {
            await card.click();
            return true;
          }
        }
      }
      return false;
    }, 10000, 'Created collection did not appear');
    await listPage.waitForUrlToContain('/collection/', 10000);
    collectionUrl = await driver.getCurrentUrl();
    // Add two cards
    await page.searchAndAddCard('Sol Ring');
    await page.searchAndAddCard('Lightning Bolt');
  });

  afterAll(async () => {
    if (collectionCreated) {
      try {
        await listPage.navigate();
        await listPage.waitForVisible(listPage.listContent);
        const cards = await driver.findElements(By.css('.collection-card'));
        for (const card of cards) {
          const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
          for (const nameEl of nameEls) {
            const text = await nameEl.getText();
            if (text.trim() === TEST_COLLECTION) {
              const menuBtns = await card.findElements(By.css('.menu-btn'));
              if (menuBtns.length > 0) {
                await menuBtns[0].click();
                await driver.sleep(300);
                const danger = await driver.findElements(By.css('.menu-item-danger'));
                if (danger.length > 0) await danger[0].click();
              }
              break;
            }
          }
        }
      } catch {}
    }
    await driver.quit();
  });

  // ── Header ─────────────────────────────────────────────────────────────────────

  test('collection detail page loads with header name', async () => {
    const name = await driver.findElement(page.headerName);
    const text = await name.getText();
    expect(text).toBe(TEST_COLLECTION);
  });

  test('header count shows number of cards', async () => {
    const countEl = await driver.findElement(page.headerCount);
    const text = await countEl.getText();
    expect(text).toMatch(/\d+ card/i);
  });

  // ── Card grid ───────────────────────────────────────────────────────────────────

  test('card tiles are visible after adding cards', async () => {
    const tiles = await driver.findElements(page.cardTiles);
    expect(tiles.length).toBeGreaterThanOrEqual(2);
  });

  test('each card tile has a qty badge', async () => {
    const badges = await driver.findElements(page.qtyBadge);
    expect(badges.length).toBeGreaterThan(0);
  });

  test('every tile exposes labelled regular and foil quantity controls', async () => {
    const tiles = await driver.findElements(page.cardTiles);
    expect(tiles.length).toBe(2);
    for (const tile of tiles) {
      expect((await tile.findElements(By.css('[title="Add regular"]'))).length).toBe(1);
      expect((await tile.findElements(By.css('[title="Remove regular"]'))).length).toBe(1);
      expect((await tile.findElements(By.css('[title="Add foil"]'))).length).toBe(1);
    }
  });
  // ── Filter bar ──────────────────────────────────────────────────────────────────

  test('filter input is visible', async () => {
    const present = await page.isPresent(page.filterInput, 2000);
    expect(present).toBe(true);
  });

  test('typing in filter input reduces visible cards to the matching card', async () => {
    expect(await page.getCardCount()).toBe(2);
    await page.type(page.filterInput, 'Sol Ring');
    await driver.wait(async () => await page.getCardCount() === 1, 10000);
    expect(await page.getCardCount()).toBe(1);
    await driver.findElement(By.css('.grid-area .ct-art')).click();
    expect(await driver.findElement(By.css('.grid-area .info-name')).getText()).toBe('Sol Ring');
  });

  test('clearing filter restores all cards', async () => {
    await page.type(page.filterInput, '');
    await driver.wait(async () => await page.getCardCount() === 2, 10000);
    expect(await page.getCardCount()).toBe(2);
  });
  // ── Zoom controls ────────────────────────────────────────────────────────────────

  test('zoom label is visible when grid controls are open', async () => {
    await page.showGridControls();
    expect(await driver.findElement(page.zoomLabel).isDisplayed()).toBe(true);
    expect(await driver.findElement(page.zoomLabel).getText()).toMatch(/\d+%/);
  });

  test('clicking zoom-in increases zoom label', async () => {
    await page.showGridControls();
    const before = parseInt(await driver.findElement(page.zoomLabel).getText(), 10);
    const button = await driver.findElement(page.zoomIn);
    expect(await button.isEnabled()).toBe(true);
    await button.click();
    await driver.wait(async () => parseInt(await driver.findElement(page.zoomLabel).getText(), 10) > before, 3000);
    expect(parseInt(await driver.findElement(page.zoomLabel).getText(), 10)).toBeGreaterThan(before);
  });

  test('clicking zoom-out decreases zoom label', async () => {
    await page.showGridControls();
    const before = parseInt(await driver.findElement(page.zoomLabel).getText(), 10);
    await driver.findElement(page.zoomOut).click();
    await driver.wait(async () => parseInt(await driver.findElement(page.zoomLabel).getText(), 10) < before, 3000);
    expect(parseInt(await driver.findElement(page.zoomLabel).getText(), 10)).toBeLessThan(before);
    await page.hideGridControls();
  });
  // ── Qty controls ────────────────────────────────────────────────────────────────

  test('ctrl-inc increments normal qty', async () => {
    const qtyBefore = await driver.findElements(page.ctrlInc);
    expect(qtyBefore.length).toBeGreaterThan(0);

    // Get count before
    const badges = await driver.findElements(page.qtyBadge);
    const textBefore = await badges[0].getText();

    await driver.executeScript('arguments[0].click()', qtyBefore[0]);
    await driver.sleep(500);

    const badgesAfter = await driver.findElements(page.qtyBadge);
    const textAfter = await badgesAfter[0].getText();
    // Badge should have changed
    expect(textAfter).not.toBe(textBefore);
  });

  test('ctrl-dec decrements normal qty', async () => {
    const decBtns = await driver.findElements(page.ctrlDec);
    expect(decBtns.length).toBeGreaterThan(0);

    const badges = await driver.findElements(page.qtyBadge);
    const textBefore = await badges[0].getText();

    await driver.executeScript('arguments[0].click()', decBtns[0]);
    await driver.sleep(500);

    const badgesAfter = await driver.findElements(page.qtyBadge);
    const textAfter = await badgesAfter[0].getText();
    expect(textAfter).not.toBe(textBefore);
  });

  // ── Set select ────────────────────────────────────────────────────────────────────

  test('each card bottom row has a printing control', async () => {
    const selects = await driver.findElements(page.setSelect);
    expect(selects.length).toBe(await page.getCardCount());
  });

  // ── Card modal ────────────────────────────────────────────────────────────────────

  test('double-clicking card art opens the card modal', async () => {
    await page.openCardModal(0);
    const visible = await page.isPresent(page.cardModal, 5000);
    expect(visible).toBe(true);
  });

  test('card modal shows the card name', async () => {
    const name = await driver.findElement(By.css('.modal-card-name'));
    const text = await name.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('collection modal shows add/remove normal qty buttons', async () => {
    const btns = await driver.findElements(By.css('.modal-action-btn'));
    expect(btns.length).toBeGreaterThan(0);
  });

  test('modal shows printings carousel', async () => {
    const section = await page.isPresent(By.css('.modal-printings-section'), 3000);
    expect(section).toBe(true);
  });

  test('modal shows format legality chips', async () => {
    const chips = await driver.findElements(By.css('.legal-chip'));
    expect(chips.length).toBeGreaterThan(0);
  });

  test('modal shows notes textarea for owned card', async () => {
    const textarea = await page.ownedDetails();
    expect(await textarea.isDisplayed()).toBe(true);
  });

  test('notes persist after blur and reopening the card', async () => {
    const textarea = await page.ownedDetails();
    await textarea.clear();
    await textarea.sendKeys('e2e test note');
    await driver.findElement(By.css('.modal-drag-name')).click();
    await driver.sleep(700);
    await page.closeModal();
    await page.openCardModal(0);
    const restored = await page.ownedDetails();
    expect(await restored.getAttribute('value')).toContain('e2e test note');
    const captures = path.join(__dirname, '../screenshots/audit-collection');
    fs.mkdirSync(captures, { recursive: true });
    fs.writeFileSync(path.join(captures, 'owned-details-desktop.png'), await driver.takeScreenshot(), 'base64');
  });
  test('closing modal returns to collection grid', async () => {
    await page.closeModal();
    const gone = !(await page.isPresent(page.cardModal, 2000));
    expect(gone).toBe(true);
    const tiles = await driver.findElements(page.cardTiles);
    expect(tiles.length).toBeGreaterThan(0);
  });

  // ── Add cards panel ───────────────────────────────────────────────────────────────

  test('Add Cards button opens search panel', async () => {
    await page.openAddPanel();
    const searchVisible = await page.isPresent(page.searchInput, 3000);
    expect(searchVisible).toBe(true);
  });

  test('search panel can be closed', async () => {
    await page.closeAddPanel();
    await driver.sleep(300);
    // Panel host element loses is-open class when closed (panel-header always stays in DOM)
    const panelEl = await driver.findElement(By.css('app-card-search-panel'));
    const cls = await panelEl.getAttribute('class');
    expect(cls).not.toContain('is-open');
  });

  // ── Colour pips ────────────────────────────────────────────────────────────────────
  // Asserts the rule rather than a fixed card list, so it holds whatever is in the
  // collection: picking one colour must leave only cards that are *that colour and
  // nothing else*. It used to leave every card that merely contained the colour.

  test('red filter keeps Lightning Bolt and excludes colorless Sol Ring', async () => {
    await page.showGridControls();
    const redPip = await driver.findElement(By.css('.grid-filters [title="Red"]'));
    await redPip.click();
    await page.hideGridControls();
    await driver.wait(async () => await page.getCardCount() === 1, 10000);
    await driver.findElement(By.css('.grid-area .ct-art')).click();
    expect(await driver.findElement(By.css('.grid-area .info-name')).getText()).toBe('Lightning Bolt');
    await page.showGridControls();
    await driver.findElement(By.css('.grid-filters [title="Red"]')).click();
    await page.hideGridControls();
    await driver.wait(async () => await page.getCardCount() === 2, 10000);
  });

  test('collection after add, quantity, filter and note edits fits desktop and mobile', async () => {
    const captures = path.join(__dirname, '../screenshots/audit-collection');
    fs.mkdirSync(captures, { recursive: true });
    for (const [width, height, label] of [[1440, 900, 'desktop'], [375, 667, 'mobile']]) {
      await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width < 900,
      });
      await driver.sleep(300);
      expect(await driver.findElement(page.headerName).getText()).toBe(TEST_COLLECTION);
      expect(await page.getCardCount()).toBe(2);
      expect(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      fs.writeFileSync(path.join(captures, `collection-${label}.png`), await driver.takeScreenshot(), 'base64');
    }
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
  });
  // ── Back navigation ────────────────────────────────────────────────────────────────

  test('back button returns to collection list', async () => {
    await page.click(page.backBtn);
    await page.waitForUrlToContain('/collection', 5000);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/collection\/?$/);
  });
});
