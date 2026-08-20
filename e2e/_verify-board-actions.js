// Do the board's controls actually do anything, when a real person presses them?
//
// Everything else that exercises the game does it from Node over SignalR, which proves the hub
// and the engine and says nothing about the buttons. This drives the board itself: a real
// account signs in through the login form, opens a real game against a scripted opponent, and
// every action is a DOM click on the control a player would press.
//
// Each click has to move the game. The log is the witness — it grows by at least one line, or
// the control did nothing and this says so. A screenshot is written per step so the claim can be
// looked at rather than believed.
//
//   node _verify-board-actions.js
//
// Run it from e2e/ (dotenv reads .env from the cwd) with the API and dev server up.

const fs = require('fs');
const path = require('path');
const signalR = require('@microsoft/signalr');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(__dirname, 'screenshots', 'board-actions');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = {
  username: 'restart-check-b',
  email: 'restart-check-b@example.invalid',
  password: 'restart-check-b-pw',
};

// Lands first: 8 Forest means the opening hand reliably holds one, so "play a land" is a step
// this can actually take rather than one it has to hope for.
const DECKLIST = ['10 Forest', '10 Grizzly Bears'].join('\n');

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

/** Login first, register only if the account is not there yet. */
async function signIn(p) {
  try {
    return (
      await api(null, 'POST', '/api/auth/login', {
        username: p.username,
        password: p.password,
      })
    ).token;
  } catch {
    return (
      await api(null, 'POST', '/api/auth/register', {
        username: p.username,
        email: p.email || p.username + '@example.invalid',
        password: p.password,
      })
    ).token;
  }
}

function userIdFromToken(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  return (
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
    payload.nameid ??
    payload.sub
  );
}

async function deckFor(token, name) {
  const decks = await api(token, 'GET', '/api/games/decks');
  const found = decks.find((d) => d.name === name);
  if (found) return found.id;
  return (await api(token, 'POST', '/api/decks/import', { name, text: DECKLIST })).deck.id;
}

/** The scripted opponent: answers anything put to it and passes when it holds priority. */
async function opponent(token, gameId) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(baseUrl + '/hubs/game', { accessTokenFactory: () => token })
    .build();

  const me = userIdFromToken(token);
  let view = null;
  connection.on('State', (v) => {
    view = v;
  });
  connection.on('Refused', () => {});
  connection.on('Log', () => {});
  await connection.start();
  await connection.invoke('Join', gameId);

  // Left running for the whole session: whenever the game turns to B, B answers. Without it the
  // board would sit on "waiting for the other player" and no button would be pressable at all.
  let stop = false;
  (async () => {
    while (!stop) {
      await sleep(400);
      try {
        if (!view) continue;
        if (view.choice && view.choice.playerId === me) {
          const options = (view.choice.options || []).map((o) => o.id);
          await connection.invoke('Choose', gameId, options.length ? [options[0]] : ['keep']);
        } else if (!view.choice) {
          await connection.invoke('PassPriority', gameId);
        }
      } catch {
        /* a refusal just means it was not B's to do */
      }
    }
  })();

  return { connection, stop: () => (stop = true) };
}

// ---- the browser side ---------------------------------------------------------------------

const steps = [];

async function shot(d, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
}

async function board(d) {
  return d.executeScript(`
    const text = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null; };
    return {
      step: text('.gb-step') || text('.gb-turn'),
      prompt: text('.gb-prompt-text'),
      promptButtons: [...document.querySelectorAll('.gb-prompt-actions .gb-btn')].map(b => b.textContent.trim()),
      actionButtons: [...document.querySelectorAll('.gb-actions button')].map(b => b.textContent.trim()),
      hand: [...document.querySelectorAll('.gb-hand .gb-card .gb-card-name')].map(n => n.textContent.trim()),
      mine: [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent .gb-permanent-name')].map(n => n.textContent.trim()),
      refusal: text('.gb-refusal'),
      overflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  `);
}

async function logLines(token, gameId) {
  return (await api(token, 'GET', '/api/games/' + gameId + '/log')).length;
}

/**
 * Clicks something and insists the game moved.
 *
 * A control that renders and does nothing is the failure this whole script exists to catch, and
 * it is invisible from a screenshot — so the log length before and after is the assertion.
 */
