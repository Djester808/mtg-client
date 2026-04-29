const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const CollectionListPage = require('../pages/CollectionListPage');

describe('Collection List', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new CollectionListPage(driver);
  });

  afterAll(async () => {
    await driver.quit();
  });

  beforeEach(async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
  });

  test('page loads at /collection', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/collection');
  });

  test('shows collection grid or empty state', async () => {
    const hasGrid = await page.isPresent(page.collectionGrid, 1000);
    const hasEmpty = await page.isPresent(page.emptyState, 1000);
    expect(hasGrid || hasEmpty).toBe(true);
  });

  test('create modal opens', async () => {
    await page.openCreateModal();
    const visible = await page.isPresent(page.modal, 3000);
    expect(visible).toBe(true);
  });

  test('create modal closes on cancel', async () => {
    await page.openCreateModal();
    await page.closeModal();
    const gone = !(await page.isPresent(page.modal, 2000));
    expect(gone).toBe(true);
  });

  test('back button navigates home', async () => {
    await page.click(page.backBtn);
    await page.waitForUrlNotToContain('/collection', 3000);
    const url = await page.getCurrentUrl();
    expect(url).not.toContain('/collection');
  });
});
