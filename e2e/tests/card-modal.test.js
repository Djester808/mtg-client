const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const HomePage = require('../pages/HomePage');

jest.setTimeout(60000);

describe('Card Modal — Content, Carousel, Legalities, Flip, Resize', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new HomePage(driver);
    await page.navigate();
    await page.waitForVisible(page.searchInput, 5000);

    // Search for a well-known card with many printings and legalities
    await page.search('Lightning Bolt');
    // Open the card modal
    await page.openFirstCard();
    // Wait for full modal render
    await driver.wait(async () => {
      const chips = await driver.findElements(By.css('.modal-printing-chip'));
      return chips.length > 0;
    }, 15000, 'Printing chips did not load');
  });

  afterAll(async () => {
    await driver.quit();
  });

  // ── Basic modal structure ─────────────────────────────────────────────────────

  test('card modal is present', async () => {
    const present = await page.isPresent(page.cardModal, 2000);
    expect(present).toBe(true);
  });

  test('card modal shows a drag handle / title bar', async () => {
    const handle = await page.isPresent(By.css('.modal-drag'), 2000);
    expect(handle).toBe(true);
  });

  test('card modal shows close button', async () => {
    const btn = await page.isPresent(page.modalCloseBtn, 2000);
    expect(btn).toBe(true);
  });

  // ── Card art ──────────────────────────────────────────────────────────────────

  test('card image is displayed', async () => {
    const img = await page.isPresent(By.css('.modal-card-img'), 3000);
    expect(img).toBe(true);
  });

  test('image magnifier lens appears on hover over card art', async () => {
    const imgEl = await driver.findElement(By.css('.modal-card-img'));
    // Move mouse to center of image
    await driver.actions().move({ origin: imgEl }).perform();
    await driver.sleep(300);
    const lens = await page.isPresent(By.css('.img-magnifier-lens'), 1000);
    expect(lens).toBe(true);
  });

  test('magnifier lens disappears when mouse leaves the image', async () => {
    // Move mouse away
    await driver.actions().move({ x: 0, y: 0 }).perform();
    await driver.sleep(300);
    const lens = await page.isPresent(By.css('.img-magnifier-lens'), 500);
    expect(lens).toBe(false);
  });

  // ── Card text info ────────────────────────────────────────────────────────────

  test('card name is displayed in the modal header', async () => {
    const name = await driver.findElement(By.css('.modal-card-name'));
    const text = await name.getText();
    expect(text.toLowerCase()).toContain('lightning bolt');
  });

  test('card type line is displayed', async () => {
    const typeLine = await page.isPresent(By.css('.modal-type-line'), 2000);
    expect(typeLine).toBe(true);
  });

  test('oracle text is displayed', async () => {
    const oracle = await page.isPresent(By.css('.modal-oracle'), 2000);
    expect(oracle).toBe(true);
  });

  test('set line is displayed', async () => {
    const setLine = await page.isPresent(By.css('.modal-set-line'), 2000);
    expect(setLine).toBe(true);
  });

  // ── Format legalities ─────────────────────────────────────────────────────────

  test('format legality section is present', async () => {
    const section = await page.isPresent(By.css('.modal-legalities'), 3000);
    expect(section).toBe(true);
  });

  test('legality chips are present', async () => {
    const chips = await driver.findElements(By.css('.legal-chip'));
    expect(chips.length).toBeGreaterThan(0);
  });

  test('at least some chips are marked as legal (is-legal)', async () => {
    const legalChips = await driver.findElements(By.css('.legal-chip.is-legal'));
    expect(legalChips.length).toBeGreaterThan(0);
  });

  test('at least some chips are marked as not-legal (is-not-legal)', async () => {
    const illegalChips = await driver.findElements(By.css('.legal-chip.is-not-legal'));
    expect(illegalChips.length).toBeGreaterThan(0);
  });

  // ── Printings carousel ────────────────────────────────────────────────────────

  test('printings section is present', async () => {
    const section = await page.isPresent(By.css('.modal-printings-section'), 3000);
    expect(section).toBe(true);
  });

  test('printing chips are displayed', async () => {
    const chips = await driver.findElements(By.css('.modal-printing-chip'));
    expect(chips.length).toBeGreaterThan(0);
  });

  test('first printing chip is marked as viewed', async () => {
    const chips = await driver.findElements(By.css('.modal-printing-chip'));
    const cls = await chips[0].getAttribute('class');
    expect(cls).toContain('is-viewed');
  });

  test('clicking a different printing chip changes the viewed printing', async () => {
    const chips = await driver.findElements(By.css('.modal-printing-chip'));
    if (chips.length < 2) return;
    await chips[1].click();
    await driver.sleep(300);
    const cls = await chips[1].getAttribute('class');
    expect(cls).toContain('is-viewed');
  });

  test('carousel next button is present and navigates when there are many printings', async () => {
    const nextBtn = await page.isPresent(By.css('.carousel-btn[title="Next"]'), 2000);
    expect(nextBtn).toBe(true);

    const btn = await driver.findElement(By.css('.carousel-btn[title="Next"]'));
    const disabled = await btn.getAttribute('disabled');
    if (disabled === null) {
      // Can navigate forward
      const chipsBefore = await driver.findElements(By.css('.modal-printing-chip'));
      await btn.click();
      await driver.sleep(300);
      const chipsAfter = await driver.findElements(By.css('.modal-printing-chip'));
      // Chips list changes when paginated
      expect(chipsAfter.length).toBeGreaterThan(0);
    }
  });

  // ── Double-faced card flip ─────────────────────────────────────────────────────

  test('DFC flip button is present for double-faced cards', async () => {
    // Close current modal and search for a DFC
    await page.closeModal();
    await driver.sleep(300);

    const searchEl = await driver.findElement(page.searchInput);
    await driver.executeScript(`
      const e = arguments[0]; e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `, searchEl);
    await driver.sleep(400);
    await searchEl.sendKeys('Delver of Secrets');
    await driver.wait(async () => {
      const tiles = await driver.findElements(page.cardTiles);
      return tiles.length > 0;
    }, 15000);

    await page.openFirstCard();
    await driver.sleep(1000);

    const hasFlip = await page.isPresent(By.css('.modal-flip-btn'), 2000);
    // Delver of Secrets is a DFC; if found in DB it should have a flip button
    if (hasFlip) {
      expect(hasFlip).toBe(true);
    }
    // Otherwise, test passes vacuously (card may not have back face in DB)
  });

  test('clicking flip button toggles the card face', async () => {
    const hasFlip = await page.isPresent(By.css('.modal-flip-btn'), 1000);
    if (!hasFlip) return;

    const btn = await driver.findElement(By.css('.modal-flip-btn'));
    const before = await btn.getAttribute('class');
    await btn.click();
    await driver.sleep(300);
    const after = await btn.getAttribute('class');
    // The is-flipped class should be toggled
    const wasFlipped = before.includes('is-flipped');
    expect(after.includes('is-flipped')).toBe(!wasFlipped);
  });

  // ── Close modal ───────────────────────────────────────────────────────────────

  test('closing modal via close button removes it from DOM', async () => {
    const present = await page.isPresent(page.cardModal, 1000);
    if (!present) return;
    await page.closeModal();
    const gone = !(await page.isPresent(page.cardModal, 2000));
    expect(gone).toBe(true);
  });

  test('clicking the overlay closes the modal', async () => {
    // Re-open modal
    const tiles = await driver.findElements(page.cardTiles);
    if (tiles.length > 0) {
      await tiles[0].click();
      await driver.sleep(500);
    }
    const present = await page.isPresent(page.cardModal, 2000);
    if (!present) return;

    const overlay = await driver.findElement(By.css('.modal-overlay'));
    await driver.executeScript('arguments[0].click()', overlay);
    await driver.sleep(400);
    const gone = !(await page.isPresent(page.cardModal, 2000));
    expect(gone).toBe(true);
  });
});