async function act(d, token, gameId, name, fn) {
  // Measured around the decisive click alone, not around getting to it. Each step calls mark()
  // immediately before the press it is actually testing, so the delta below is that press and
  // not the passing it took to reach a step where the press was legal.
  let before = await logLines(token, gameId);
  const mark = async () => {
    // The refusal banner shows the last thing the server said no to, and getting to a legal
    // moment involves pressing Pass when it is not yours. Cleared here so the banner reported
    // below belongs to the press being measured.
    await clickIf(d, '.gb-refusal');
    before = await logLines(token, gameId);
  };

  const did = await fn(mark);
  if (!did) {
    steps.push({ name, result: 'not available' });
    console.log('  - ' + name + ': not available on screen');
    return false;
  }

  await sleep(1400);
  const after = await logLines(token, gameId);
  const state = await board(d);
  await shot(d, String(steps.length + 1).padStart(2, '0') + '-' + name);

  const moved = after > before;
  steps.push({
    name,
    result: moved ? 'moved the game' : 'DID NOTHING',
    before,
    after,
    refusal: state.refusal,
  });
  console.log(
    '  ' +
      (moved ? 'ok  ' : 'FAIL') +
      ' ' +
      name +
      ': ' +
      before +
      ' -> ' +
      after +
      ' log lines' +
      (state.refusal ? ' (refused: ' + state.refusal + ')' : ''),
  );
  return moved;
}

/**
 * Passes priority until the game is at a step where the next thing can legally be done.
 *
 * The step comes from the view rather than the screen because the board does not show it — it
 * says whose turn it is and nothing more. That is a real gap for a player, and for this script
 * it just means the timing has to be read from the server while the clicking stays in the UI.
 */
async function advanceTo(d, token, gameId, step, minTurn = 0) {
  for (let i = 0; i < 400; i++) {
    const view = await api(token, 'GET', '/api/games/' + gameId);
    const here =
      view.currentStep === step &&
      view.activePlayerId === view.viewer &&
      view.turnNumber >= minTurn;

    if (here && !view.choice) return true;

    if (i % 25 === 0) {
      console.log(
        '      waiting for ' + step + ' (turn >= ' + minTurn + '); at turn ' + view.turnNumber +
          ' ' + view.currentStep + (view.activePlayerId === view.viewer ? ' mine' : ' theirs') +
          (view.choice ? ' choice:' + view.choice.kind : ''),
      );
    }

    if (!view.choice) {
      // Combat has no priority to pass (CR 508.1, 509.1): attackers and blockers are declared
      // before anyone gets any, so the board offers a declare button and no Pass at all. A
      // script that only knows how to pass sits there for ever, which is what this one did.
      if (view.currentStep === 'DeclareAttackers' || view.currentStep === 'DeclareBlockers') {
        // Declare if the declaration is still pending, otherwise pass: priority is granted
        // inside these steps once the declaration is in (CR 508.2, 509.4), and the board swaps
        // the declare button for Pass at that moment.
        const declared = await clickIf(d, '.gb-btn-primary', (t) =>
          /attack with|block with/i.test(t),
        );
        if (!declared) await clickIf(d, '.gb-pass');
      } else {
        await clickIf(d, '.gb-pass');
      }
    }
    await sleep(400);
  }
  return false;
}

/** The turn the game is on right now. */
async function turnNow(token, gameId) {
  return (await api(token, 'GET', '/api/games/' + gameId)).turnNumber;
}

