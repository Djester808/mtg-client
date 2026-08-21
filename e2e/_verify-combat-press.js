// The three combat controls the other harness could never reach, pressed for real.
//
// Its opponent acted on a timer, which meant every window this needed was a race — and the
// races were lost so consistently that "never reached" started to look like a verdict on the
// app. It was not: the engine waits at declare-blockers, and the board offers the button. The
// harness was simply moving the game on before the press landed.
//
// So this opponent does nothing on its own. It acts when told, one action at a time, and the
// game therefore advances only when this script says so. A window that opens stays open, and
// there is nothing left to race.
//
//   node _verify-combat-press.js
//
// Run it from e2e/ with the API and dev server up.

const fs = require('fs');
const path = require('path');
const signalR = require('@microsoft/signalr');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const {
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
} = require('./helpers/board-driver');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const SHOTS = path.join(__dirname, 'screenshots', 'combat-press');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const NL = String.fromCharCode(10);

const DECK_A = ['40 Mountain', '20 Goblin Piker', '20 Lightning Bolt'].join(NL);
const DECK_B = ['40 Forest', '40 Grizzly Bears'].join(NL);
const MY_CREATURE = 'Goblin Piker';

/**
 * The opponent, on a leash.
 *
 * No loop, no timer: every method is one action, taken when this script calls it. Refusals are
 * swallowed, because "that was not yours to do" is a normal answer to an intent and the caller
 * is asking the game to move, not asserting that it will.
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
  connection.on('Refused', (why) => {
    if (process.env.DIAG) console.log('    [opponent] refused: ' + why);
  });
  connection.on('Log', () => {});
  await connection.start();
  await connection.invoke('Join', gameId);
  await sleep(400);

  /**
   * Re-reads this player's own view over HTTP.
   *
   * The socket view is a push, and a push arrives when it arrives. Every method below decides
   * what to do from the state it can see, so deciding from a view that is one action out of
   * date meant the opponent sat through its own main phase doing nothing — it saw the previous
   * step. This asks the server instead, at the moment of asking.
   */
  const refresh = async () => {
    view = await api(token, 'GET', '/api/games/' + gameId);
    return view;
  };

  const send = async (method, ...args) => {
    try {
      await connection.invoke(method, gameId, ...args);
    } catch {
      /* not the opponent's to do */
    }
    await sleep(150);
  };

  const ready = () =>
    (view?.battlefield ?? []).filter(
      (c) => c.controllerId === me && c.isCreature && !c.isTapped && !c.hasSummoningSickness,
    );

  return {
    id: me,
    view: () => view,
    refresh,
    ready,
    pass: () => send('PassPriority'),

    async answer() {
      const choice = (await refresh()).choice;
      if (!choice || choice.playerId !== me) return false;
      const options = (choice.options || []).map((o) => o.id);
      const picks =
        choice.maxPicks > 1 && options.length
          ? Array.from({ length: choice.maxPicks }, () => options[0])
          : options.length
            ? [options[0]]
            : ['keep'];
      await send('Choose', picks);
      return true;
    },

    /** Attacks with one creature, or with none. */
    async attack(withOne) {
      await refresh();
      const them = (view?.players ?? []).find((p) => p.playerId !== me);
      const first = ready()[0];
      const attackers = {};
      if (withOne && first && them) {
        attackers[first.id] = { defendingPlayer: them.playerId, planeswalker: null };
      }
      await send('DeclareAttackers', attackers);
    },

    /** Blocks the first attacker with `count` creatures, if it has that many. */
    async block(count) {
      await refresh();
      const attackerIds = Object.keys(view?.attackers ?? {});
      const mine = ready();
      const blocks = {};
      if (attackerIds.length > 0 && mine.length >= count && count > 0) {
        blocks[attackerIds[0]] = mine.slice(0, count).map((c) => c.id);
      }
      await send('DeclareBlockers', blocks);
    },

    /** A land and a creature, so it has a board to attack and block with. */
    async develop() {
      await refresh();
      if (!view || view.currentStep !== 'PrecombatMain' || view.activePlayerId !== me) return;

      const seat = view.players.find((p) => p.playerId === me);
      const hand = seat?.hand ?? [];

      const land = hand.find((c) => /Forest/.test(c.name));
      if (process.env.DIAG) {
        console.log(
          '    [opponent] main: hand=' +
            hand.length +
            ' land=' +
            (land ? land.name : 'none') +
            ' played=' +
            seat?.landsPlayedThisTurn +
            ' board=' +
            view.battlefield.filter((c) => c.controllerId === me).length,
        );
      }
      // A land and then a spell in the same visit. Returning after the land meant one action
      // per turn, so it took four of its own turns to field a single creature and the script
      // ran out of budget before it ever had a board to attack with.
      if (land && seat.landsPlayedThisTurn === 0) {
        await send('PlayLand', land.id);
        await refresh();
      }

      // Three creatures is enough: one to attack with, two to block one attacker with — which
      // is what makes the game ask the attacker to divide damage (CR 510.1c).
      const onBoard = view.battlefield.filter((c) => c.controllerId === me && c.isCreature).length;
      if (onBoard >= 3) return;

      const seatNow = view.players.find((p) => p.playerId === me);
      const creature = (seatNow?.hand ?? []).find((c) => c.name === 'Grizzly Bears');
      const untapped = view.battlefield.filter(
        (c) => c.controllerId === me && /Forest/.test(c.name) && !c.isTapped,
      );
      if (creature && untapped.length >= 2) {
        for (const l of untapped.slice(0, 2)) await send('ActivateAbility', l.id, 'mana', []);
        await send('CastSpell', creature.id, [], 0);
      }
    },

    stop: () => connection.stop().catch(() => {}),
  };
}

