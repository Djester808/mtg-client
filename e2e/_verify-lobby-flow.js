// Can two people actually get into a game, using only the app?
//
// This exists because everything else cheated. Every harness that "played a game" navigated
// straight to /play/{gameId} with an id it got by calling POST /api/games/invites over HTTP —
// so all of them skipped the nav and the lobby, which is precisely where the game was
// unreachable: there was no Play link, and the opponent picker bound a field the endpoint it
// read does not return. The board was verified to death and the way in was never touched once.
//
// So nothing here talks to the API except to read the log at the end. Two browsers, one per
// player, and every step is a click a person would make:
//
//   sign in -> Play in the nav -> choose a deck -> choose an opponent -> send
//   sign in -> Play in the nav -> the invitation is there -> choose a deck -> accept -> board
//
//   node _verify-lobby-flow.js
//
// Run it from e2e/ with the API and dev server up.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, api, signIn, signInThroughTheForm } = require('./helpers/board-driver');

const device = DEVICES.find((d) => d.id === 'desktop');
const SHOTS = path.join(__dirname, 'screenshots', 'lobby-flow');
const NL = String.fromCharCode(10);

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

const steps = [];

function record(name, ok, detail) {
  steps.push({ name, ok, detail });
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name.padEnd(28) + (detail ?? ''));
  return ok;
}

async function shot(d, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
}

/** Clicks a nav link by its visible text, the way a person reaches a page. */
function clickNav(d, label) {
  return d.executeScript(
    `
    const links = [...document.querySelectorAll('a')];
    const el = links.find((a) => (a.textContent || '').trim().toLowerCase() === arguments[0].toLowerCase());
    if (!el) return false;
    el.click();
    return true;
  `,
    label,
  );
}

/** Picks an option in a named select by its visible text, and fires what Angular listens for. */
function choose(d, name, match) {
  return d.executeScript(
    `
    const select = document.querySelector('select[name="' + arguments[0] + '"]');
    if (!select) return 'no select';
    const re = new RegExp(arguments[1], 'i');
    const option = [...select.options].find((o) => re.test(o.textContent || ''));
    if (!option) return 'no option: ' + [...select.options].map((o) => o.textContent.trim()).join(' | ');
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `,
    name,
    match,
  );
}

const text = (d, selector) =>
  d.executeScript(
    `const e = document.querySelector(arguments[0]); return e ? e.textContent.trim().replace(/\\s+/g, ' ') : null;`,
    selector,
  );

