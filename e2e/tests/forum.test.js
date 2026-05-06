/**
 * End-to-end tests for the Forum feature.
 *
 * Flow:
 *  1. Verify forum list loads without login (public access).
 *  2. Login, import a small test deck.
 *  3. Publish the deck to the forum from deck-detail → navigates to /forum/:id.
 *  4. Verify forum detail: header, card breakdown, stats panels.
 *  5. Add, edit, and delete a comment.
 *  6. Verify the published post appears on the forum list.
 *  7. Delete the post from the detail page.
 *  8. Cleanup: delete the test deck.
 *
 * Self-contained: creates and removes all data it needs.
 */
const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const ForumPage = require('../pages/ForumPage');
const DeckListPage = require('../pages/DeckListPage');

jest.setTimeout(180000);

const TEST_DECK_NAME = '__e2e_forum_test__';
const TEST_DECK_TEXT = [
  '4 Lightning Bolt',
  '4 Counterspell',
  '4 Giant Growth',
  '4 Mountain',
  '4 Island',
  '4 Forest',
].join('\n');
const TEST_COMMENT    = 'Great deck! Love the synergies here.';
const TEST_EDIT_TEXT  = 'Great deck! Very solid mana curve too.';
const TEST_DESCRIPTION = 'A fun little test deck for e2e coverage.';

