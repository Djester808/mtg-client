// Does every control on the board do what it says, when a real person presses it?
//
// Everything else that exercises the game does it from Node over SignalR, which proves the hub
// and the engine and says nothing about the buttons. This drives the board itself: a real
// account signs in through the login form, opens a real game against a scripted opponent, and
// every action is a DOM click on the control a player would press.
//
// Each step declares what pressing it should do. "moves" means the log has to grow — measured
// immediately before the decisive click, so the delta is that press and not the passing it took
// to reach a step where the press was legal. "no-change" means the opposite: Cancel and Start
// over are controls whose whole job is to send nothing, and a Cancel that quietly cast the spell
// would sail through any check that only asks whether something happened.
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

// `combat` runs only the combat flows, in a game of their own. They sit at the end of a long
// sequence otherwise, by which point the deck, the turn count and the opponent's board have
// all wandered — and a control that is never reached tells nobody anything.
const ONLY = process.argv[2] || 'all';

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(__dirname, 'screenshots', 'board-actions');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

// The browser player needs a spell that targets, so the targeting prompt is reachable at all:
// Lightning Bolt takes any target (CR 115.1), which is what makes "the opponent", "you" and an
// opposing creature three separate things to press.
// Mono-red and deep, both deliberately. Two colours meant the land it drew was regularly
// the wrong one for the spell it held, and a 26-card deck ran itself out by turn 28 — a
// script that spends turns getting into position needs a deck that cannot deck out under
// it. Goblin Piker is vanilla, so it needs no card definition, and the same Mountains cast
// it.
const DECK_A = ['40 Mountain', '20 Lightning Bolt', '20 Goblin Piker'].join('\n');
const MY_CREATURE = 'Goblin Piker';
// The opponent needs creatures: to attack with, so the blocking controls appear, and to block
// with two at once, which is what asks the attacker to divide damage (CR 510.1c).
const DECK_B = ['30 Forest', '30 Grizzly Bears'].join('\n');
const THEIR_CREATURE = 'Grizzly Bears';

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