/** Clicks the first element matching, if it is there. Returns whether it clicked. */
async function clickIf(d, selector, filter) {
  const els = await d.findElements(By.css(selector));
  for (const el of els) {
    if (!(await el.isDisplayed())) continue;
    if (filter && !filter((await el.getText()).trim())) continue;
    await d.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
    await sleep(200);
    await d.executeScript('arguments[0].click();', el);
    return true;
  }
  return false;
}

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Board Actions A');
  const deckB = await deckFor(tokenB, 'Board Actions B');

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;
  console.log('game: ' + gameId);

  const bot = await opponent(tokenB, gameId);
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
    await shot(d, '00-opened');
    console.log('board opened as ' + A.username);
    console.log(JSON.stringify(await board(d)));

    // 1. The opening mulligan prompt: a real choice button, pressed.
    await act(d, tokenA, gameId, 'choice-prompt-button', async (mark) => {
      for (let i = 0; i < 25; i++) {
        const s = await board(d);
        if (s.promptButtons.length > 0) {
          await mark();
          const clicked = await clickIf(d, '.gb-prompt-actions .gb-btn');
          if (clicked) {
            // maxPicks > 1 puts the answer behind Confirm; a single pick sends on the tap.
            await sleep(500);
            await clickIf(d, '.gb-prompt-actions .gb-btn', (t) => /confirm/i.test(t));
            return true;
          }
        }
        await sleep(600);
      }
      return false;
    });

    // 2. Pass priority.
    await act(d, tokenA, gameId, 'pass-priority-button', async (mark) => {
      for (let i = 0; i < 20; i++) {
        await mark();
        if (await clickIf(d, '.gb-pass')) return true;
        await sleep(600);
      }
      return false;
    });

    // 3. Play a land: select the card in hand, then press its Play affordance.
    await act(d, tokenA, gameId, 'play-land', async (mark) => {
      if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain'))) return false;

      const s = await board(d);
      const at = s.hand.indexOf('Forest');
      if (at < 0) return false;

      const cards = await d.findElements(By.css('.gb-hand .gb-card'));
      await d.executeScript('arguments[0].click();', cards[at]);
      await sleep(500);
      await mark();
      return clickIf(d, '.gb-card-play');
    });

    // 4. Tap that land for mana — the activated-ability path, from the battlefield.
    await act(d, tokenA, gameId, 'tap-land-for-mana', async (mark) => {
      const mine = await d.findElements(By.css('.gb-field-half:last-child .gb-permanent'));
      for (const el of mine) {
        if (/Forest/.test(await el.getText())) {
          await mark();
          await d.executeScript('arguments[0].click();', el);
          return true;
        }
      }
      return false;
    });

    // 5. Cast a creature: a second land next turn, both tapped, then the spell.
    await act(d, tokenA, gameId, 'cast-creature', async (mark) => {
      // A later turn: the second land is a second land drop (CR 505.6b), not a refusal.
      const next = (await turnNow(tokenA, gameId)) + 1;
      if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain', next))) return false;

      let s = await board(d);
      if (s.mine.filter((n) => n === 'Forest').length < 2 && s.hand.includes('Forest')) {
        const cards = await d.findElements(By.css('.gb-hand .gb-card'));
        await d.executeScript('arguments[0].click();', cards[s.hand.indexOf('Forest')]);
        await sleep(500);
        await clickIf(d, '.gb-card-play');
        await sleep(1200);
      }

      s = await board(d);
      if (s.mine.filter((n) => n === 'Forest').length < 2) return false;

      const lands = await d.findElements(By.css('.gb-field-half:last-child .gb-permanent'));
      for (const el of lands) {
        if (/Forest/.test(await el.getText())) {
          await d.executeScript('arguments[0].click();', el);
          await sleep(400);
        }
      }

      s = await board(d);
      const at = s.hand.indexOf('Grizzly Bears');
      if (at < 0) return false;

      const cards = await d.findElements(By.css('.gb-hand .gb-card'));
      await d.executeScript('arguments[0].click();', cards[at]);
      await sleep(500);
      await mark();
      if (!(await clickIf(d, '.gb-card-play'))) return false;

      // A nonland waits for a target rather than being sent and refused, so the prompt has to
      // be answered too. "No target" is the honest answer for a vanilla creature.
      await sleep(800);
      await clickIf(d, '.gb-prompt-actions .gb-btn', (t) => /no target/i.test(t));
      return true;
    });

    // 6. Declare attackers: tap the creature, then press the button.
    await act(d, tokenA, gameId, 'declare-attackers-button', async (mark) => {
      // The creature has to lose summoning sickness first (CR 302.6), which is next turn.
      const next = (await turnNow(tokenA, gameId)) + 1;
      if (!(await advanceTo(d, tokenA, gameId, 'DeclareAttackers', next))) return false;

      const mine = await d.findElements(By.css('.gb-field-half:last-child .gb-permanent'));
      let tapped = false;
      for (const el of mine) {
        if (/Grizzly Bears/.test(await el.getText())) {
          await d.executeScript('arguments[0].click();', el);
          tapped = true;
          break;
        }
      }
      if (!tapped) return false;

      await sleep(500);
      await mark();
      return clickIf(d, '.gb-btn-primary', (t) => /attack with [1-9]/i.test(t));
    });

    await shot(d, '99-final');
    console.log('\nfinal board: ' + JSON.stringify(await board(d)));
  } finally {
    bot.stop();
    await bot.connection.stop();
    await d.quit();
  }

  console.log('\n--- what a real press did ---');
  steps.forEach((s) => console.log('  ' + s.name.padEnd(26) + s.result));
  const failed = steps.filter((s) => s.result !== 'moved the game');
  if (failed.length > 0) {
    console.log('\n' + failed.length + ' control(s) did not move the game.');
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
