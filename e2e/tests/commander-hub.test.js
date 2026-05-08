/**
 * End-to-end tests for the Commander Hub page.
 *
 * Tests:
 *  1. Page loads and shows correct title.
 *  2. Filter bar is present when commanders exist.
 *  3. Date presets (All / 3M / 6M / 1Y / 2Y) change the displayed set.
 *  4. Color identity filter narrows results.
 *  5. Search filter narrows by name.
 *  6. Clear button resets all filters.
 *  7. Clicking a commander card navigates to the detail page.
 *
 * Does not require login (hub is public).
 * Skips gracefully if no community commanders exist yet.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const CommanderHubPage = require('../pages/CommanderHubPage');

jest.setTimeout(120000);

describe('Commander Hub', () => {
  let driver;
  let page;
  let hasCommanders = false;

  beforeAll(async () => {
    driver = await buildDriver();
    page = new CommanderHubPage(driver);
    await page.navigate();
    await page.waitForLoad(15000);
    const count = await page.getCommanderCount();
    hasCommanders = count > 0;
    if (!hasCommanders) {
      console.warn('[commander-hub] No community commanders found — filter tests will be skipped');
    }
  });

  afterAll(async () => {
    await driver.quit();
  });

  // ── Page structure ─────────────────────────────────────────────────────────

  test('page title reads "Commander Hub"', async () => {
    const title = await page.getText(page.pageTitle);
    expect(title).toMatch(/commander hub/i);
  });

  test('subtitle is visible', async () => {
    const sub = await page.isPresent(page.pageSubtitle, 3000);
    expect(sub).toBe(true);
  });

  // ── Filter bar ─────────────────────────────────────────────────────────────

  test('filter bar is present when commanders are loaded', async () => {
    if (!hasCommanders) return;
    const hasBar = await page.isPresent(page.filterBar, 3000);
    expect(hasBar).toBe(true);
  });

  test('date preset group contains All / 3M / 6M / 1Y / 2Y buttons', async () => {
    if (!hasCommanders) return;
    const btns = await driver.findElements(page.dateBtns);
    const labels = await Promise.all(btns.map(b => b.getText().then(t => t.trim().toUpperCase())));
    expect(labels).toEqual(expect.arrayContaining(['ALL', '3M', '6M', '1Y', '2Y']));
  });

  test('"All" preset is active by default', async () => {
    if (!hasCommanders) return;
    const active = await page.getActiveDatePreset();
    expect(active).toBe('ALL');
  });

  test('color filter buttons are present for WUBRGC', async () => {
    if (!hasCommanders) return;
    const btns = await driver.findElements(page.colorButtons);
    expect(btns.length).toBe(6);
  });

  test('search input is present', async () => {
    if (!hasCommanders) return;
    const hasSearch = await page.isPresent(page.searchInput, 3000);
    expect(hasSearch).toBe(true);
  });

  // ── Date filter ────────────────────────────────────────────────────────────

  test('switching to "1Y" preset updates the active button', async () => {
    if (!hasCommanders) return;
    await page.setDatePreset('1Y');
    const active = await page.getActiveDatePreset();
    expect(active).toBe('1Y');  // digits unaffected by text-transform
  });

  test('"1Y" result count is at most the "All" count', async () => {
    if (!hasCommanders) return;
    // Record 1Y count
    const oneYearCount = await page.getCommanderCount();

    // Switch to All
    await page.setDatePreset('All');
    const allCount = await page.getCommanderCount();

    expect(oneYearCount).toBeLessThanOrEqual(allCount);
  });

  test('switching to "2Y" shows at least as many commanders as "1Y"', async () => {
    if (!hasCommanders) return;
    await page.setDatePreset('1Y');
    const oneYear = await page.getCommanderCount();

    await page.setDatePreset('2Y');
    const twoYear = await page.getCommanderCount();

    expect(twoYear).toBeGreaterThanOrEqual(oneYear);
  });

  test('switching to "3M" shows at most "All" commanders', async () => {
    if (!hasCommanders) return;
    await page.setDatePreset('All');
    const allCount = await page.getCommanderCount();

    await page.setDatePreset('3M');
    const threeMonth = await page.getCommanderCount();

    expect(threeMonth).toBeLessThanOrEqual(allCount);
  });

  test('switching back to "All" restores full list', async () => {
    if (!hasCommanders) return;
    await page.setDatePreset('All');
    const count = await page.getCommanderCount();
    expect(count).toBeGreaterThan(0);
    const active = await page.getActiveDatePreset();
    expect(active).toBe('ALL');
  });

  // ── Color filter ───────────────────────────────────────────────────────────

  test('clicking a color pip marks it active', async () => {
    if (!hasCommanders) return;
    await page.toggleColor('G');
    const isActive = await page.isColorActive('G');
    expect(isActive).toBe(true);
  });

  test('color filter reduces (or keeps equal) commander count', async () => {
    if (!hasCommanders) return;
    // G is already active from previous test
    const filtered = await page.getCommanderCount();
    await page.toggleColor('G'); // toggle off
    const all = await page.getCommanderCount();
    expect(filtered).toBeLessThanOrEqual(all);
  });

  test('toggling the same color off removes the active state', async () => {
    if (!hasCommanders) return;
    await page.toggleColor('U');
    await page.toggleColor('U'); // toggle off
    const isActive = await page.isColorActive('U');
    expect(isActive).toBe(false);
  });

  // ── Search filter ──────────────────────────────────────────────────────────

  test('searching by partial name narrows results', async () => {
    if (!hasCommanders) return;
    const allCount = await page.getCommanderCount();

    const names = await page.getCommanderNames();
    if (names.length === 0) return;

    // Take first 3 chars of the first commander name as search query
    const query = names[0].slice(0, 3);
    await page.search(query);
    await driver.sleep(200);

    const filtered = await page.getCommanderCount();
    expect(filtered).toBeLessThanOrEqual(allCount);
  });

  test('search results all contain the query string (case-insensitive)', async () => {
    if (!hasCommanders) return;
    const names = await page.getCommanderNames();
    if (names.length === 0) return;

    const query = names[0].slice(0, 4).toLowerCase();
    const displayedNames = await page.getCommanderNames();
    for (const n of displayedNames) {
      expect(n.toLowerCase()).toContain(query);
    }
  });

  test('searching for a string that matches nothing shows empty state', async () => {
    if (!hasCommanders) return;
    await page.search('zzz_no_match_xyz');
    await driver.sleep(200);
    const count = await page.getCommanderCount();
    const hasEmpty = await page.isPresent(page.emptyEl, 3000);
    expect(count === 0 || hasEmpty).toBe(true);
  });

  // ── Clear filters ──────────────────────────────────────────────────────────

  test('clear button appears when filters are active', async () => {
    if (!hasCommanders) return;
    // After searching for no-match string the clear button should be visible
    const hasClear = await page.isPresent(page.clearBtn, 3000);
    expect(hasClear).toBe(true);
  });

  test('clear button resets search and restores commander list', async () => {
    if (!hasCommanders) return;
    await page.clearFilters();
    const count = await page.getCommanderCount();
    expect(count).toBeGreaterThan(0);
  });

  test('clear button disappears after all filters are cleared', async () => {
    if (!hasCommanders) return;
    const hasClear = await page.isPresent(page.clearBtn, 2000);
    expect(hasClear).toBe(false);
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test('clicking a commander card navigates to the commander detail page', async () => {
    if (!hasCommanders) return;
    await page.clickFirstCommander();
    await page.waitForUrlToContain('/commanders/', 8000);
    const url = await page.getCurrentUrl();
    expect(url).toMatch(/\/commanders\/[a-f0-9-]+/);
  });

  test('commander detail page shows the commander name', async () => {
    if (!hasCommanders) return;
    const hasName = await page.isPresent(By.css('.cd-name'), 8000);
    expect(hasName).toBe(true);
  });

  test('back link on detail page returns to commander hub', async () => {
    if (!hasCommanders) return;
    const backLink = await page.waitForVisible(By.css('.back-link'), 5000);
    await driver.executeScript('arguments[0].click()', backLink);
    await page.waitForUrlToContain('/community/commanders', 8000);
    const url = await page.getCurrentUrl();
    expect(url).toContain('/community/commanders');
  });
});
