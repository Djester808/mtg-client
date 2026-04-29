const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const DeckListPage = require('../pages/DeckListPage');
const DeckDetailPage = require('../pages/DeckDetailPage');

jest.setTimeout(120000); // e2e setup can take up to 2 min

const TEST_DECK_NAME = 'Selenium E2E Validations';

describe('Commander Deck Validation Bar', () => {
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

    // Set Atraxa as commander (WUBG — covers all major color violations)
    await page.openCommanderSearch();
    await page.searchCard('Atraxa');
    await page.addFirstResult();
    await page.waitForCheckAtIndex(1, 'ok', 8000);
  });

  afterAll(async () => {
    if (deckCreated) {
      try { await deckListPage.deleteDeckByName(TEST_DECK_NAME); } catch {}
    }
    await driver.quit();
  });

  // ── Validation bar presence ───────────────────────────────────────────────

  test('validation bar is visible for Commander format', async () => {
    const visible = await page.isPresent(page.validationBar, 3000);
    expect(visible).toBe(true);
  });

  test('five validation checks are present', async () => {
    const checks = await page.getCheckClasses();
    expect(checks.length).toBeGreaterThanOrEqual(5);
  });

  // ── Baseline checks ───────────────────────────────────────────────────────

  test('count check is bad when deck has fewer than 100 cards', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[0]).toContain('bad');
  });

  test('commander check is ok after setting Atraxa', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[1]).toContain('ok');
  });

  test('singleton check is ok before adding duplicates', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[2]).not.toContain('bad-singleton');
  });

  test('color-id check is ok before adding off-color cards', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[3]).not.toContain('bad-color-id');
  });

  test('banned check is ok before adding banned cards', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[4]).not.toContain('bad-banned');
  });

  // ── Singleton violation ───────────────────────────────────────────────────

  test('adding Sol Ring twice triggers singleton violation', async () => {
    await page.switchToListView();
    await page.openAddCardsPanel();

    await page.searchCard('Sol Ring');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.addFirstResult();
    await page.closeSearchPanel();

    await page.waitForCheckAtIndex(2, 'bad-singleton', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[2]).toContain('bad-singleton');
  });

  test('singleton check label shows violation count in parentheses', async () => {
    const singletonCheck = await driver.findElements(page.cpCheck).then(els => els[2]);
    const text = await singletonCheck.getText();
    expect(text).toMatch(/Singleton.*\(\d+\)/);
  });

  // ── Color identity violation ──────────────────────────────────────────────

  test('adding Lightning Bolt (red) triggers color identity violation for Atraxa', async () => {
    await page.openAddCardsPanel();
    await page.searchCard('Lightning Bolt');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    await page.waitForCheckAtIndex(3, 'bad-color-id', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[3]).toContain('bad-color-id');
  });

  test('color-id check label shows violation count', async () => {
    const colorCheck = await driver.findElements(page.cpCheck).then(els => els[3]);
    const text = await colorCheck.getText();
    expect(text).toMatch(/Color ID.*\(\d+\)/);
  });

  // ── Banned card violation ─────────────────────────────────────────────────

  test('adding a Commander-banned card (Biorhythm) triggers banned violation', async () => {
    await page.openAddCardsPanel();
    await page.searchCard('Biorhythm');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    await page.waitForCheckAtIndex(4, 'bad-banned', 8000);
    const checks = await page.getCheckClasses();
    expect(checks[4]).toContain('bad-banned');
  });

  test('banned check label shows violation count', async () => {
    const bannedCheck = await driver.findElements(page.cpCheck).then(els => els[4]);
    const text = await bannedCheck.getText();
    expect(text).toMatch(/Banned.*\(\d+\)/);
  });

  // ── Multiple violations simultaneously ───────────────────────────────────

  test('singleton, color-id, and banned checks are all bad simultaneously', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[2]).toContain('bad-singleton');
    expect(checks[3]).toContain('bad-color-id');
    expect(checks[4]).toContain('bad-banned');
  });

  // ── Bracket display ───────────────────────────────────────────────────────

  test('Commander bracket indicator is visible', async () => {
    const visible = await page.isPresent(page.cpBracket, 2000);
    expect(visible).toBe(true);
  });

  test('bracket value is between 1 and 4', async () => {
    const bracketEl = await driver.findElement(page.cpBracket);
    const text = await bracketEl.getText();
    const match = text.match(/Bracket\s+(\d)/);
    expect(match).not.toBeNull();
    const bracketNum = parseInt(match[1], 10);
    expect(bracketNum).toBeGreaterThanOrEqual(1);
    expect(bracketNum).toBeLessThanOrEqual(4);
  });

  // ── Game changer detection ────────────────────────────────────────────────

  test('adding a game-changer card shows the Game Changers badge', async () => {
    await page.openAddCardsPanel();
    // Rhystic Study is on the WotC Game Changers list and legal in Atraxa (blue)
    await page.searchCard('Rhystic Study');
    await page.addFirstResult();
    await page.waitForDeckQtyBadge(8000);
    await page.closeSearchPanel();

    // Game changer badge appears only when gameChangerCards().length > 0
    await driver.wait(async () => {
      const present = await page.isPresent(page.cpGameChanger, 1000);
      return present;
    }, 8000, 'Game Changer badge did not appear after adding Rhystic Study');

    const present = await page.isPresent(page.cpGameChanger, 1000);
    expect(present).toBe(true);
  });

  test('game changer badge shows count of game-changer cards', async () => {
    const gcEl = await driver.findElement(page.cpGameChanger);
    const text = await gcEl.getText();
    expect(text).toMatch(/Game Changers\s*\(\d+\)/);
  });

  test('bracket is at least 3 when a game-changer card is present', async () => {
    const bracketEl = await driver.findElement(page.cpBracket);
    const text = await bracketEl.getText();
    const match = text.match(/Bracket\s+(\d)/);
    const bracketNum = parseInt(match[1], 10);
    expect(bracketNum).toBeGreaterThanOrEqual(3);
  });

  // ── Violation panel interaction ───────────────────────────────────────────

  test('clicking singleton check opens violation panel', async () => {
    const checks = await driver.findElements(page.cpCheck);
    await driver.executeScript('arguments[0].click()', checks[2]);
    await driver.sleep(400);
    const panel = await page.isPresent(By.css('.violation-panel'), 2000);
    expect(panel).toBe(true);
  });

  test('violation panel lists the singleton-violating cards', async () => {
    const items = await driver.findElements(By.css('.vp-card-item'));
    expect(items.length).toBeGreaterThan(0);
  });

  test('closing violation panel removes it from DOM', async () => {
    const closeBtn = await driver.findElement(By.css('.vp-close'));
    await closeBtn.click();
    await driver.sleep(300);
    const panel = await page.isPresent(By.css('.violation-panel'), 1000);
    expect(panel).toBe(false);
  });

  // ── View modes with validation bar ────────────────────────────────────────

  test('validation bar persists when switching to visual view', async () => {
    await page.switchToVisualView();
    const visible = await page.isPresent(page.validationBar, 2000);
    expect(visible).toBe(true);
  });

  test('validation bar persists when switching to free view', async () => {
    await page.switchToFreeView();
    const visible = await page.isPresent(page.validationBar, 2000);
    expect(visible).toBe(true);
  });

  test('validation checks are accurate in free view', async () => {
    const checks = await page.getCheckClasses();
    expect(checks[2]).toContain('bad-singleton');
    expect(checks[3]).toContain('bad-color-id');
    expect(checks[4]).toContain('bad-banned');
  });

  // ── Remove violation card via decrement ───────────────────────────────────

  test('decrementing Sol Ring to 1 copy clears the singleton violation', async () => {
    await page.switchToListView();

    // Use the Angular component to decrement Sol Ring (the singleton offender) directly.
    const decremented = await driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        const comp = ng.getComponent(el);
        return new Promise(resolve => {
          comp.deck$.subscribe(deck => {
            if (!deck) return resolve('no-deck');
            // Find Sol Ring (first non-commander card with qty > 1)
            const card = deck.cards.find(c => (c.quantity + c.quantityFoil) > 1 && c.oracleId !== deck.commanderOracleId);
            if (!card) return resolve('no-dup-card');
            comp.decrement(card);
            ng.applyChanges(el);
            resolve('ok');
          });
        });
      } catch(e) { return 'error:' + e.message; }
    `);

    if (!String(decremented).startsWith('ok')) {
      // Fallback: click the first qty-dec button
      await page.click(page.qtyDec);
    }

    // Wait for singleton check to clear
    await driver.wait(async () => {
      const checks = await page.getCheckClasses();
      return checks.length > 2 && !checks[2].includes('bad-singleton');
    }, 6000, 'Singleton check did not clear after decrementing Sol Ring to 1');

    const checks = await page.getCheckClasses();
    expect(checks[2]).not.toContain('bad-singleton');
    const visible = await page.isPresent(page.validationBar, 2000);
    expect(visible).toBe(true);
  });
});
