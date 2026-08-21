// The pieces both board harnesses need: talking to the API, and pressing things on the board.
//
// Extracted rather than copied. There are two scripts driving the game board now — one that
// walks the whole board pressing everything, one that arranges combat precisely — and they were
// about to hold two copies of "find a card in hand and press Cast", which is the shape of
// duplication this repo keeps paying for.
//
// Everything that clicks does its finding and its clicking inside one in-page script. Selenium's
// find-then-click is two round trips and the board re-renders between them on every pushed view,
// which is constantly with an opponent acting: half the early failures in these harnesses were
// StaleElementReference rather than anything about the app.

const { baseUrl } = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(token, method, url, body) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + text.slice(0, 240));
  return text ? JSON.parse(text) : null;
}

/** Signs in, registering the account the first time it is used on a machine. */
async function signIn(player) {
  try {
    return (
      await api(null, 'POST', '/api/auth/login', {
        username: player.username,
        password: player.password,
      })
    ).token;
  } catch {
    return (
      await api(null, 'POST', '/api/auth/register', {
        username: player.username,
        email: player.email || player.username + '@example.invalid',
        password: player.password,
      })
    ).token;
  }
}

/** The player id the server will act as, read from the token it issued. */
function userIdFromToken(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  return (
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
    payload.nameid ??
    payload.sub
  );
}

async function deckFor(token, name, list) {
  const decks = await api(token, 'GET', '/api/games/decks');
  const found = decks.find((d) => d.name === name);
  if (found) return found.id;
  return (await api(token, 'POST', '/api/decks/import', { name, text: list })).deck.id;
}

const logLines = async (token, gameId) =>
  (await api(token, 'GET', '/api/games/' + gameId + '/log')).length;

/** What the board is showing, as a player would read it. */
function board(d) {
  return d.executeScript(`
    const text = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null; };
    return {
      prompt: text('.gb-prompt-text'),
      promptButtons: [...document.querySelectorAll('.gb-prompt-actions .gb-btn')].map(b => b.textContent.trim()),
      actionButtons: [...document.querySelectorAll('.gb-actions button')].map(b => b.textContent.trim()),
      hand: [...document.querySelectorAll('.gb-hand .gb-card .gb-card-name')].map(n => n.textContent.trim()),
      mine: [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent .gb-permanent-name')].map(n => n.textContent.trim()),
      theirs: [...document.querySelectorAll('.gb-field-half:first-child .gb-permanent .gb-permanent-name')].map(n => n.textContent.trim()),
      attacking: document.querySelectorAll('.gb-field-half:first-child .gb-permanent.is-attacking').length,
      refusal: text('.gb-refusal'),
      overflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  `);
}

/** Clicks the first visible match. `pattern` is a case-insensitive regex source, or null. */
function clickIn(d, selector, pattern) {
  return d.executeScript(
    `
    const els = [...document.querySelectorAll(arguments[0])].filter(
      (e) => e.offsetParent !== null || e.getClientRects().length > 0,
    );
    const re = arguments[1] ? new RegExp(arguments[1], 'i') : null;
    const el = re ? els.find((e) => re.test((e.textContent || '').trim())) : els[0];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  `,
    selector,
    pattern || null,
  );
}

/** Clicks the first button whose text does NOT match — for "the opponent's own name". */
function clickInExcept(d, selector, pattern) {
  return d.executeScript(
    `
    const els = [...document.querySelectorAll(arguments[0])];
    const re = new RegExp(arguments[1], 'i');
    const el = els.find((e) => !re.test((e.textContent || '').trim()));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  `,
    selector,
    pattern,
  );
}

/** Clicks a permanent by name, on one side of the battlefield. */
function clickPermanent(d, side, name) {
  return d.executeScript(
    `
    const half = arguments[0] === 'mine' ? ':last-child' : ':first-child';
    const els = [...document.querySelectorAll('.gb-field-half' + half + ' .gb-permanent')];
    const el = els.find((e) => (e.textContent || '').includes(arguments[1]));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  `,
    side,
    name,
  );
}

/** Selects a card in hand by name and presses its Play/Cast affordance. */
async function playFromHand(d, name, mark) {
  const selected = await d.executeScript(
    `
    const cards = [...document.querySelectorAll('.gb-hand .gb-card')];
    const el = cards.find((c) => {
      const n = c.querySelector('.gb-card-name');
      return n && n.textContent.trim() === arguments[0];
    });
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  `,
    name,
  );
  if (!selected) return false;

  await sleep(450);
  if (mark) await mark();
  return d.executeScript(`
    const el = document.querySelector('.gb-card-play');
    if (!el) return false;
    el.click();
    return true;
  `);
}

/** Taps every untapped land of the given names, one at a time. */
async function tapLands(d, names = 'Mountain|Forest') {
  for (let i = 0; i < 8; i++) {
    const tapped = await d.executeScript(
      `
      const els = [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent')];
      const re = new RegExp(arguments[0]);
      const el = els.find((e) => re.test(e.textContent || '') && !e.className.includes('is-tapped'));
      if (!el) return false;
      el.click();
      return true;
    `,
      names,
    );
    if (!tapped) return i;
    await sleep(350);
  }
  return 8;
}

/** Signs a real account in through the real login form. */
async function signInThroughTheForm(d, { By, until }, player) {
  await d.get(baseUrl + '/login');
  await d.wait(until.elementLocated(By.id('username')), 20000);
  await d.findElement(By.id('username')).sendKeys(player.username);
  await d.findElement(By.id('password')).sendKeys(player.password);
  await d.findElement(By.css('.submit-btn')).click();
  await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 20000);
}

module.exports = {
  sleep,
  api,
  signIn,
  userIdFromToken,
  deckFor,
  logLines,
  board,
  clickIn,
  clickInExcept,
  clickPermanent,
  playFromHand,
  tapLands,
  signInThroughTheForm,
};