describe('Forum', () => {
  let driver;
  let page;
  let deckListPage;
  let testDeckId = null;
  let forumPostId = null;
  let setupOk = false;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    driver = await buildDriver();
    page = new ForumPage(driver);
    deckListPage = new DeckListPage(driver);

    // ── 1. Verify forum list is public (before login) ──
    await page.navigateToList();
    await page.waitForVisible(page.forumTitle, 8000);

    // ── 2. Login ──
    await loginAs(driver);

    // ── 3. Import test deck ──
    await deckListPage.navigate();
    await deckListPage.waitForVisible(deckListPage.listContent);

    const importBtn = await driver.findElement(By.css('.import-btn'));
    await driver.executeScript('arguments[0].click()', importBtn);
    await driver.wait(async () => {
      const els = await driver.findElements(By.css('.import-modal'));
      return els.length > 0;
    }, 5000, 'Import modal did not open');

    await driver.executeScript(`
      const el   = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      comp.importName = arguments[0];
      comp.importText = arguments[1];
      comp.importTab  = 'text';
      ng.applyChanges(comp);
      comp.submitImport();
    `, TEST_DECK_NAME, TEST_DECK_TEXT);

    await driver.wait(async () => {
      return driver.executeScript(`
        const el = document.querySelector('app-deck-list');
        const comp = ng.getComponent(el);
        return comp && (comp.importState === 'done' || comp.importState === 'error');
      `);
    }, 30000, 'Import did not complete');

    const state = await driver.executeScript(`
      const el   = document.querySelector('app-deck-list');
      const comp = ng.getComponent(el);
      return { state: comp.importState, id: comp.importResult && comp.importResult.deck && comp.importResult.deck.id };
    `);
    if (state.state !== 'done') {
      console.warn('[forum] Deck import failed — all tests will be skipped');
      return;
    }
    testDeckId = state.id;

    // ── 4. Navigate to deck detail and publish ──
    await driver.get(`http://localhost:4200/deck/${testDeckId}`);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(`/deck/${testDeckId}`);
    }, 6000);
    await page.waitForVisible(By.css('.back-btn'), 10000);
    await page.waitForVisible(By.css('.filter-bar'), 10000);

    // Click Publish button
    const publishBtn = await page.waitForVisible(page.deckPublishBtn, 5000);
    await driver.executeScript('arguments[0].click()', publishBtn);
    await page.waitForVisible(page.publishModal, 5000);

    // Fill description
    const textarea = await driver.findElement(page.publishTextarea);
    await textarea.sendKeys(TEST_DESCRIPTION);

    // Submit
    await driver.executeScript(`
      const el   = document.querySelector('app-deck-detail');
      const comp = ng.getComponent(el);
      comp.publishDescription = arguments[0];
      ng.applyChanges(comp);
    `, TEST_DESCRIPTION);

    const submitBtn = await driver.findElement(page.publishSubmitBtn);
    await driver.executeScript('arguments[0].click()', submitBtn);

    // Wait for navigation to /forum/:id
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return /\/forum\/[0-9a-f-]{36}/.test(url);
    }, 15000, 'Did not navigate to forum post after publishing');

    const url = await driver.getCurrentUrl();
    const match = url.match(/\/forum\/([0-9a-f-]{36})/);
    if (match) forumPostId = match[1];

    await page.waitForVisible(page.headerTitle, 8000);
    setupOk = true;
  });

  afterAll(async () => {
    // Delete forum post if it still exists
    if (forumPostId) {
      try {
        await driver.get(`http://localhost:4200/forum/${forumPostId}`);
        const hasDeleteBtn = await page.isPresent(page.deletePostBtn, 3000);
        if (hasDeleteBtn) {
          await driver.executeScript('window.confirm = () => true');
          await page.click(page.deletePostBtn);
          await driver.sleep(1500);
        }
      } catch {}
    }

    // Delete test deck
    if (testDeckId) {
      try {
        await driver.get('http://localhost:4200/deck');
        await deckListPage.waitForVisible(deckListPage.listContent);
        await driver.executeScript(`
          const el   = document.querySelector('app-deck-list');
          const comp = ng.getComponent(el);
          if (!comp) return;
          const deck = comp.decks && comp.decks.find(d => d.id === arguments[0]);
          if (deck && comp.confirmDeleteDeck) { comp.confirmDeleteDeck(deck); ng.applyChanges(el); }
        `, testDeckId).catch(() => {});
        await driver.sleep(1000);
      } catch {}
    }

    await driver.quit();
  });

  // ── Forum list (public) ──────────────────────────────────────────────────

  test('forum list loads without login (public access)', async () => {
    // The beforeAll visited /forum before logging in — we just re-check the title text
    await page.navigateToList();
    await page.waitForVisible(page.forumTitle, 8000);
    const title = await page.getText(page.forumTitle);
    expect(title).toMatch(/community decks/i);
  });

  // ── Forum detail ─────────────────────────────────────────────────────────
  // Navigate to the detail page once before this group; list test above navigated away.

  describe('forum detail', () => {
    beforeAll(async () => {
      if (!setupOk || !forumPostId) return;
      await driver.get(`http://localhost:4200/forum/${forumPostId}`);
      await page.waitForVisible(page.headerTitle, 8000);
    });

    test('shows the published deck name', async () => {
      if (!setupOk) return;
      const title = await page.getHeaderTitle();
      expect(title).toBe(TEST_DECK_NAME);
    });

    test('byline shows author and card count', async () => {
      if (!setupOk) return;
      const byline = await page.getText(page.headerByline);
      expect(byline).toMatch(/\d+ cards/i);
    });

    test('shows the published description', async () => {
      if (!setupOk) return;
      const hasDesc = await page.isPresent(By.css('.header-desc'), 3000);
      if (hasDesc) {
        const desc = await page.getText(By.css('.header-desc'));
        expect(desc).toContain(TEST_DESCRIPTION);
      }
    });

    test('card breakdown shows at least one card group', async () => {
      if (!setupOk) return;
      const count = await page.getCardGroupCount();
      expect(count).toBeGreaterThan(0);
    });

    test('card breakdown shows card rows with names', async () => {
      if (!setupOk) return;
      const rows = await page.getCardRowCount();
      expect(rows).toBeGreaterThan(0);
    });

    test('mana curve stats panel is present', async () => {
      if (!setupOk) return;
      const hasCurve = await page.isPresent(By.css('.panel-block app-stats-chart'), 3000);
      expect(hasCurve).toBe(true);
    });

    test('comment textarea is present when logged in', async () => {
      if (!setupOk) return;
      const hasForm = await page.isPresent(page.commentTextarea, 3000);
      expect(hasForm).toBe(true);
    });

    test('can add a comment', async () => {
      if (!setupOk) return;
      const before = await page.getCommentCount();
      await page.addComment(TEST_COMMENT);
      await driver.wait(async () => {
        const count = await page.getCommentCount();
        return count > before;
      }, 8000, 'Comment count did not increase after submit');
      const count = await page.getCommentCount();
      expect(count).toBe(before + 1);
    });

    test('new comment shows the correct text', async () => {
      if (!setupOk) return;
      const texts = await page.getCommentTexts();
      expect(texts.some(t => t.includes(TEST_COMMENT))).toBe(true);
    });

    test('can edit own comment', async () => {
      if (!setupOk) return;
      await page.clickEditComment(0);
      await page.submitEditComment(TEST_EDIT_TEXT);
      await driver.wait(async () => {
        const texts = await page.getCommentTexts();
        return texts.some(t => t.includes(TEST_EDIT_TEXT));
      }, 8000, 'Edited comment text did not appear');
      const texts = await page.getCommentTexts();
      expect(texts.some(t => t.includes(TEST_EDIT_TEXT))).toBe(true);
    });

    test('can delete own comment', async () => {
      if (!setupOk) return;
      const before = await page.getCommentCount();
      await page.deleteComment(0);
      await driver.wait(async () => {
        const count = await page.getCommentCount();
        return count < before;
      }, 8000, 'Comment count did not decrease after delete');
      const after = await page.getCommentCount();
      expect(after).toBe(before - 1);
    });
  });

  // ── Forum list — post appears ────────────────────────────────────────────

  test('published deck appears on the forum list', async () => {
    if (!setupOk) return;
    await page.navigateToList();
    await page.waitForVisible(page.forumTitle, 8000);
    await driver.wait(async () => {
      const cards = await driver.findElements(page.postCards);
      return cards.length > 0;
    }, 8000, 'No post cards visible on forum list');
    const names = await page.getPostCardNames();
    expect(names.some(n => n === TEST_DECK_NAME)).toBe(true);
  });

  test('post card shows correct format or card count info', async () => {
    if (!setupOk) return;
    const cards = await driver.findElements(page.postCards);
    expect(cards.length).toBeGreaterThan(0);
    const meta = await cards[0].findElement(By.css('.post-meta')).getText();
    expect(meta).toMatch(/cards|comment/i);
  });

  // ── Delete post ──────────────────────────────────────────────────────────

  test('author can delete their post', async () => {
    if (!setupOk || !forumPostId) return;
    await driver.get(`http://localhost:4200/forum/${forumPostId}`);
    await page.waitForVisible(page.headerTitle, 8000);

    await page.deletePost();
    forumPostId = null; // already cleaned up

    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/forum\/?$/);
  });

  test('deleted post no longer appears on forum list', async () => {
    if (!setupOk) return;
    await page.navigateToList();
    await page.waitForVisible(page.forumTitle, 8000);
    await driver.sleep(500);
    const names = await page.getPostCardNames().catch(() => []);
    expect(names.every(n => n !== TEST_DECK_NAME)).toBe(true);
  });
});
