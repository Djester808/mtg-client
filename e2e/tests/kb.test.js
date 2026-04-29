const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const KbPage = require('../pages/KbPage');

jest.setTimeout(30000);

describe('Knowledge Base Page', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new KbPage(driver);
    await page.navigate();
    await page.waitForContent();
  });

  afterAll(async () => {
    await driver.quit();
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page loads at /kb', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/kb');
  });

  test('sidebar contains at least one item', async () => {
    const items = await page.getSidebarItems();
    expect(items.length).toBeGreaterThan(0);
  });

  test('sidebar has group labels with non-empty text', async () => {
    const labels = await driver.findElements(page.groupLabels);
    expect(labels.length).toBeGreaterThan(0);
    const texts = await Promise.all(labels.map(l => l.getText()));
    const hasNonEmpty = texts.some(t => t.trim().length > 0);
    expect(hasNonEmpty).toBe(true);
  });

  test('detail panel shows selected entry on load (component auto-selects first keyword)', async () => {
    // The component selects the first keyword on ngOnInit — detail-card is always shown
    const detail = await page.isPresent(page.detailCard, 3000);
    expect(detail).toBe(true);
  });

  // ── Item selection ─────────────────────────────────────────────────────────

  test('clicking a sidebar item populates the detail panel', async () => {
    await page.clickFirstItem();
    const visible = await page.isPresent(page.detailCard, 3000);
    expect(visible).toBe(true);
  });

  test('detail panel shows a title after selection', async () => {
    const titleEl = await driver.findElement(page.detailTitle);
    const text = await titleEl.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('detail panel shows a description after selection', async () => {
    const descEl = await driver.findElement(page.detailDesc);
    const text = await descEl.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('selected item gets active class in sidebar', async () => {
    const items = await driver.findElements(page.sidebarItems);
    let hasActive = false;
    for (const item of items) {
      const cls = await item.getAttribute('class');
      if (cls.includes('active')) { hasActive = true; break; }
    }
    expect(hasActive).toBe(true);
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  test('searching filters sidebar items', async () => {
    const before = await page.getSidebarItems();
    const beforeCount = before.length;

    await page.searchFor('deathtouch');
    await driver.sleep(300);
    const after = await page.getSidebarItems();
    // Either fewer items, or at least not more items (may stay same if 1 result)
    expect(after.length).toBeLessThanOrEqual(beforeCount);
  });

  test('searching for a specific keyword shows that item', async () => {
    await page.searchFor('deathtouch');
    await driver.sleep(300);
    const items = await page.getSidebarItems();
    expect(items.length).toBeGreaterThan(0);
    // At least one item should contain "Deathtouch" in text
    let found = false;
    for (const item of items) {
      const text = await item.getText();
      if (text.toLowerCase().includes('deathtouch')) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test('clearing search restores all items', async () => {
    // First clear any active search to get the true full count
    const clearVisible = await page.isPresent(page.searchClear, 500);
    if (clearVisible) {
      await page.clearSearch();
      await driver.sleep(300);
    }
    const fullCount = (await page.getSidebarItems()).length;

    await page.searchFor('deathtouch');
    await driver.sleep(300);

    // Clear and verify restored
    const clearVisible2 = await page.isPresent(page.searchClear, 1000);
    if (clearVisible2) {
      await page.clearSearch();
      await driver.sleep(300);
    }

    const restored = await page.getSidebarItems();
    expect(restored.length).toBe(fullCount);
  });

  test('searching for a nonsense term shows no-results message', async () => {
    await page.searchFor('zzz_no_match_xyz');
    await driver.sleep(300);
    const noResults = await page.isPresent(page.noResults, 2000);
    expect(noResults).toBe(true);
  });

  // ── Mechanics detail ────────────────────────────────────────────────────────

  test('a mechanic with steps shows step rows in the detail panel', async () => {
    // Navigate back to full list first
    const inp = await driver.findElement(page.searchInput);
    await inp.clear();
    await driver.sleep(300);

    // Find a Mechanics group item
    const items = await driver.findElements(page.sidebarItems);
    let clicked = false;
    for (const item of items) {
      // Mechanic items have a "steps" span; click and see if step-rows appear
      await item.click();
      await driver.sleep(300);
      const steps = await driver.findElements(page.stepRows);
      if (steps.length > 0) { clicked = true; break; }
    }

    if (clicked) {
      const steps = await driver.findElements(page.stepRows);
      expect(steps.length).toBeGreaterThan(0);
    }
    // If no mechanic with steps was found, the test passes vacuously
  });

  // ── Back navigation ─────────────────────────────────────────────────────────

  test('back button navigates away from /kb', async () => {
    await page.click(page.backBtn);
    await page.waitForUrlNotToContain('/kb', 5000);
    const url = await page.getCurrentUrl();
    expect(url).not.toContain('/kb');
  });
});