// ---- results ---------------------------------------------------------------------------------

const steps = [];

async function shot(d, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
}

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
    steps.push({ name, expect, result: 'ERRORED: ' + String(err.message).slice(0, 70) });
    console.log('  ERR  ' + name + ': ' + String(err.message).slice(0, 110));
    return false;
  }

  if (!reached) {
    steps.push({ name, expect, result: 'NEVER REACHED' });
    console.log('  ??   ' + name.padEnd(22) + 'never reached');
    return false;
  }

  await sleep(1300);
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
      name.padEnd(22) +
      before +
      ' -> ' +
      after +
      ' (' +
      expect +
      ')' +
      (state.refusal ? '  refused: ' + state.refusal.slice(0, 50) : ''),
  );
  return ok;
}

// ---- the driver ------------------------------------------------------------------------------

/**
 * Moves the game exactly one notch, and says what it is waiting on this player for.
 *
 * Everything the opponent does happens here, when called. Nothing happens between calls, so a
 * window this reports stays open until the browser has acted on it.
 */
async function tick(d, tokenA, gameId, bot, policy) {
  const v = await api(tokenA, 'GET', '/api/games/' + gameId);

  if (v.choice) {
    if (v.choice.playerId === v.viewer) return { wants: 'choice', v };
    await bot.answer();
    return { wants: 'ticked', v };
  }

  const mine = v.activePlayerId === v.viewer;

  if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
    if (mine) return { wants: 'attack', v };
    await bot.attack(policy.opponentAttacks);
    return { wants: 'ticked', v };
  }

  if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
    // Blockers belong to whoever is not the active player (CR 509.1).
    if (mine) {
      await bot.block(policy.opponentBlocksWith);
      return { wants: 'ticked', v };
    }
    return { wants: 'block', v };
  }

  if (mine && v.currentStep === 'PrecombatMain') return { wants: 'main', v };

  // Order matters, and this one cost several runs: the opponent has to be given priority before
  // it can do anything with it. Developing first meant every land it tried to play came back
  // "You do not have priority (CR 117.1)", so it never had a board, never attacked, and every
  // combat window this script was waiting for never opened.
  await clickIn(d, '.gb-pass');
  await bot.develop();
  await bot.pass();
  return { wants: 'ticked', v };
}

/**
 * Ticks until the game wants one of `whats` from this player, or gives up.
 *
 * Everything it is *not* waiting for has to be answered here, not ignored. Leaving a pending
 * choice unanswered stops the game dead — a discard at cleanup will do it — and then nothing
 * else happens either: in one run this loop spun three hundred times while the opponent got two
 * turns, because a prompt nobody would answer was holding the whole game still.
 */
