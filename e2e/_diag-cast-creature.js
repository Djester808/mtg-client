// Why does a creature never reach this player's battlefield?
//
// Blocking and dividing damage both need one, and the flow harness kept reporting "never
// reached" for all three controls without ever saying why. This does one thing: tries to cast a
// creature, turn after turn, printing what was in hand, what was untapped, what was clicked and
// what the server said. Every guess so far has been wrong, so this asks instead.
const signalR = require('@microsoft/signalr');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const NL = String.fromCharCode(10);
const DECK_A = ['40 Mountain', '20 Lightning Bolt', '20 Goblin Piker'].join(NL);
const DECK_B = ['30 Forest', '30 Grizzly Bears'].join(NL);

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
  if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

const signIn = (p) => api(null, 'POST', '/api/auth/login', p).then((r) => r.token);

function userIdFromToken(token) {
  const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  return (
    p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ?? p.nameid ?? p.sub
  );
}

async function deckFor(token, name, list) {
  const decks = await api(token, 'GET', '/api/games/decks');
  const found = decks.find((d) => d.name === name);
  if (found) return found.id;
  return (await api(token, 'POST', '/api/decks/import', { name, text: list })).deck.id;
}

async function bot(token, gameId) {
  const c = new signalR.HubConnectionBuilder()
    .withUrl(baseUrl + '/hubs/game', { accessTokenFactory: () => token })
    .build();
  const me = userIdFromToken(token);
  let view = null;
  c.on('State', (v) => (view = v));
  c.on('Refused', () => {});
  c.on('Log', () => {});
  await c.start();
  await c.invoke('Join', gameId);

  let stop = false;
  (async () => {
    while (!stop) {
      await sleep(350);
      if (!view) continue;
      try {
        if (view.choice) {
          if (view.choice.playerId !== me) continue;
          const o = (view.choice.options || []).map((x) => x.id);
          await c.invoke('Choose', gameId, o.length ? [o[0]] : ['keep']);
        } else {
          await c.invoke('PassPriority', gameId);
        }
      } catch {
        /* not its turn to do that */
      }
    }
  })();
  return { c, stop: () => (stop = true) };
}

const state = (d) =>
  d.executeScript(`
    const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null; };
    return {
      hand: [...document.querySelectorAll('.gb-hand .gb-card .gb-card-name')].map(n => n.textContent.trim()),
      mine: [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent')].map(
        (e) => e.querySelector('.gb-permanent-name').textContent.trim() + (e.className.includes('is-tapped') ? '(T)' : '')),
      prompt: t('.gb-prompt-text'),
      promptButtons: [...document.querySelectorAll('.gb-prompt-actions .gb-btn')].map(b => b.textContent.trim()),
      stack: [...document.querySelectorAll('.gb-stack-item')].map(n => n.textContent.trim()),
      refusal: t('.gb-refusal'),
    };
  `);

const clickIn = (d, sel, pat) =>
  d.executeScript(
    `
    const els = [...document.querySelectorAll(arguments[0])];
    const re = arguments[1] ? new RegExp(arguments[1], 'i') : null;
    const el = re ? els.find(e => re.test((e.textContent||'').trim())) : els[0];
    if (!el) return false;
    el.scrollIntoView({block:'center'}); el.click(); return true;
  `,
    sel,
    pat || null,
  );

const selectInHand = (d, name) =>
  d.executeScript(
    `
    const cards=[...document.querySelectorAll('.gb-hand .gb-card')];
    const el=cards.find(c=>{const n=c.querySelector('.gb-card-name');return n&&n.textContent.trim()===arguments[0];});
    if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;
  `,
    name,
  );

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Board Flows Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Board Flows Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 200,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;
  console.log('game ' + gameId);

  const opponent = await bot(tokenB, gameId);
  const d = await buildDriver({ device, dpr: 1 });

  try {
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(A.username);
    await d.findElement(By.id('password')).sendKeys(A.password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 20000);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(2500);

    // Keep the opening hand.
    for (let i = 0; i < 20 && (await state(d)).promptButtons.length > 0; i++) {
      await clickIn(d, '.gb-prompt-actions .gb-btn', 'keep');
      await sleep(600);
    }

    for (let turn = 0; turn < 40; turn++) {
      const view = await api(tokenA, 'GET', '/api/games/' + gameId);

      if (view.choice) {
        await clickIn(d, '.gb-prompt-actions .gb-btn');
        await sleep(200);
        await clickIn(d, '.gb-prompt-actions .gb-btn', 'confirm');
        await sleep(400);
        continue;
      }

      if (view.currentStep !== 'PrecombatMain' || view.activePlayerId !== view.viewer) {
        await clickIn(d, '.gb-btn-primary', 'attack with|block with');
        await clickIn(d, '.gb-pass');
        await sleep(300);
        continue;
      }

      const before = await state(d);
      console.log(
        NL +
          'turn ' +
          view.turnNumber +
          ' main: hand=' +
          JSON.stringify(before.hand) +
          ' board=' +
          JSON.stringify(before.mine),
      );

      // A land, if one is in hand and none has been played this turn.
      if (before.hand.includes('Mountain')) {
        if (await selectInHand(d, 'Mountain')) {
          await sleep(400);
          const played = await clickIn(d, '.gb-card-play');
          await sleep(900);
          console.log('  played a land: ' + played + ' -> ' + (await state(d)).refusal);
        }
      }

      // Tap everything untapped.
      let taps = 0;
      for (let i = 0; i < 8; i++) {
        const tapped = await d.executeScript(`
          const els=[...document.querySelectorAll('.gb-field-half:last-child .gb-permanent')];
          const el=els.find(e=>/Mountain/.test(e.textContent||'')&&!e.className.includes('is-tapped'));
          if(!el) return false; el.click(); return true;
        `);
        if (!tapped) break;
        taps++;
        await sleep(350);
      }
      console.log('  tapped ' + taps + ' land(s)');

      if (!before.hand.includes('Goblin Piker')) {
        console.log('  no Goblin Piker in hand');
        await clickIn(d, '.gb-pass');
        await sleep(400);
        continue;
      }

      const selected = await selectInHand(d, 'Goblin Piker');
      await sleep(400);
      const cast = await clickIn(d, '.gb-card-play');
      await sleep(700);
      const afterCast = await state(d);
      console.log(
        '  selected=' +
          selected +
          ' castPressed=' +
          cast +
          ' prompt=' +
          JSON.stringify(afterCast.prompt) +
          ' buttons=' +
          JSON.stringify(afterCast.promptButtons),
      );

      const noTarget = await clickIn(d, '.gb-prompt-actions .gb-btn', 'no target');
      await sleep(900);
      const afterSend = await state(d);
      console.log(
        '  noTargetPressed=' +
          noTarget +
          ' stack=' +
          JSON.stringify(afterSend.stack) +
          ' refusal=' +
          JSON.stringify(afterSend.refusal),
      );

      // Let it resolve.
      for (let i = 0; i < 8; i++) {
        const now = await state(d);
        if (now.mine.some((n) => n.startsWith('Goblin Piker'))) {
          console.log('  RESOLVED: ' + JSON.stringify(now.mine));
          return;
        }
        await clickIn(d, '.gb-pass');
        await sleep(500);
      }
      console.log('  did not resolve: ' + JSON.stringify((await state(d)).mine));
    }
    console.log(NL + 'never got a creature down');
  } finally {
    opponent.stop();
    try {
      await opponent.c.stop();
    } catch {
      /* ignore */
    }
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
