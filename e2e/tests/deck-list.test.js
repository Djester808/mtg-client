const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');

describe('Deck List', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new DeckListPage(driver);
  });

  afterAll(async () => {
    await driver.quit();
  });

  beforeEach(async () => {
    await page.navigate();
    await page.waitForVisible(page.listContent);
  });

  test('page loads at /deck', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/deck');
  });

  test('shows deck grid or empty state', async () => {
    const hasGrid = await page.isPresent(page.deckGrid, 1000);
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
    await page.waitForUrlNotToContain('/deck', 3000);
    const url = await page.getCurrentUrl();
    expect(url).not.toMatch(/\/deck($|\/)/);
  });
});
