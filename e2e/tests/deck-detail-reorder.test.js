const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const DeckDetailPage = require('../pages/DeckDetailPage');
const { baseUrl, username, password } = require('../config');

jest.setTimeout(120000); // e2e setup can take up to 2 min

// Seed through the dev server's same-origin /api proxy (baseUrl is http://…), the
// way the app itself reaches the backend — no self-signed-cert handling needed.
const API = process.env.API_URL || `${baseUrl.replace(/\/$/, '')}/api`;
const DECK_NAME = 'Selenium E2E Reorder';
// Three CMC-2 creatures land in one visual stack, so a reorder within it is unambiguous.
const DECK_TEXT = ['1 Grizzly Bears', '1 River Boa', '1 Watchwolf'].join('\n');

async function api(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.status === 204 ? null : res.json().catch(() => null);
}

/**
 * Characterization test for the stack- and list-reorder drags. Both handlers share
 * the `startCardReorderDrag` helper in deck-detail.component.ts; this exercises the
 * real pointer plumbing (threshold, ghost, settle, commit) end-to-end so a
 * regression in that helper fails here instead of silently in production.
 *
 * The deck is seeded through the API (deterministic) rather than the flaky
 * create-deck UI flow; the browser is authenticated by planting the token and
 * navigating straight to the deck.
 */
describe('Deck card reorder (stack + list drag)', () => {
  let driver;
  let page;
  let token;
  let deckId;

  // Order of the biggest visual stack, each card keyed by a slice of its art URL.
  const stackOrder = () =>
    driver.executeScript(`
      const s = [...document.querySelectorAll('.visual-stack')]
        .sort((a,b) => b.querySelectorAll('.visual-card').length - a.querySelectorAll('.visual-card').length)[0];
      return s ? [...s.querySelectorAll('.visual-card')].map(c => {
        const a = c.querySelector('.ct-art');
        return (a ? getComputedStyle(a).backgroundImage : '').slice(30, 52);
      }) : [];
    `);

  const listOrder = () =>
    driver.executeScript(
      `return [...document.querySelectorAll('.list-drag-row')].map(r => r.textContent.trim().slice(0, 24));`,
    );

  beforeAll(async () => {
    const auth = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    token = auth.token;
    const imp = await api('/decks/import', {
      method: 'POST',
      body: JSON.stringify({ name: DECK_NAME, text: DECK_TEXT }),
    }, token);
    deckId = imp.deck.id;

    driver = await buildDriver();
    page = new DeckDetailPage(driver);

    // Plant the auth token, then open the deck directly.
    await driver.get(baseUrl);
    await driver.executeScript(
      `localStorage.setItem('auth_token', arguments[0]); localStorage.setItem('auth_username', arguments[1]);`,
      token,
      username,
    );
    await driver.get(`${baseUrl}/deck/${deckId}`);
    await driver.wait(async () => {
      const shells = await driver.findElements(By.css('.detail-shell'));
      return shells.length > 0;
    }, 20000, 'Deck detail did not load');
  });

  afterAll(async () => {
    if (deckId && token) {
      try {
        await api(`/decks/${deckId}`, { method: 'DELETE' }, token);
      } catch {} // best-effort cleanup
    }
    if (driver) await driver.quit();
  });

  test('the three CMC-2 cards form one stack', async () => {
    await page.switchToVisualView();
    await driver.wait(async () => (await stackOrder()).length === 3, 8000, 'stack of 3 never rendered');
    const order = await stackOrder();
    expect(order.length).toBe(3);
    expect(new Set(order).size).toBe(3); // distinct printings
  });

  test('dragging the top card down reorders the stack without losing cards', async () => {
    const before = await stackOrder();
    const cards = await driver.findElements(By.css('.visual-stack .visual-card'));

    await driver
      .actions({ async: false })
      .move({ origin: cards[0] })
      .press()
      .move({ origin: cards[0], x: 0, y: 10 }) // cross the 5px threshold
      .move({ origin: cards[1] })
      .move({ origin: cards[2] })
      .move({ origin: cards[2], x: 0, y: 20 })
      .release()
      .perform();
    await driver.sleep(700); // settle animation + change detection

    const after = await stackOrder();
    expect(after.length).toBe(3);
    expect(new Set(after).size).toBe(3); // no loss / no duplication
    expect(before.every((b) => after.includes(b))).toBe(true); // same card set
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before)); // order actually changed
  });

  test('dragging a row in list view reorders it', async () => {
    await page.switchToListView();
    await driver.wait(
      async () => (await driver.findElements(By.css('.list-drag-row'))).length >= 3,
      8000,
      'list rows never rendered',
    );

    const before = await listOrder();
    const rows = await driver.findElements(By.css('.list-drag-row'));

    await driver
      .actions({ async: false })
      .move({ origin: rows[0] })
      .press()
      .move({ origin: rows[0], x: 0, y: 12 })
      .move({ origin: rows[2] })
      .move({ origin: rows[2], x: 0, y: 20 })
      .release()
      .perform();
    await driver.sleep(600);

    const after = await listOrder();
    expect(after.length).toBe(before.length);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });
});