async function until_(d, tokenA, gameId, bot, policy, whats, limit = 300) {
  for (let i = 0; i < limit; i++) {
    const t = await tick(d, tokenA, gameId, bot, policy);
    if (whats.includes(t.wants)) return t;

    switch (t.wants) {
      case 'choice':
        await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
        await sleep(250);
        await clickIn(d, '.gb-prompt-actions .gb-btn', 'confirm');
        break;

      case 'attack':
        await clickIn(d, '.gb-btn-primary', 'attack with nothing');
        break;

      case 'block':
        await clickIn(d, '.gb-btn-primary', 'block with nothing');
        break;

      case 'main':
        await clickIn(d, '.gb-pass');
        break;

      default:
        break;
    }

    await sleep(120);
  }
  return null;
}

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Combat Press Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Combat Press Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 200,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;
  console.log('game: ' + gameId);

  const bot = await opponent(tokenB, gameId);
  const d = await buildDriver({ device, dpr: 1 });
  const policy = { opponentAttacks: true, opponentBlocksWith: 2 };

  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(2500);
    console.log('board opened as ' + A.username + NL);

    // Keep the opening hand, from both seats.
    for (let i = 0; i < 30; i++) {
      const v = await api(tokenA, 'GET', '/api/games/' + gameId);
      if (!v.choice) break;
      if (v.choice.playerId === v.viewer) {
        await clickIn(d, '.gb-prompt-actions .gb-btn', 'keep');
      } else {
        await bot.answer();
      }
      await sleep(500);
    }

    /** Gets a creature onto this player's battlefield, one turn at a time. */
    async function ensureCreature() {
      for (let i = 0; i < 40; i++) {
        if ((await board(d)).mine.includes(MY_CREATURE)) return true;

        const t = await until_(d, tokenA, gameId, bot, policy, ['main', 'block'], 60);
        if (!t) return false;
        if (t.wants === 'block') {
          await clickIn(d, '.gb-btn-primary', 'block with');
          await sleep(300);
          continue;
        }

        const s = await board(d);
        if (s.hand.includes('Mountain')) {
          await playFromHand(d, 'Mountain');
          await sleep(800);
        }
        await tapLands(d, 'Mountain');

        if ((await board(d)).hand.includes(MY_CREATURE)) {
          await playFromHand(d, MY_CREATURE);
          await sleep(700);
          await clickIn(d, '.gb-prompt-actions .gb-btn', 'no target');
          await sleep(700);
          for (let n = 0; n < 6; n++) {
            if ((await board(d)).mine.includes(MY_CREATURE)) return true;
            await clickIn(d, '.gb-pass');
            await bot.pass();
            await sleep(350);
          }
        }
        await clickIn(d, '.gb-pass');
        await bot.pass();
        await sleep(300);
      }
      return (await board(d)).mine.includes(MY_CREATURE);
    }

    const haveCreature = await ensureCreature();
    console.log('creature on the board: ' + haveCreature + NL);

    // ---- blocking ---------------------------------------------------------------------------
    await step(d, tokenA, gameId, 'declare-blockers', 'moves', async (mark) => {
      const t = await until_(d, tokenA, gameId, bot, policy, ['block'], 900);
      if (!t) return false;

      // The window is open and nothing will close it: the engine waits for this player, and the
      // opponent only acts when this script tells it to.
      await sleep(600);
      const s = await board(d);
      if (s.attacking === 0 || !s.mine.includes(MY_CREATURE)) return false;

      // Point at the attacker, then assign a blocker to it (CR 509.1a).
      if (!(await clickIn(d, '.gb-field-half:first-child .gb-permanent.is-attacking')))
        return false;
      await sleep(500);
      if (!(await clickPermanent(d, 'mine', MY_CREATURE))) return false;
      await sleep(500);
      await mark();
      return clickIn(d, '.gb-btn-primary', 'block with [1-9]');
    });

    // ---- dividing damage among two blockers ---------------------------------------------------
    await step(d, tokenA, gameId, 'division-start-over', 'no-change', async (mark) => {
      if (!(await ensureCreature())) return false;

      const t = await until_(d, tokenA, gameId, bot, policy, ['attack'], 400);
      if (!t) return false;

      if (!(await clickPermanent(d, 'mine', MY_CREATURE))) return false;
      await sleep(400);
      if (!(await clickIn(d, '.gb-btn-primary', 'attack with [1-9]'))) return false;

      // The opponent blocks it with two, and the game asks this player to divide the damage.
      const asked = await until_(d, tokenA, gameId, bot, policy, ['choice'], 60);
      if (!asked || !asked.v.choice.isDivision) return false;

      await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
      await sleep(400);
      await mark();
      return clickIn(d, '.gb-prompt-actions .gb-btn', 'start over');
    });

    await step(d, tokenA, gameId, 'division-confirm', 'moves', async (mark) => {
      const v = await api(tokenA, 'GET', '/api/games/' + gameId);
      if (!v.choice || !v.choice.isDivision) return false;

      // Confirm stays disabled until every point has been assigned.
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
    });

    await shot(d, '99-final');
    console.log(NL + 'final board: ' + JSON.stringify(await board(d)));
  } finally {
    await bot.stop();
    try {
      await d.quit();
    } catch {
      /* the results matter more than the browser */
    }

    console.log(NL + '--- what a real press did ---');
    steps.forEach((s) =>
      console.log('  ' + s.name.padEnd(22) + (s.expect + ':').padEnd(12) + s.result),
    );
    const failed = steps.filter((s) => s.result !== 'as expected');
    if (failed.length > 0) {
      console.log(NL + failed.length + ' of ' + steps.length + ' did not behave.');
      process.exitCode = 1;
    } else if (steps.length === 0) {
      console.log('nothing ran.');
      process.exitCode = 1;
    } else {
      console.log(NL + 'all ' + steps.length + ' behaved.');
    }
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
