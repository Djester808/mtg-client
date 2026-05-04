/**
 * Diagnostic: "little error" popup on the search bar closes immediately.
 *
 * Tests four candidates:
 *   A) Violation-panel badge  (Singleton / Color-ID cp-check → .violation-panel)
 *   B) Search-panel set-filter dropdown  (.set-trigger → .set-dropdown)
 *   C) Card-art preview modal  (.result-art-clickable → app-card-modal)
 *   D) Add-error badge stays visible  (.add-result-btn → .result-set-error)
 *
 * Each test clicks the element then logs component state at 50 ms and 600 ms
 * so the output shows exactly which popup closes and how quickly.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120_000);

const DECK_NAME = '__e2e_search_error_diag__';
// 2 Lightning Bolts → singleton violation when format = commander
const DECK_TEXT = '2 Lightning Bolt\n1 Counterspell\n1 Sol Ring\n4 Mountain\n4 Island\n4 Plains';

// ── Angular introspection helpers ─────────────────────────────────────────────

async function getSearchPanelState(driver) {
  return driver.executeScript(`
    try {
      const el = document.querySelector('app-card-search-panel');
      if (!el) return { present: false };
      const comp = ng.getComponent(el);
      if (!comp) return { present: true, compFound: false };
      return {
        present:     true,
        isOpen:      comp._isOpen,
        setDropOpen: comp.setDropOpen,
        addErrors:   comp.addErrors ? [...comp.addErrors] : [],
        previewCard: comp.previewCard ? comp.previewCard.name : null,
        resultCount: comp.results   ? comp.results.length   : 0,
      };
    } catch(e) { return { error: e.message }; }
  `);
}

async function getDeckDetailState(driver) {
  return driver.executeScript(`
    try {
      const el = document.querySelector('app-deck-detail');
      if (!el) return null;
      const comp = ng.getComponent(el);
      if (!comp) return null;
      return {
        violationPanelType: comp.violationPanelType,
        showSearchPanel:    comp.showSearchPanel,
      };
    } catch(e) { return { error: e.message }; }
  `);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Search-bar error popup — diagnostic', () => {
  let driver, page, testDeckId;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);

    const deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    // ── Import test deck ─────────────────────────────────────────────────
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    const importBtn = await driver.findElement(By.css('.import-btn'));
    await driver.executeScript('arguments[0].click()', importBtn);
    await driver.wait(async () =>
      (await driver.findElements(By.css('.import-modal'))).length > 0
    , 5000, 'import modal did not open');

    await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-deck-list'));
      comp.importName   = arguments[0];
      comp.importText   = arguments[1];
      comp.importTab    = 'text';
      comp.importFormat = 'commander';
      ng.applyChanges(comp);
      comp.submitImport();
    `, DECK_NAME, DECK_TEXT);

    await driver.wait(() => driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-deck-list'));
        return comp && (comp.importState === 'done' || comp.importState === 'error');
      } catch(e) { return false; }
    `), 30_000, 'import did not complete');

    testDeckId = await driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-deck-list'));
        return comp && comp.importResult && comp.importResult.deck
          ? comp.importResult.deck.id : null;
      } catch(e) { return null; }
    `);
    console.log('[setup] testDeckId:', testDeckId);
    if (!testDeckId) throw new Error('Import failed — no deck id');

    // ── Navigate to deck ─────────────────────────────────────────────────
    await driver.get(`http://localhost:4200/deck/${testDeckId}`);
    await page.waitForVisible(page.backBtn, 10_000);
    await driver.sleep(1500);   // let store settle + async pipe bind

    console.log('[setup] ready');
  }, 90_000);  // explicit 90s budget for beforeAll

  afterAll(async () => {
    if (testDeckId && driver) {
      try {
        await driver.executeScript(
          `return fetch('/api/decks/' + arguments[0], { method: 'DELETE' })`,
          testDeckId
        );
        console.log('[teardown] deleted', testDeckId);
      } catch {}
    }
    if (driver) await driver.quit();
  }, 15_000);

  // ── A: Violation-panel badge ─────────────────────────────────────────────

  test('A — violation badge: panel opens and stays open at 600 ms', async () => {
    const hasBar = await page.isPresent(By.css('.validation-bar'), 3000);
    console.log('[A] validation-bar present:', hasBar);
    if (!hasBar) { console.warn('[A] no validation bar'); return; }

    const allBadges = await driver.findElements(By.css('.cp-check'));
    const badgeInfo = await Promise.all(allBadges.map(async b => ({
      text: await b.getText().catch(() => '?'),
      cls:  await b.getAttribute('class'),
    })));
    console.log('[A] all cp-check badges:', JSON.stringify(badgeInfo));

    const clickable = await driver.findElements(By.css('.cp-check.clickable'));
    console.log('[A] clickable badges:', clickable.length);
    if (clickable.length === 0) {
      console.warn('[A] no clickable violation badges — check if singleton violations exist');
      return;
    }

    const txt = await clickable[0].getText();
    const cls = await clickable[0].getAttribute('class');
    console.log('[A] clicking:', txt, '| classes:', cls);

    const before = await getDeckDetailState(driver);
    console.log('[A] state BEFORE click:', JSON.stringify(before));

    await driver.executeScript('arguments[0].click()', clickable[0]);

    await driver.sleep(50);
    const s50 = await getDeckDetailState(driver);
    const panel50 = (await driver.findElements(By.css('.violation-panel'))).length;
    const overlay50 = (await driver.findElements(By.css('.violation-overlay'))).length;
    console.log('[A]  50ms — state:', JSON.stringify(s50));
    console.log('[A]  50ms — .violation-panel:', panel50, ' .violation-overlay:', overlay50);

    await driver.sleep(550);
    const s600 = await getDeckDetailState(driver);
    const panel600 = (await driver.findElements(By.css('.violation-panel'))).length;
    console.log('[A] 600ms — state:', JSON.stringify(s600));
    console.log('[A] 600ms — .violation-panel:', panel600);

    expect(s600.violationPanelType).not.toBeNull();
    expect(panel600).toBeGreaterThan(0);
  });

  // ── B: Set-filter dropdown ───────────────────────────────────────────────

  test('B — search panel set dropdown: opens and stays open at 600 ms', async () => {
    // Open the search panel if closed
    const panelState = await getSearchPanelState(driver);
    if (!panelState?.isOpen) {
      const addBtn = await driver.findElement(page.addCardsBtn);
      await driver.executeScript('arguments[0].click()', addBtn);
      await page.waitForVisible(page.searchInput, 5000);
      await driver.sleep(400);
    }

    // Reset dropdown state
    await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-card-search-panel'));
      if (comp && comp.setDropOpen) { comp.setDropOpen = false; ng.applyChanges(comp); }
    `);
    await driver.sleep(100);

    const setTrigger = await driver.findElement(By.css('.set-trigger'));
    const before = await getSearchPanelState(driver);
    console.log('[B] state BEFORE click:', JSON.stringify(before));

    await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', setTrigger);
    await driver.executeScript('arguments[0].click()', setTrigger);

    await driver.sleep(50);
    const s50 = await getSearchPanelState(driver);
    const drop50 = (await driver.findElements(By.css('.set-dropdown'))).length;
    console.log('[B]  50ms — state:', JSON.stringify(s50));
    console.log('[B]  50ms — .set-dropdown in DOM:', drop50);

    await driver.sleep(550);
    const s600 = await getSearchPanelState(driver);
    const drop600 = (await driver.findElements(By.css('.set-dropdown'))).length;
    console.log('[B] 600ms — state:', JSON.stringify(s600));
    console.log('[B] 600ms — .set-dropdown in DOM:', drop600);

    expect(s600?.setDropOpen).toBe(true);
    expect(drop600).toBeGreaterThan(0);
  });

  // ── C: Card-art preview modal ────────────────────────────────────────────

  test('C — search result art: preview modal opens and stays open at 600 ms', async () => {
    // Ensure panel open, set dropdown closed, no preview
    let ps = await getSearchPanelState(driver);
    if (!ps?.isOpen) {
      const addBtn = await driver.findElement(page.addCardsBtn);
      await driver.executeScript('arguments[0].click()', addBtn);
      await page.waitForVisible(page.searchInput, 5000);
      await driver.sleep(400);
    }
    await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-card-search-panel'));
      if (comp) { comp.setDropOpen = false; comp.previewCard = null; ng.applyChanges(comp); }
    `);

    // Search for something with results
    const input = await driver.findElement(page.searchInput);
    await input.clear();
    await input.sendKeys('Island');
    await driver.sleep(1500);

    const rows = await driver.findElements(By.css('.result-row'));
    console.log('[C] result rows:', rows.length);
    if (rows.length === 0) { console.warn('[C] no results'); return; }

    const artEls = await driver.findElements(By.css('.result-art-clickable'));
    console.log('[C] .result-art-clickable elements:', artEls.length);
    if (artEls.length === 0) { console.warn('[C] no art elements'); return; }

    const before = await getSearchPanelState(driver);
    console.log('[C] state BEFORE click:', JSON.stringify(before));

    await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', artEls[0]);
    await driver.executeScript('arguments[0].click()', artEls[0]);

    await driver.sleep(50);
    const s50 = await getSearchPanelState(driver);
    const modal50 = (await driver.findElements(By.css('.card-modal'))).length;
    console.log('[C]  50ms — state:', JSON.stringify(s50));
    console.log('[C]  50ms — .card-modal in DOM:', modal50);

    await driver.sleep(550);
    const s600 = await getSearchPanelState(driver);
    const modal600 = (await driver.findElements(By.css('.card-modal'))).length;
    console.log('[C] 600ms — state:', JSON.stringify(s600));
    console.log('[C] 600ms — .card-modal in DOM:', modal600);

    expect(s600?.previewCard).not.toBeNull();
    expect(modal600).toBeGreaterThan(0);
  });

  // ── D: Add-error badge stays visible ────────────────────────────────────

  test('D — add-error badge: stays visible at 600 ms after clicking Add', async () => {
    let ps = await getSearchPanelState(driver);
    if (!ps?.isOpen) {
      const addBtn = await driver.findElement(page.addCardsBtn);
      await driver.executeScript('arguments[0].click()', addBtn);
      await page.waitForVisible(page.searchInput, 5000);
      await driver.sleep(400);
    }
    await driver.executeScript(`
      const comp = ng.getComponent(document.querySelector('app-card-search-panel'));
      if (comp) { comp.setDropOpen = false; comp.previewCard = null; ng.applyChanges(comp); }
    `);

    // Search and wait for results + printings
    const input = await driver.findElement(page.searchInput);
    await input.clear();
    await input.sendKeys('Lightning Bolt');
    await driver.sleep(2500);

    const rows = await driver.findElements(By.css('.result-row'));
    console.log('[D] result rows:', rows.length);
    if (rows.length === 0) { console.warn('[D] no results'); return; }

    // Log printings state for the first result
    const printInfo = await driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-card-search-panel'));
        const card = comp.results[0];
        if (!card) return null;
        const prints = comp.printingsCache.get(card.oracleId);
        return {
          name:          card.name,
          printingCount: prints ? prints.length : 'not cached',
          autoSelected:  comp.searchSelectedScryfallId.get(card.oracleId) || null,
        };
      } catch(e) { return { error: e.message }; }
    `);
    console.log('[D] first result printings:', JSON.stringify(printInfo));

    // Force the error: clear selection on a card with >1 printings
    const cleared = await driver.executeScript(`
      try {
        const comp = ng.getComponent(document.querySelector('app-card-search-panel'));
        for (const card of (comp.results || [])) {
          const prints = comp.printingsCache.get(card.oracleId);
          if (prints && prints.length > 1) {
            comp.searchSelectedScryfallId.delete(card.oracleId);
            ng.applyChanges(comp);
            return { cleared: true, name: card.name, printingCount: prints.length };
          }
        }
        return { cleared: false };
      } catch(e) { return { error: e.message }; }
    `);
    console.log('[D] cleared selection:', JSON.stringify(cleared));
    if (!cleared?.cleared) { console.warn('[D] no multi-printing card to force error'); return; }

    const addBtns = await driver.findElements(By.css('.add-result-btn'));
    if (addBtns.length === 0) { console.warn('[D] no Add buttons'); return; }

    const before = await getSearchPanelState(driver);
    console.log('[D] state BEFORE clicking Add:', JSON.stringify(before));

    await driver.executeScript('arguments[0].click()', addBtns[0]);

    await driver.sleep(50);
    const s50 = await getSearchPanelState(driver);
    const err50 = (await driver.findElements(By.css('.result-set-error'))).length;
    console.log('[D]  50ms — state:', JSON.stringify(s50));
    console.log('[D]  50ms — .result-set-error in DOM:', err50);

    await driver.sleep(550);
    const s600 = await getSearchPanelState(driver);
    const err600 = (await driver.findElements(By.css('.result-set-error'))).length;
    console.log('[D] 600ms — state:', JSON.stringify(s600));
    console.log('[D] 600ms — .result-set-error in DOM:', err600);

    expect(s600?.addErrors?.length).toBeGreaterThan(0);
    expect(err600).toBeGreaterThan(0);
  });
});