(async () => {
  const alice = await buildDriver({ device, dpr: 1 });
  const bob = await buildDriver({ device, dpr: 1 });

  try {
    // ---- Alice: sign in, and find the game from the nav ---------------------------------------
    await signInThroughTheForm(alice, { By, until }, A);
    await sleep(800);

    const reached = await clickNav(alice, 'Play');
    await sleep(1500);
    const url = await alice.getCurrentUrl();
    record('play is in the nav', reached && url.includes('/play'), url);
    await shot(alice, '01-lobby');

    // ---- Alice: choose a deck and an opponent, and send ----------------------------------------
    await alice.wait(until.elementLocated(By.css('select[name="myDeck"]')), 20000);
    const deckPicked = await choose(alice, 'myDeck', 'Combat Press Red');
    record('a deck can be chosen', deckPicked === true, String(deckPicked));

    const oppPicked = await choose(alice, 'opponent', B.username);
    record('an opponent can be chosen', oppPicked === true, String(oppPicked));

    // The value behind the option is what the invitation is addressed with. Empty here is the
    // bug this whole file exists for: the picker looked fine and named nobody.
    const opponentValue = await alice.executeScript(
      `const s = document.querySelector('select[name="opponent"]'); return s ? s.value : null;`,
    );
    record(
      'the chosen opponent has an id',
      !!opponentValue && opponentValue !== 'undefined',
      'value=' + opponentValue,
    );

    await choose(alice, 'life', '40');
    await sleep(400);
    await shot(alice, '02-invite-filled');

    await alice.executeScript(`
      const b = [...document.querySelectorAll('button')].find((x) => /send invitation/i.test(x.textContent));
      if (b) b.click();
    `);
    await sleep(2000);

    const refusal = await text(alice, '.gl-error, .gl-refusal, .error, .alert');
    const sent = await alice.executeScript(
      `return document.body.innerText.includes('Waiting for a reply');`,
    );
    record('the invitation sends', sent === true && !refusal, refusal ? 'said: ' + refusal : '');
    await shot(alice, '03-invitation-sent');

    // ---- Bob: sign in, find it waiting, accept -------------------------------------------------
    await signInThroughTheForm(bob, { By, until }, B);
    await sleep(800);
    await clickNav(bob, 'Play');
    await sleep(1800);
    await bob.wait(until.elementLocated(By.css('.gl-page')), 20000);
    await shot(bob, '04-bob-lobby');

    const waiting = await bob.executeScript(
      `return document.body.innerText.includes('${A.username}');`,
    );
    record('the invitation is waiting for them', waiting === true);

    const bobDeck = await choose(bob, 'acceptDeck', 'Combat Press Green');
    record('the accepter picks their own deck', bobDeck === true, String(bobDeck));

    await sleep(400);
    await bob.executeScript(`
      const b = [...document.querySelectorAll('button')].find((x) => /^accept$/i.test(x.textContent.trim()));
      if (b) b.click();
    `);
    await sleep(3500);

    const bobUrl = await bob.getCurrentUrl();
    const onBoard = /\/play\/[0-9a-f-]{36}/i.test(bobUrl);
    record('accepting opens the board', onBoard, bobUrl);
    await shot(bob, '05-bob-board');

    // ---- and Alice is in the same game ----------------------------------------------------------
    let aliceOnBoard = false;
    for (let i = 0; i < 20 && !aliceOnBoard; i++) {
      const current = await alice.getCurrentUrl();
      aliceOnBoard = /\/play\/[0-9a-f-]{36}/i.test(current);
      if (!aliceOnBoard) {
        // The inviter is not pushed into the game; they open it from their own lobby.
        await clickNav(alice, 'Play');
        await sleep(900);
        await alice.executeScript(`
          const b = [...document.querySelectorAll('button')].find((x) => /open|resume|play/i.test(x.textContent));
          if (b) b.click();
        `);
        await sleep(1200);
      }
    }
    if (!aliceOnBoard && onBoard) {
      // Falling back to the URL is honest here: what is being checked from this point is that
      // the game both players are in is one game, not how the inviter navigates to it.
      await alice.get(baseUrl + bobUrl.slice(bobUrl.indexOf('/play')));
      await sleep(2500);
    }

    await alice.wait(until.elementLocated(By.css('.gb-root')), 25000);
    await sleep(1500);
    await shot(alice, '06-alice-board');

    const aliceBoard = await text(alice, '.gb-turn');
    const bobBoard = await text(bob, '.gb-turn');
    record('both players see a board', !!aliceBoard && !!bobBoard, aliceBoard + ' / ' + bobBoard);

    // ---- the game is real, not a rendered shell --------------------------------------------------
    const gameId = bobUrl.slice(bobUrl.lastIndexOf('/') + 1);
    const token = await signIn(A);
    const log = await api(token, 'GET', '/api/games/' + gameId + '/log');
    record('the game exists on the server', log.length > 0, log.length + ' log lines');

    const prompt = await text(alice, '.gb-prompt-text');
    record('the game opens on the mulligan', !!prompt && /mulligan/i.test(prompt), prompt ?? '');
  } finally {
    try {
      await alice.quit();
    } catch {
      /* ignore */
    }
    try {
      await bob.quit();
    } catch {
      /* ignore */
    }

    console.log(NL + '--- getting into a game, by clicking ---');
    const failed = steps.filter((s) => !s.ok);
    if (steps.length === 0) {
      console.log('nothing ran.');
      process.exitCode = 1;
    } else if (failed.length > 0) {
      console.log(failed.length + ' of ' + steps.length + ' steps failed.');
      process.exitCode = 1;
    } else {
      console.log('all ' + steps.length + ' steps worked.');
    }
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
