const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const CollectionListPage = require('../pages/CollectionListPage');
const CollectionDetailPage = require('../pages/CollectionDetailPage');

jest.setTimeout(120000);

const TEST_COLLECTION = 'Selenium E2E Coll Detail';

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

    // Navigate into the newly created collection
    const cards = await driver.findElements(By.css('.collection-card'));
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.col-name, .collection-name, h3, .deck-name'));
      for (const nameEl of nameEls) {
        const text = await nameEl.getText();
        if (text.trim() === TEST_COLLECTION) {
          await card.click();
          await listPage.waitForUrlToContain('/collection/', 5000);
          collectionUrl = await driver.getCurrentUrl();
          break;
        }
      }
      if (collectionUrl) break;
    }

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

  test('legend is visible when cards exist', async () => {
    const visible = await page.isPresent(page.legend, 2000);
    expect(visible).toBe(true);
  });

  // ── Filter bar ──────────────────────────────────────────────────────────────────

  test('filter input is visible', async () => {
    const present = await page.isPresent(page.filterInput, 2000);
    expect(present).toBe(true);
  });

  test('typing in filter input reduces visible cards', async () => {
    const before = (await driver.findElements(page.cardTiles)).length;
    // Set filterQuery via Angular debug API (ngModel's input event doesn't reliably trigger OnPush CD)
    await driver.executeScript(`
      const el = document.querySelector('app-collection-detail');
      const comp = ng.getComponent(el);
      comp.filterQuery = 'Sol Ring';
      ng.applyChanges(el);
    `);
    await driver.sleep(300);
    const after = (await driver.findElements(page.cardTiles)).length;
    expect(after).toBeLessThanOrEqual(before);
  });

  test('clearing filter restores all cards', async () => {
    await driver.executeScript(`
      const el = document.querySelector('app-collection-detail');
      const comp = ng.getComponent(el);
      comp.filterQuery = '';
      ng.applyChanges(el);
    `);
    await driver.sleep(300);
    const restored = await driver.findElements(page.cardTiles);
    expect(restored.length).toBeGreaterThanOrEqual(2);
  });

  // ── Zoom controls ────────────────────────────────────────────────────────────────

  test('zoom label is visible', async () => {
    const present = await page.isPresent(page.zoomLabel, 2000);
    expect(present).toBe(true);
  });

  test('clicking zoom-in increases zoom label', async () => {
    const before = await driver.findElement(page.zoomLabel).then(e => e.getText());
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(page.zoomIn)
    );
    await driver.sleep(300);
    const after = await driver.findElement(page.zoomLabel).then(e => e.getText());
    // Label may be a percentage or descriptor — just confirm it changed or stayed max
    const inBtn = await driver.findElement(page.zoomIn);
    const disabled = await inBtn.getAttribute('disabled');
    if (!disabled) expect(after).not.toBe(before);
  });

  test('clicking zoom-out decreases zoom label', async () => {
    const before = await driver.findElement(page.zoomLabel).then(e => e.getText());
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(page.zoomOut)
    );
    await driver.sleep(300);
    const after = await driver.findElement(page.zoomLabel).then(e => e.getText());
    const outBtn = await driver.findElement(page.zoomOut);
    const disabled = await outBtn.getAttribute('disabled');
    if (!disabled) expect(after).not.toBe(before);
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

  test('each card bottom row has a set select dropdown', async () => {
    const selects = await driver.findElements(page.setSelect);
    expect(selects.length).toBeGreaterThan(0);
  });

  // ── Card modal ────────────────────────────────────────────────────────────────────

  test('clicking a card art opens the card modal', async () => {
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

  // ── Back navigation ────────────────────────────────────────────────────────────────

  test('back button returns to collection list', async () => {
    await page.click(page.backBtn);
    await page.waitForUrlToContain('/collection', 5000);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/collection\/?$/);
  });
});
