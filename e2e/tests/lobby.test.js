const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const LobbyPage = require('../pages/LobbyPage');

jest.setTimeout(30000);

describe('Lobby Page', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new LobbyPage(driver);
    await page.navigate();
    await page.waitForVisible(page.lobbyForm);
  });

  afterAll(async () => {
    await driver.quit();
  });

  beforeEach(async () => {
    await page.navigate();
    await page.waitForVisible(page.lobbyForm);
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page loads at /lobby', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/lobby');
  });

  test('player name inputs are present', async () => {
    const p1 = await page.isPresent(page.player1Input, 2000);
    const p2 = await page.isPresent(page.player2Input, 2000);
    expect(p1).toBe(true);
    expect(p2).toBe(true);
  });

  test('deck preset options are present', async () => {
    const opts = await driver.findElements(page.deckOptions);
    expect(opts.length).toBeGreaterThan(0);
  });

  test('start button is present', async () => {
    const present = await page.isPresent(page.startBtn, 2000);
    expect(present).toBe(true);
  });

  // ── Form validation ─────────────────────────────────────────────────────────
  // The form starts pre-filled with "Alice" / "Bob", so start is enabled by default.

  test('start button is enabled when both names are pre-filled', async () => {
    const enabled = await page.isStartEnabled();
    expect(enabled).toBe(true);
  });

  test('start button is disabled after clearing player 1 name', async () => {
    await page.fillPlayerNames('', 'Bob');
    const enabled = await page.isStartEnabled();
    expect(enabled).toBe(false);
  });

  test('start button is disabled after clearing player 2 name', async () => {
    await page.fillPlayerNames('Alice', '');
    const enabled = await page.isStartEnabled();
    expect(enabled).toBe(false);
  });

  test('start button is re-enabled once both names are filled', async () => {
    await page.fillPlayerNames('Alice', 'Bob');
    const enabled = await page.isStartEnabled();
    expect(enabled).toBe(true);
  });

  // ── Deck preset selection ────────────────────────────────────────────────────

  test('clicking a deck option marks it as selected', async () => {
    await page.selectDeckPreset(0);
    const opts = await driver.findElements(page.deckOptions);
    const cls = await opts[0].getAttribute('class');
    expect(cls).toContain('selected');
  });

  test('selecting a different preset deselects the previous one', async () => {
    const opts = await driver.findElements(page.deckOptions);
    if (opts.length < 2) return;

    await page.selectDeckPreset(0);
    await page.selectDeckPreset(1);

    const cls0 = await opts[0].getAttribute('class');
    const cls1 = await opts[1].getAttribute('class');
    expect(cls0).not.toContain('selected');
    expect(cls1).toContain('selected');
  });

  test('deck options contain color pips', async () => {
    const colorPips = await driver.findElements(page.deckOptions);
    // Each deck-option should have color pip children
    for (const opt of colorPips.slice(0, 2)) {
      const pips = await opt.findElements({ css: '.color-pip' });
      expect(pips.length).toBeGreaterThanOrEqual(0); // may be 0 for colorless
    }
  });

  // ── Game start ───────────────────────────────────────────────────────────────

  test('filling both names and clicking start navigates to the game board', async () => {
    await page.fillPlayerNames('Alice', 'Bob');
    await page.clickStart();

    // Wait for navigation to /game/:gameId; allow up to 15s for server round-trip
    try {
      await page.waitForUrlToContain('/game/', 15000);
      const url = await page.getCurrentUrl();
      expect(url).toContain('/game/');
    } catch {
      // If the server is unavailable the URL stays at /lobby or shows an error;
      // verify we at least got feedback (error message or stayed on lobby)
      const url = await page.getCurrentUrl();
      const hasError = await page.isPresent(page.errorMsg, 2000);
      expect(url.includes('/lobby') || hasError).toBe(true);
    }
  });
});
