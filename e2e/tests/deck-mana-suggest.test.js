const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000);

const TEST_DECK_NAME = 'Selenium E2E Mana Suggest';

describe('Mana Suggest Panel', () => {
  let driver;
  let deckListPage;
  let page;
  let deckCreated = false;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    deckListPage = new DeckListPage(driver);
    page = new DeckDetailPage(driver);

    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);
    await deckListPage.createCommanderDeck(TEST_DECK_NAME);
    deckCreated = true;

    // Add a commander (Atraxa — WUBG color identity) so Suggest btn is available
    // for mutual-exclusion tests, and so there are colored pips in the deck.
    await page.openCommanderSearch();
    await page.searchCard('Atraxa');
    await page.addFirstResult();
    await page.waitForCheckAtIndex(1, 'ok', 20000);

    // Add Sol Ring (colorless ramp) to give the deck non-land cards
    await page.openAddCardsPanel();
    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    // Add Counterspell (UU) for blue colored pips
    await page.searchCard('Counterspell');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    // Add Lightning Bolt (R) for red colored pips
    await page.searchCard('Lightning Bolt');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);

    await page.closeSearchPanel();
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Button ────────────────────────────────────────────────────────────────────

  test('Mana button is always visible (not gated on commander)', async () => {
    const visible = await page.isPresent(page.manaBtn, 3000);
    expect(visible).toBe(true);
  });

  test('Mana button has correct label text', async () => {
    const btn = await driver.findElement(page.manaBtn);
    const text = await btn.getText();
    expect(text.trim().toLowerCase()).toContain('mana');
  });

  // ── Open / close ──────────────────────────────────────────────────────────────

  test('clicking Mana button opens the mana panel', async () => {
    await page.openManaSuggestPanel();
    const visible = await page.isPresent(page.manaPanelHeader, 2000);
    expect(visible).toBe(true);
  });

  test('panel header reads "Mana Suggestions"', async () => {
    await page.openManaSuggestPanel();
    const titleEl = await driver.findElement(By.css('.mana-title'));
    const text = await titleEl.getText();
    expect(text.trim().toLowerCase()).toContain('mana suggestions');
  });

  test('Mana button has is-active class while panel is open', async () => {
    await page.openManaSuggestPanel();
    const btn = await driver.findElement(page.manaBtn);
    const cls = await btn.getAttribute('class');
    expect(cls).toContain('is-active');
  });

  test('clicking the close (X) button hides the panel', async () => {
    await page.openManaSuggestPanel();
    await page.closeManaSuggestPanel();
    const gone = !(await page.isPresent(page.manaPanelHeader, 1000));
    expect(gone).toBe(true);
  });

  test('clicking Mana button while open toggles panel closed', async () => {
    await page.openManaSuggestPanel();
    // Click the button again to toggle closed
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(page.manaBtn),
    );
    await driver.sleep(400);
    const gone = !(await page.isPresent(page.manaPanelHeader, 1000));
    expect(gone).toBe(true);
  });

  // ── Structure ─────────────────────────────────────────────────────────────────

  test('Land Count section is visible', async () => {
    await page.openManaSuggestPanel();
    const present = await page.isPresent(By.css('.mana-land-row'), 2000);
    expect(present).toBe(true);
  });

  test('current land count is shown as a number', async () => {
    await page.openManaSuggestPanel();
    const el = await driver.findElement(By.css('.mana-land-num'));
    const text = await el.getText();
    expect(/^\d+$/.test(text.trim())).toBe(true);
  });

  test('recommended land count is shown as a positive number', async () => {
    await page.openManaSuggestPanel();
    const nums = await driver.findElements(By.css('.mana-land-num'));
    expect(nums.length).toBeGreaterThanOrEqual(2);
    const recommended = await nums[1].getText();
    expect(parseInt(recommended.trim(), 10)).toBeGreaterThan(0);
  });

  test('land delta badge is visible with non-empty text', async () => {
    await page.openManaSuggestPanel();
    const badge = await driver.findElement(By.css('.mana-land-delta'));
    const text = await badge.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('Avg CMC row is visible and shows a numeric value', async () => {
    await page.openManaSuggestPanel();
    const metaVal = await page.waitForVisible(By.css('.mana-meta-val'), 3000);
    const text = await metaVal.getText();
    const parsed = parseFloat(text.trim().replace(',', '.'));
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThan(0);
  });

  // ── Color sources ─────────────────────────────────────────────────────────────

  test('Color Sources section is visible (colored cards in deck)', async () => {
    await page.openManaSuggestPanel();
    const present = await page.isPresent(By.css('.mana-color-row'), 2000);
    expect(present).toBe(true);
  });

  test('each color row has a bar, percentage, and recommended count', async () => {
    await page.openManaSuggestPanel();
    const rows = await driver.findElements(By.css('.mana-color-row'));
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const bar  = await row.findElements(By.css('.mana-color-bar'));
      const pct  = await row.findElements(By.css('.mana-color-pct'));
      const rec  = await row.findElements(By.css('.mana-color-rec'));
      expect(bar.length).toBe(1);
      expect(pct.length).toBe(1);
      expect(rec.length).toBe(1);

      const pctText = await pct[0].getText();
      expect(pctText.trim()).toMatch(/^\d+%$/);
    }
  });

  test('color percentages across all rows sum to approximately 100%', async () => {
    await page.openManaSuggestPanel();
    const pctEls = await driver.findElements(By.css('.mana-color-pct'));
    if (pctEls.length === 0) return; // no colored cards — skip

    let total = 0;
    for (const el of pctEls) {
      const text = await el.getText();
      total += parseInt(text.replace('%', '').trim(), 10);
    }
    // Rounding per-row can make the sum ±number_of_colors off 100
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(pctEls.length);
  });

  test('color rows are sorted descending by pip count (via component state)', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    if (!analysis || analysis.isEmpty || !analysis.colorSources.length) return;

    const pips = analysis.colorSources.map(cs => cs.pips);
    for (let i = 1; i < pips.length; i++) {
      expect(pips[i]).toBeLessThanOrEqual(pips[i - 1]);
    }
  });

  // ── Analysis correctness ──────────────────────────────────────────────────────

  test('analysis is not empty (deck has cards)', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    expect(analysis).not.toBeNull();
    expect(typeof analysis).toBe('object');
    expect(analysis.isEmpty).toBe(false);
  });

  test('recommended land count for Commander deck is >= 33 and <= 40', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    if (!analysis || analysis.isEmpty) return;
    expect(analysis.recommendedLands).toBeGreaterThanOrEqual(33);
    expect(analysis.recommendedLands).toBeLessThanOrEqual(40);
  });

  test('avg CMC is a positive finite number', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    if (!analysis || analysis.isEmpty) return;
    expect(isFinite(analysis.avgCmc)).toBe(true);
    expect(analysis.avgCmc).toBeGreaterThan(0);
  });

  test('land delta equals recommendedLands minus currentLands', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    if (!analysis || analysis.isEmpty) return;
    expect(analysis.landDelta).toBe(analysis.recommendedLands - analysis.currentLands);
  });

  test('color source percentages each fall between 0 and 100', async () => {
    await page.openManaSuggestPanel();
    const analysis = await page.getManaSuggestAnalysis();
    if (!analysis || !analysis.colorSources.length) return;
    for (const cs of analysis.colorSources) {
      expect(cs.pct).toBeGreaterThan(0);
      expect(cs.pct).toBeLessThanOrEqual(1);
    }
  });

  // ── Mutual exclusion with other panels ────────────────────────────────────────

  test('opening Mana panel while search panel is open closes search panel', async () => {
    await page.openAddCardsPanel();
    await driver.sleep(300);

    await page.openManaSuggestPanel();
    await driver.sleep(300);

    const state = await page.getDetailPanelState();
    expect(state.showManaSuggestPanel).toBe(true);
    expect(state.showSearchPanel).toBe(false);
  });

  test('opening search panel while Mana panel is open closes mana panel', async () => {
    await page.openManaSuggestPanel();
    await driver.sleep(300);

    await page.openAddCardsPanel();
    await driver.sleep(300);

    const state = await page.getDetailPanelState();
    expect(state.showManaSuggestPanel).toBe(false);
    expect(state.showSearchPanel).toBe(true);

    await page.closeSearchPanel();
  });

  test('opening Mana panel while Suggest panel is open closes Suggest panel', async () => {
    // Open suggestions panel first (requires commander, which we set in beforeAll)
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.suggest-btn')),
    );
    await driver.sleep(400);

    await page.openManaSuggestPanel();
    await driver.sleep(300);

    const state = await page.getDetailPanelState();
    expect(state.showManaSuggestPanel).toBe(true);
    expect(state.showSuggestionsPanel).toBe(false);
  });

  test('opening Suggest panel while Mana panel is open closes Mana panel', async () => {
    await page.openManaSuggestPanel();
    await driver.sleep(300);

    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.suggest-btn')),
    );
    await driver.sleep(400);

    const state = await page.getDetailPanelState();
    expect(state.showSuggestionsPanel).toBe(true);
    expect(state.showManaSuggestPanel).toBe(false);

    // Close suggestions panel for clean state
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('.suggest-btn')),
    );
    await driver.sleep(300);
  });

  // ── Tips ─────────────────────────────────────────────────────────────────────

  test('Tips section is present in the DOM (populated based on curve)', async () => {
    await page.openManaSuggestPanel();
    // Tips may or may not render depending on the deck's avg CMC;
    // verify the section either appears or the analysis has no tips.
    const analysis = await page.getManaSuggestAnalysis();
    const hasTipSection = await page.isPresent(By.css('.mana-tip'), 1000);
    if (analysis && !analysis.isEmpty && analysis.tips.length > 0) {
      expect(hasTipSection).toBe(true);
    } else {
      // No tips expected — section should be absent
      expect(hasTipSection).toBe(false);
    }
  });

  test('each visible tip has a lightbulb icon and non-empty text', async () => {
    await page.openManaSuggestPanel();
    const tips = await driver.findElements(By.css('.mana-tip'));
    for (const tip of tips) {
      const icons = await tip.findElements(By.css('i.bi-lightbulb'));
      expect(icons.length).toBe(1);
      const text = await tip.getText();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  // ── Color note ────────────────────────────────────────────────────────────────

  test('color note references the recommended land count', async () => {
    await page.openManaSuggestPanel();
    const notePresent = await page.isPresent(By.css('.mana-color-note'), 1000);
    if (!notePresent) return; // No colored cards — skip

    const analysis = await page.getManaSuggestAnalysis();
    const note = await driver.findElement(By.css('.mana-color-note'));
    const text = await note.getText();
    expect(text).toContain(String(analysis.recommendedLands));
  });
});
