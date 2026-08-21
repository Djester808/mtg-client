// The three combat controls the other harness could never reach, pressed for real.
//
// The difference here is what does the waiting. Driving a whole game through the browser meant
// hundreds of Selenium round trips to reach one window, and the runs were still going when the
// machine reclaimed them — so the presses under test were never reached, which reads exactly
// like a broken button and is not one.
//
// So the game is arranged over the wire, from both seats, and the browser is used only for the
// presses being verified. Both seats act when this script says so and never on a timer, which is
// what makes a window stay open: the engine waits at declare-blockers for the defending player,
// and nothing else here is going to answer for them.
//
// Passing priority and playing lands go over the wire on purpose. They are not what this file
// verifies — _verify-board-actions.js already presses both — and doing them by click only buys
// minutes of wall clock.
//
//   node _verify-combat-press.js
//
// Run it from e2e/ with the API and dev server up.

const fs = require('fs');
const path = require('path');
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
  signInThroughTheForm,
  seat,
} = require('./helpers/board-driver');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const SHOTS = path.join(__dirname, 'screenshots', 'combat-press');
const NL = String.fromCharCode(10);

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

// Mono-coloured decks, so the land drawn is never the wrong one for the spell held.
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);
const MINE = 'Goblin Piker';
const THEIRS = 'Grizzly Bears';

const steps = [];

async function shot(d, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
}

/** Runs one press and records whether it did what the step said it would. */
async function press(d, token, gameId, name, expect, fn) {
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

  await sleep(1200);
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

  // Both seats on the wire. The browser joins as a third connection for the same player as
  // `alice`, which the hub is happy with — it authorises by token, and a player watching their
  // own game from two places is not a rules question.
  const alice = await seat(tokenA, gameId);
  const bob = await seat(tokenB, gameId);
  const who = (id) => (id === alice.id ? alice : bob);

  const d = await buildDriver({ device, dpr: 1 });

  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(2000);
    console.log('board open as ' + A.username);

    /**
     * Moves the game over the wire until `stop` is true.
     *
     * `hold` names the one thing this will not do for itself, because it is about to be done by
     * hand in the browser.
     */
    async function drive(
      stop,
      { hold = null, attackWith = 0, blockWith = 0, develop = null } = {},
    ) {
      for (let i = 0; i < 400; i++) {
        const v = await alice.refresh();
        if (stop(v)) return v;

        if (v.choice) {
          if (hold === 'choice' && v.choice.playerId === alice.id) return v;
          await who(v.choice.playerId).answerChoice();
          continue;
        }

        if (v.currentStep === 'DeclareAttackers' && !v.attackersDeclared) {
          if (hold === 'attack' && v.activePlayerId === alice.id) return v;
          await who(v.activePlayerId).attack(attackWith);
          continue;
        }

        if (v.currentStep === 'DeclareBlockers' && !v.blockersDeclared) {
          const defender = v.activePlayerId === alice.id ? bob : alice;
          if (hold === 'block' && defender.id === alice.id) return v;
          await defender.block(blockWith);
          continue;
        }

        if (develop) await develop(v);

        // The active player has priority first (CR 117.3a), so it passes first.
        await who(v.activePlayerId).pass();
        await (v.activePlayerId === alice.id ? bob : alice).pass();
      }
      return null;
    }

    /** A land and, when it can, a creature — for whichever seat is in its own main phase. */
    const developBoth = async (v) => {
      if (v.currentStep !== 'PrecombatMain') return;
      const active = who(v.activePlayerId);
      const isAlice = active.id === alice.id;
      await active.playLand(isAlice ? /Mountain/ : /Forest/);
      await active.cast(isAlice ? MINE : THEIRS, isAlice ? /Mountain/ : /Forest/, 2);
    };

    const creaturesOf = (v, id) =>
      v.battlefield.filter((c) => c.controllerId === id && c.isCreature).length;

    // ---- give both sides a board ---------------------------------------------------------------
    const built = await drive((v) => creaturesOf(v, alice.id) >= 1 && creaturesOf(v, bob.id) >= 2, {
      develop: developBoth,
    });
    console.log(
      'boards built: ' +
        (built
          ? 'mine=' + creaturesOf(built, alice.id) + ' theirs=' + creaturesOf(built, bob.id)
          : 'no') +
        NL,
    );

    // ---- blocking, by hand ----------------------------------------------------------------------
    await press(d, tokenA, gameId, 'declare-blockers', 'moves', async (mark) => {
      // The opponent attacks with one, and then the game waits for this player. Nothing else
      // here will answer for them, so the window stays open for as long as the press takes.
      const at = await drive(
        (v) =>
          v.currentStep === 'DeclareBlockers' && !v.blockersDeclared && v.activePlayerId === bob.id,
        { hold: 'block', attackWith: 1, develop: developBoth },
      );
      if (!at) return false;

      await sleep(900);
      const s = await board(d);
      if (s.attacking === 0 || !s.mine.includes(MINE)) return false;

      // Point at the attacker, then assign a blocker to it (CR 509.1a).
      if (!(await clickIn(d, '.gb-field-half:first-child .gb-permanent.is-attacking')))
        return false;
      await sleep(500);
      if (!(await clickPermanent(d, 'mine', MINE))) return false;
      await sleep(500);
      await mark();
      return clickIn(d, '.gb-btn-primary', 'block with [1-9]');
    });

    // ---- dividing damage between two blockers, by hand -------------------------------------------
    await press(d, tokenA, gameId, 'division-start-over', 'no-change', async (mark) => {
      // This player attacks and the opponent blocks with two, which is what makes the game ask
      // for a division (CR 510.1c) — the only route to Confirm and Start over.
      const asked = await drive(
        (v) => !!v.choice && v.choice.playerId === alice.id && v.choice.isDivision,
        { hold: 'choice', attackWith: 1, blockWith: 2, develop: developBoth },
      );
      if (!asked || !asked.choice || !asked.choice.isDivision) return false;

      await sleep(900);
      await clickInExcept(d, '.gb-prompt-actions .gb-btn', 'confirm|start over');
      await sleep(400);
      await mark();
      return clickIn(d, '.gb-prompt-actions .gb-btn', 'start over');
    });

    await press(d, tokenA, gameId, 'division-confirm', 'moves', async (mark) => {
      const v = await alice.refresh();
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
    await alice.stop();
    await bob.stop();
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
    if (steps.length === 0) {
      console.log('nothing ran.');
      process.exitCode = 1;
    } else if (failed.length > 0) {
      console.log(NL + failed.length + ' of ' + steps.length + ' did not behave.');
      process.exitCode = 1;
    } else {
      console.log(NL + 'all ' + steps.length + ' behaved.');
    }
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