async function signIn(p) {
  try {
    return (await api(null, 'POST', '/api/auth/login', p)).token;
  } catch {
    return (
      await api(null, 'POST', '/api/auth/register', {
        username: p.username,
        email: p.username + '@example.invalid',
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

async function deckFor(token, name, list) {
  const decks = await api(token, 'GET', '/api/games/decks');
  const found = decks.find((d) => d.name === name);
  if (found) return found.id;
  return (await api(token, 'POST', '/api/decks/import', { name, text: list })).deck.id;
}

/**
 * The opponent, played by a script.
 *
 * It answers what it is asked, attacks when it can, and blocks one attacker with two creatures
 * — the last on purpose: two blockers on one attacker is what makes the game ask the attacking
 * player to divide the damage (CR 510.1c), and that prompt is the only route to the board's
 * Confirm and Start over controls.
 */
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

  const ready = (v) =>
    v.battlefield.filter(
      (c) => c.controllerId === me && c.isCreature && !c.isTapped && !c.hasSummoningSickness,
    );

  let stop = false;
  (async () => {
    while (!stop) {
      await sleep(350);
      const v = view;
      if (!v) continue;

      try {
        if (v.choice) {
          if (v.choice.playerId !== me) continue;
          const options = (v.choice.options || []).map((o) => o.id);
          const picks =
            v.choice.maxPicks > 1 && options.length
              ? Array.from({ length: v.choice.maxPicks }, () => options[0])
              : options.length
                ? [options[0]]
                : ['keep'];
          await connection.invoke('Choose', gameId, picks);
          continue;
        }

        if (
          v.currentStep === 'DeclareAttackers' &&
          v.activePlayerId === me &&
          !v.attackersDeclared
        ) {
          // One attacker, not the whole board. Swinging with everything is a fine way to play
          // and a terrible way to be a fixture: the opponent snowballed to twenty-odd creatures
          // and killed this player through two hundred life before the harness had arranged
          // anything, and every combat control downstream reported "never reached".
          const them = v.players.find((p) => p.playerId !== me);
          const attackers = {};
          const first = ready(v)[0];
          if (first) attackers[first.id] = { defendingPlayer: them.playerId, planeswalker: null };
          await connection.invoke('DeclareAttackers', gameId, attackers);
          continue;
        }

        if (v.currentStep === 'DeclareBlockers' && v.activePlayerId !== me && !v.blockersDeclared) {
          const attackerIds = Object.keys(v.attackers);
          const mine = ready(v);
          const blocks = {};
          if (attackerIds.length > 0 && mine.length >= 2) {
            blocks[attackerIds[0]] = [mine[0].id, mine[1].id];
          } else if (attackerIds.length > 0 && mine.length === 1) {
            blocks[attackerIds[0]] = [mine[0].id];
          }
          await connection.invoke('DeclareBlockers', gameId, blocks);
          continue;
        }

        // Its own main phase: a land, then a creature if two lands can pay for one. Without
        // this the opponent never has a permanent, and half the board's controls — shooting an
        // opposing creature, blocking one, dividing damage among two blockers — have nothing to
        // act on. It reads its own hand, which is the one hand this view carries.
        if (v.currentStep === 'PrecombatMain' && v.activePlayerId === me) {
          const seat = v.players.find((p) => p.playerId === me);
          const hand = seat.hand || [];

          const land = hand.find((c) => /Forest|Mountain/.test(c.name));
          if (land && seat.landsPlayedThisTurn === 0) {
            await connection.invoke('PlayLand', gameId, land.id);
            continue;
          }

          // Three is enough: one to attack with, two to block with (CR 510.1c wants two on one
          // attacker before it asks anybody to divide damage).
          const onBoard = v.battlefield.filter((c) => c.controllerId === me && c.isCreature).length;
          const creature = onBoard >= 3 ? undefined : hand.find((c) => c.name === 'Grizzly Bears');
          const untapped = v.battlefield.filter(
            (c) => c.controllerId === me && /Forest|Mountain/.test(c.name) && !c.isTapped,
          );
          if (creature && untapped.length >= 2) {
            for (const l of untapped.slice(0, 2)) {
              await connection.invoke('ActivateAbility', gameId, l.id, 'mana', []);
            }
            await connection.invoke('CastSpell', gameId, creature.id, [], 0);
            continue;
          }
        }

        await connection.invoke('PassPriority', gameId);
      } catch {
        /* a refusal only means it was not the opponent's to do */
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
      prompt: text('.gb-prompt-text'),
      promptButtons: [...document.querySelectorAll('.gb-prompt-actions .gb-btn')].map(b => b.textContent.trim()),
      actionButtons: [...document.querySelectorAll('.gb-actions button')].map(b => b.textContent.trim()),
      hand: [...document.querySelectorAll('.gb-hand .gb-card .gb-card-name')].map(n => n.textContent.trim()),
      mine: [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent .gb-permanent-name')].map(n => n.textContent.trim()),
      theirs: [...document.querySelectorAll('.gb-field-half:first-child .gb-permanent .gb-permanent-name')].map(n => n.textContent.trim()),
      refusal: text('.gb-refusal'),
      overflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  `);
}

const logLines = async (token, gameId) =>
  (await api(token, 'GET', '/api/games/' + gameId + '/log')).length;

/**
 * Finds and clicks in a single in-page script.
 *
 * Selenium's find-then-click is two round trips, and the board re-renders between them on every
 * pushed view — which is constantly, with a scripted opponent acting on a timer. Half the early
 * failures here were StaleElementReference rather than anything about the app.
 */
async function clickIn(d, selector, pattern) {
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
async function clickInExcept(d, selector, pattern) {
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
async function clickPermanent(d, side, name) {
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

/** Taps every untapped land, one at a time, so a spell has mana to be paid with. */
async function tapLands(d) {
  for (let i = 0; i < 8; i++) {
    const tapped = await d.executeScript(`
      const els = [...document.querySelectorAll('.gb-field-half:last-child .gb-permanent')];
      const el = els.find(
        (e) => /Mountain/.test(e.textContent || '') && !e.className.includes('is-tapped'),
      );
      if (!el) return false;
      el.click();
      return true;
    `);
    if (!tapped) return i;
    await sleep(350);
  }
  return 8;
}

/** Plays a land if one is in hand, so the next spell has more mana than the last. */
async function playALand(d) {
  const s = await board(d);
  const land = s.hand.find((n) => n === 'Mountain');
  if (!land) return false;
  const played = await playFromHand(d, land);
  await sleep(900);
  return played;
}

/**
 * Passes priority until the game is somewhere the next thing can legally be done.
 *
 * The step comes from the view rather than the screen because the board does not show it — it
 * says whose turn it is and nothing more. That is a gap for a player; here it just means the
 * timing is read from the server while the clicking stays in the UI.
 */
async function advanceTo(d, token, gameId, wanted, { minTurn = 0, mine = true } = {}) {
  for (let i = 0; i < 500; i++) {
    const view = await api(token, 'GET', '/api/games/' + gameId);
    const here =
      view.currentStep === wanted &&
      view.turnNumber >= minTurn &&
      (mine ? view.activePlayerId === view.viewer : view.activePlayerId !== view.viewer);

    if (here && !view.choice) return view;

    if (i > 0 && i % 60 === 0) {
      console.log(
        '      still waiting for ' + wanted + ': turn ' + view.turnNumber + ' ' + view.currentStep,
      );
    }

    if (view.choice && view.choice.playerId === view.viewer && !view.choice.isDivision) {
      // Routine questions get answered so the game keeps moving — discarding to hand size at
      // cleanup is one, and it stops the board dead until someone says which card. A division
      // is deliberately left alone: that prompt is the only route to Confirm and Start over,
      // and the steps below drive it by hand.
      await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
      await sleep(300);
      await clickIn(d, '.gb-prompt-actions .gb-btn', 'confirm');
      await sleep(400);
      continue;
    }

    if (!view.choice) {
      // Combat has no priority to pass until the declaration is in (CR 508.1, 509.1), so the
      // board offers a declare button and no Pass; afterwards it swaps them over.
      if (view.currentStep === 'DeclareAttackers' || view.currentStep === 'DeclareBlockers') {
        const declared = await clickIn(d, '.gb-btn-primary', 'attack with|block with');
        if (!declared) await clickIn(d, '.gb-pass');
      } else {
        await clickIn(d, '.gb-pass');
      }
    }
    await sleep(300);
  }
  return null;
}

/**
 * Presses whatever keeps the game moving, except the thing the caller is waiting for.
 *
 * advanceTo() is the wrong tool once the target is a control rather than a step: to keep the
 * game moving it presses "Block with nothing", which ends the block declaration — so it kept
 * closing the window it had been asked to stop at, and reported turn after turn of never
 * finding it. This reads the screen instead of the step name, which is what a player has.
 */
async function nudge(d, { hold = 'none', view = null } = {}) {
  // The block window is recognised from the view rather than from the buttons on screen. A
  // pushed view and the render that follows it are not the same instant, so a gate that reads
  // the DOM can miss a window that is genuinely open — and then this presses Pass and closes
  // it. The game waits for the defending player, so holding on the server's word is safe: it
  // will still be that step when the next press lands.
  if (
    hold === 'blockers' &&
    view &&
    view.currentStep === 'DeclareBlockers' &&
    !view.blockersDeclared
  ) {
    return 'held';
  }

  const s = await board(d);

  // A prompt stops everything until it is answered. The division is left alone when it is the
  // one being waited for; anything else (a mulligan, discarding to hand size) gets answered.
  if (s.promptButtons.length > 0) {
    const isDivision = s.promptButtons.some((t) => /start over/i.test(t));
    if (isDivision && hold === 'division') return 'held';
    await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
    await sleep(250);
    await clickIn(d, '.gb-prompt-actions .gb-btn', 'confirm');
    return 'answered';
  }

  const blocking = s.actionButtons.some((t) => /block with/i.test(t));
  if (blocking && hold === 'blockers') return 'held';

  if (s.actionButtons.some((t) => /attack with|block with/i.test(t))) {
    await clickIn(d, '.gb-btn-primary', 'attack with|block with');
    return 'declared';
  }

  await clickIn(d, '.gb-pass');
  return 'passed';
}

const turnNow = async (token, gameId) =>
  (await api(token, 'GET', '/api/games/' + gameId)).turnNumber;

/**
 * Runs one step and records whether the press did what the step said it would.
 *
 * mark() is called by the step immediately before the decisive click, so the measurement covers
 * that press alone. It also clears the refusal banner, which otherwise still shows whatever the
 * server last said no to while the script was passing its way into position.
 */
async function step(d, token, gameId, name, expect, fn) {
  let before = await logLines(token, gameId);
  const mark = async () => {
    await clickIn(d, '.gb-refusal');
    before = await logLines(token, gameId);
  };

  let reached = false;
  try {
    reached = await fn(mark);
  } catch (err) {
    steps.push({ name, expect, result: 'ERRORED: ' + String(err.message).slice(0, 60) });
    console.log('  ERR  ' + name + ': ' + String(err.message).slice(0, 100));
    return false;
  }

  if (!reached) {
    steps.push({ name, expect, result: 'NEVER REACHED' });
    console.log('  ??   ' + name.padEnd(24) + 'never reached');
    return false;
  }

  await sleep(1400);
  const after = await logLines(token, gameId);
  const state = await board(d);
  await shot(d, String(steps.length + 1).padStart(2, '0') + '-' + name);

  const moved = after > before;
  const ok = expect === 'moves' ? moved : !moved;
  steps.push({
    name,
    expect,
    result: ok ? 'as expected' : moved ? 'MOVED WHEN IT SHOULD NOT' : 'DID NOTHING',
  });
  console.log(
    '  ' +
      (ok ? 'ok  ' : 'FAIL') +
      ' ' +
      name.padEnd(24) +
      before +
      ' -> ' +
      after +
      ' (' +
      expect +
      ')' +
      (state.refusal ? '  refused: ' + state.refusal.slice(0, 55) : ''),
  );
  return ok;
}

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Board Flows Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Board Flows Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    // Far more life than a game needs, because this script spends turns getting into position
    // and takes an unblocked attack every one of them. At 20 the opponent killed it before the
    // later flows were reached, and 'the game is over' looks exactly like a broken button.
    // 200 is the API's own cap. With the opponent attacking one creature at a time that
    // is a hundred turns of headroom, which is far more than this needs.
    startingLife: 200,
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
    console.log('board opened as ' + A.username + '\n');

    if (ONLY !== 'combat') {
      // ---- the opening choice ----------------------------------------------------------------
      await step(d, tokenA, gameId, 'choice-option', 'moves', async (mark) => {
        for (let i = 0; i < 30; i++) {
          const s = await board(d);
          if (s.promptButtons.length > 0) {
            await mark();
            return clickIn(d, '.gb-prompt-actions .gb-btn', 'keep');
          }
          await sleep(500);
        }
        return false;
      });

      // ---- pass priority ---------------------------------------------------------------------
      await step(d, tokenA, gameId, 'pass-priority', 'moves', async (mark) => {
        for (let i = 0; i < 25; i++) {
          await mark();
          if (await clickIn(d, '.gb-pass')) return true;
          await sleep(500);
        }
        return false;
      });

      // ---- a land, and tapping it -------------------------------------------------------------
      await step(d, tokenA, gameId, 'play-land', 'moves', async (mark) => {
        if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain'))) return false;
        const s = await board(d);
        const land = s.hand.find((n) => n === 'Mountain');
        return land ? playFromHand(d, land, mark) : false;
      });

      await step(d, tokenA, gameId, 'tap-land-for-mana', 'moves', async (mark) => {
        await mark();
        return (await clickPermanent(d, 'mine', 'Mountain')) || clickPermanent(d, 'mine', 'Forest');
      });

      // ---- an illegal press, and dismissing what it says ---------------------------------------
      await step(d, tokenA, gameId, 'refusal-appears', 'no-change', async (mark) => {
        // A second land in one turn is refused (CR 505.6b). The board has to say so rather than
        // swallow it, and the press must not change the game.
        const s = await board(d);
        const land = s.hand.find((n) => n === 'Mountain');
        if (!land) return false;
        await mark();
        await playFromHand(d, land);
        await sleep(1000);
        return !!(await board(d)).refusal;
      });

      await step(d, tokenA, gameId, 'dismiss-refusal', 'no-change', async (mark) => {
        // Raises its own refusal after marking: the previous step's banner is cleared by mark(),
        // which is exactly what this one needs on screen.
        await mark();
        const s = await board(d);
        const land = s.hand.find((n) => n === 'Mountain');
        if (!land) return false;
        await playFromHand(d, land);
        await sleep(1000);
        if (!(await board(d)).refusal) return false;

        if (!(await clickIn(d, '.gb-refusal'))) return false;
        await sleep(700);
        if ((await board(d)).refusal) throw new Error('the refusal banner did not go away');
        return true;
      });

      // ---- casting, and the targeting prompt ----------------------------------------------------
      await step(d, tokenA, gameId, 'cancel-targeting', 'no-change', async (mark) => {
        const next = (await turnNow(tokenA, gameId)) + 1;
        if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain', { minTurn: next }))) return false;
        await playALand(d);
        await tapLands(d);
        if (!(await playFromHand(d, 'Lightning Bolt'))) return false;
        await sleep(800);
        await mark();
        return clickIn(d, '.gb-prompt-actions .gb-btn', 'cancel');
      });

      await step(d, tokenA, gameId, 'target-the-opponent', 'moves', async (mark) => {
        if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain'))) return false;
        await tapLands(d);
        if (!(await playFromHand(d, 'Lightning Bolt'))) return false;
        await sleep(800);
        if ((await board(d)).promptButtons.length === 0) return false;
        await mark();
        // The opponent's own name is the button that is none of the other three.
        return clickInExcept(d, '.gb-prompt-actions .gb-btn', '^you$|no target|cancel');
      });

      await step(d, tokenA, gameId, 'target-yourself', 'moves', async (mark) => {
        const next = (await turnNow(tokenA, gameId)) + 1;
        if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain', { minTurn: next }))) return false;
        await playALand(d);
        await tapLands(d);
        if (!(await playFromHand(d, 'Lightning Bolt'))) return false;
        await sleep(800);
        await mark();
        return clickIn(d, '.gb-prompt-actions .gb-btn', '^you$');
      });

      await step(d, tokenA, gameId, 'target-a-permanent', 'moves', async (mark) => {
        // Waits for the opponent to have a creature, which is the only thing on the board a spell
        // can be pointed at by tapping it.
        for (let i = 0; i < 120; i++) {
          if (!(await advanceTo(d, tokenA, gameId, 'PrecombatMain'))) return false;
          const s = await board(d);
          if (s.theirs.length === 0) {
            await clickIn(d, '.gb-pass');
            await sleep(600);
            continue;
          }

          await playALand(d);
          await tapLands(d);
          if (!(await playFromHand(d, 'Lightning Bolt'))) {
            // No Bolt in hand this turn, or no mana for one yet. Draw another card and come back
            // rather than calling the control untested.
            await clickIn(d, '.gb-pass');
            await sleep(600);
            continue;
          }
          await sleep(800);
          await mark();
          if (await clickPermanent(d, 'theirs', s.theirs[0])) return true;

          await clickIn(d, '.gb-prompt-actions .gb-btn', 'cancel');
          await sleep(500);
        }
        return false;
      });
    }

    // ---- combat, from both sides --------------------------------------------------------------
    //
    // Blocking comes first, and that is a rules constraint rather than a preference: a creature
    // that attacked is tapped (CR 508.1f) and cannot block on the turn that follows. Attacking
    // first would leave this player with nothing untapped to block with, which reads as a broken
    // button and is really just the game working.

    /**
     * Casts a creature, so this player has something to block and attack with.
     *
     * Written as one loop that re-reads the game every pass, rather than as a sequence of
     * advanceTo() calls with turn arithmetic. The arithmetic version failed for six runs in a
     * row and reported "never reached" for every control downstream of it; a diagnostic that
     * did nothing but try to cast a creature showed the app was fine — turn 1 is correctly
     * refused for mana ({1}{R} off one Mountain), turn 3 resolves — and that the fault was the
     * choreography. This is that diagnostic's loop.
     */
    async function ensureCreature() {
      for (let i = 0; i < 60; i++) {
        if ((await board(d)).mine.includes(MY_CREATURE)) return true;

        const view = await api(tokenA, 'GET', '/api/games/' + gameId);

        if (view.choice) {
          if (view.choice.isDivision) return false;
          await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
          await sleep(250);
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

        await playALand(d);
        await tapLands(d);

        if (!(await board(d)).hand.includes(MY_CREATURE)) {
          await clickIn(d, '.gb-pass');
          await sleep(400);
          continue;
        }

        await playFromHand(d, MY_CREATURE);
        await sleep(700);
        await clickIn(d, '.gb-prompt-actions .gb-btn', 'no target');
        await sleep(800);

        // It is a spell until it resolves (CR 608.1), so both players have to pass.
        for (let n = 0; n < 8; n++) {
          if ((await board(d)).mine.includes(MY_CREATURE)) return true;
          await clickIn(d, '.gb-pass');
          await sleep(450);
        }
      }
      return (await board(d)).mine.includes(MY_CREATURE);
    }

    await step(d, tokenA, gameId, 'declare-blockers', 'moves', async (mark) => {
      if (!(await ensureCreature())) return false;

      // Summoning sickness does not stop a creature blocking (CR 302.6), so this can be the
      // very turn it arrived — it only has to be untapped.
      for (let i = 0; i < 500; i++) {
        const view = await api(tokenA, 'GET', '/api/games/' + gameId);
        const state = await nudge(d, { hold: 'blockers', view });
        if (state !== 'held') {
          if (i > 0 && i % 50 === 0) {
            const v = view;
            const b = await board(d);
            const attacking = await d.executeScript(
              "return document.querySelectorAll('.gb-field-half:first-child .gb-permanent.is-attacking').length;",
            );
            console.log(
              '      blockers wait: nudge=' +
                state +
                ' step=' +
                v.currentStep +
                (v.activePlayerId === v.viewer ? ' mine' : ' theirs') +
                ' declared=' +
                v.blockersDeclared +
                ' attacking=' +
                attacking +
                ' buttons=' +
                JSON.stringify(b.actionButtons) +
                ' mine=' +
                JSON.stringify(b.mine),
            );
          }
          await sleep(300);
          continue;
        }

        const s = await board(d);
        if (!s.mine.includes(MY_CREATURE)) {
          await clickIn(d, '.gb-btn-primary', 'block with');
          await sleep(300);
          continue;
        }

        // The attacker, not just any creature of theirs. blockFor() only answers a tap on a
        // creature that is attacking (CR 509.1a), and the opponent keeps three but swings with
        // one — so tapping the first Grizzly Bears on the board pointed at nothing, the blocker
        // assignment silently did nothing, and no "Block with 1" button ever appeared.
        const pointed = await clickIn(d, '.gb-field-half:first-child .gb-permanent.is-attacking');
        if (!pointed) {
          await clickIn(d, '.gb-btn-primary', 'block with');
          await sleep(300);
          continue;
        }

        await sleep(400);
        if (!(await clickPermanent(d, 'mine', MY_CREATURE))) continue;
        await sleep(400);
        await mark();
        if (await clickIn(d, '.gb-btn-primary', 'block with [1-9]')) return true;

        await clickIn(d, '.gb-btn-primary', 'block with');
        await sleep(300);
      }
      return false;
    });

    await step(d, tokenA, gameId, 'declare-attackers', 'moves', async (mark) => {
      if (!(await ensureCreature())) return false;

      for (let i = 0; i < 20; i++) {
        const combat = await advanceTo(d, tokenA, gameId, 'DeclareAttackers');
        if (!combat) return false;
        if (!(await board(d)).mine.includes(MY_CREATURE)) return false;

        if (!(await clickPermanent(d, 'mine', MY_CREATURE))) continue;
        await sleep(400);
        await mark();
        if (await clickIn(d, '.gb-btn-primary', 'attack with [1-9]')) return true;

        // Tapped from last turn's attack: wait for it to untap and try again.
        await clickIn(d, '.gb-btn-primary', 'attack with nothing');
        await sleep(600);
      }
      return false;
    });

    // The opponent blocks with two, which asks this player to divide the damage (CR 510.1c) —
    // the only route to Confirm and Start over.
    await step(d, tokenA, gameId, 'division-start-over', 'no-change', async (mark) => {
      for (let i = 0; i < 500; i++) {
        if ((await nudge(d, { hold: 'division' })) !== 'held') {
          await sleep(300);
          continue;
        }
        {
          await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
          await sleep(400);
          await mark();
          return clickIn(d, '.gb-prompt-actions .gb-btn', 'start over');
        }
        await sleep(400);
      }
      return false;
    });

    await step(d, tokenA, gameId, 'division-confirm', 'moves', async (mark) => {
      for (let i = 0; i < 500; i++) {
        if ((await nudge(d, { hold: 'division' })) !== 'held') {
          await sleep(300);
          continue;
        }
        {
          // Assign every point: Confirm stays disabled until enough has been divided.
          for (let n = 0; n < 12; n++) {
            const enabled = await d.executeScript(
              `const b=[...document.querySelectorAll('.gb-prompt-actions .gb-btn')].find(x=>/confirm/i.test(x.textContent)); return b ? !b.disabled : false;`,
            );
            if (enabled) break;
            await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
            await sleep(300);
          }
          await mark();
          return clickIn(d, '.gb-prompt-actions .gb-btn', 'confirm');
        }
        await sleep(400);
      }
      return false;
    });

    await shot(d, '99-final');
    const final = await board(d);
    console.log('\nfinal board: ' + JSON.stringify(final));
    if (final.overflows) console.log('THE BOARD OVERFLOWED THE VIEWPORT');
  } finally {
    bot.stop();
    try {
      await bot.connection.stop();
    } catch {
      /* the results matter more than a tidy socket */
    }
    try {
      await d.quit();
    } catch {
      /* likewise the browser */
    }
    report();
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  report();
  process.exitCode = 1;
});

/**
 * Says what happened, from wherever the run ended.
 *
 * In finally rather than after it: a run that died on the way to its last step printed
 * nothing at all, so nine controls that had been verified went unreported alongside the one
 * that broke.
 */
function report() {
  if (report.done) return;
  report.done = true;

  console.log('\n--- what a real press did ---');
  steps.forEach((s) =>
    console.log('  ' + s.name.padEnd(24) + (s.expect + ':').padEnd(12) + s.result),
  );

  const failed = steps.filter((s) => s.result !== 'as expected');
  if (failed.length > 0) {
    console.log('\n' + failed.length + ' of ' + steps.length + ' control(s) did not behave.');
    process.exitCode = 1;
  } else if (steps.length === 0) {
    console.log('nothing ran: the game never started.');
    process.exitCode = 1;
  } else {
    console.log('\nall ' + steps.length + ' controls behaved.');
  }
}
