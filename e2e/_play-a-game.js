// Two people play a game of Magic in two browsers, by clicking.
//
// Nothing here is driven over the wire. Both seats are real Chrome windows signed in through
// the login form, and every land, spell, attack and block is a click on the board. The server is
// asked one question, at the end, and only to read the log back.
//
// It reads the step off the screen — the lit phase pip — rather than asking the API where the
// game is. Every earlier harness had to ask, because the board did not say; that it can be
// played from what is rendered is the point.
//
//   node _play-a-game.js [turns]
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
  board,
  clickIn,
  clickPermanent,
  playFromHand,
  tapLands,
  signInThroughTheForm,
} = require('./helpers/board-driver');

const device = DEVICES.find((d) => d.id === 'desktop');
const SHOTS = path.join(__dirname, 'screenshots', 'played-game');
const NL = String.fromCharCode(10);
const TURNS = Number(process.argv[2] || 6);

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };

const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

const did = { lands: 0, spells: 0, attacks: 0, blocks: 0, choices: 0, passes: 0 };

async function shot(d, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
}

/**
 * Does the one thing this player can do right now, reading only the screen.
 *
 * Written the way a person plays rather than as a script of moves: look at the board, see what
 * it is offering, press that. It never asks the server anything, so if the board does not say
 * enough to play from, this stalls — which is the honest outcome and was true until the step
 * label went on screen.
 */
async function act(d, who, username) {
  const s = await board(d);
  if (!s.ready) return null;

  // Every button the board is offering, minus the one that ends the game. Concede is always
  // there, so anything that picks "the first button" has to exclude it by name.
  const offered = s.buttons.filter((t) => !/concede/i.test(t));

  // A question stops everything until it is answered. Ordering and division questions want
  // several picks and light their Confirm only when they have them.
  //
  // A question is recognised by the class its buttons carry, not by what the status bar says.
  // Reading the prose had this matching /keep/ against "Upkeep", so every upkeep looked like a
  // mulligan question and the answer loop hammered Pass Priority until the tab crashed.
  const needsConfirm = offered.some((t) => /^confirm/i.test(t));
  const asking = await d.executeScript(
    `return document.querySelectorAll('.status-actions .action-btn.choice').length;`,
  );

  if (asking > 0) {
    for (let i = 0; i < 14; i++) {
      // An un-picked option first, and failing that any option at all. Dividing damage is one
      // pick per point (CR 510.1c) and every point can go to the same creature, so a loop that
      // refuses to press an already-picked button can never fill the last few in — it waits for
      // a Confirm that will not light, and the game stops there.
      const picked = await d.executeScript(`
        const buttons = [...document.querySelectorAll('.status-actions .action-btn.choice')]
          .filter((b) => !b.disabled);
        const pick = buttons.find((b) => !b.classList.contains('is-picked')) || buttons[0];
        if (!pick) return false;
        pick.click();
        return true;
      `);
      if (!picked) break;
      await sleep(200);

      const ready = await d.executeScript(`
        const b = [...document.querySelectorAll('.status-actions .action-btn')]
          .find((x) => /^confirm/i.test(x.textContent.trim()));
        return b ? !b.disabled : 'none';
      `);
      if (ready === 'none' || ready === true) break;
    }

    if (needsConfirm) await clickIn(d, '.status-actions .action-btn', '^confirm');
    did.choices++;
    return who + ' answered: ' + (s.status || '').slice(0, 46);
  }

  // Combat is declared before anyone has priority (CR 508.1, 509.1), so the board offers a
  // declare button and no Pass at all. Which means declaring is not optional here: a player
  // with nothing to attack with still has to say so, and cancelling out instead was a loop
  // that held the game on turn 1 for as long as it ran.
  if (offered.some((t) => /declare attackers/i.test(t))) {
    await clickIn(d, '.status-actions .action-btn', 'declare attackers');
    await sleep(350);

    // Every untapped creature is offered, not the first one: a creature that arrived this turn
    // is refused with a toast and nothing else happens, so picking one and confirming declared
    // an attack with nobody in it. Three of those were counted as attacks while the log said
    // "0 creature(s) attack" and neither life total moved.
    await d.executeScript(`
      for (const el of document.querySelectorAll('.self-field .permanents-row .card')) {
        if (!el.classList.contains('tapped')) el.click();
      }
    `);
    await sleep(400);

    // The board's own count of who is going: the class it puts on a creature it has taken as an
    // attacker. Reading the number out of the Confirm button's label instead reported zero for
    // attacks that plainly happened — the life totals moved and the blocks came in, and the
    // summary still said "attacks declared 0", which is the sort of number that gets believed.
    const declared = await d.executeScript(
      `return document.querySelectorAll('.self-field .card.pending-attacker').length;`,
    );

    await clickIn(d, '.status-actions .action-btn', '^confirm');
    if (declared > 0) {
      did.attacks++;
      return who + ' attacks with ' + declared;
    }
    return null;
  }

  if (offered.some((t) => /declare blockers/i.test(t))) {
    await clickIn(d, '.status-actions .action-btn', 'declare blockers');
    await sleep(350);

    let blocked = false;
    if (s.incoming > 0 && s.myReadyCreatures > 0) {
      const pointed = await clickIn(d, '.opponent-field .card.attacking');
      if (pointed) {
        await sleep(300);
        blocked = await d.executeScript(`
          const els = [...document.querySelectorAll('.self-field .permanents-row .card')];
          const el = els.find((e) => !e.classList.contains('tapped'));
          if (!el) return false;
          el.click();
          return true;
        `);
        await sleep(300);
      }
    }

    await clickIn(d, '.status-actions .action-btn', 'confirm blockers');
    if (blocked) {
      did.blocks++;
      return who + ' blocks';
    }
    return null;
  }

  // Its own main phase: a land, then a creature if the mana is there.
  //
  // Two things the board says that a reader has to be told: the turn badge names the *account*
  // ("restart-check-a"), not the label this harness prints, and the phase pips are abbreviated -
  // the main phases are "M1" and "M2", so matching /main/ finds neither and every main phase
  // went by without a land being played.
  const mine = (s.whose || '').toLowerCase() === (username || '').toLowerCase();
  if (mine && /^M\d/i.test(s.step || '')) {
    const before = s.mine.length;

    const land = s.hand.find((n) => n === 'Mountain' || n === 'Forest');
    if (land && (await playFromHand(d, land))) {
      await sleep(700);
      if ((await board(d)).mine.length > before) {
        did.lands++;
        return who + ' plays a ' + land;
      }
    }

    const creature = s.hand.find((n) => n === 'Goblin Piker' || n === 'Grizzly Bears');
    if (creature && s.untappedLands >= 2) {
      await tapLands(d);
      if (await playFromHand(d, creature)) {
        await sleep(500);

        // Pass straight away. A spell resolves when every player passes in succession (CR 608.1),
        // and a caster who goes looking for its second play instead simply casts again - which is
        // what happened: two Goblin Pikers went on the stack in one main phase and neither ever
        // came off it, so five turns were played with an empty battlefield.
        await clickIn(d, '.status-actions .action-btn', 'pass priority');
        did.passes++;

        // Whether it resolved is not knowable here — the other player does not act until the
        // next turn of the loop outside. The battlefield is watched there instead.
        return who + ' casts ' + creature;
      }
    }
  }

  if (offered.some((t) => /pass priority/i.test(t))) {
    await clickIn(d, '.status-actions .action-btn', 'pass priority');
    did.passes++;
    return null; // passing is the background noise of a game; not worth a line each
  }

  return null;
}

(async () => {
  // The game is made the way the lobby makes one; the playing is what this file is about.
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Played Game Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Played Game Green', DECK_B);
  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;
  console.log('game: ' + gameId + NL);

  const alice = await buildDriver({ device, dpr: 1 });
  const bob = await buildDriver({ device, dpr: 1 });

  try {
    for (const [d, who] of [
      [alice, A],
      [bob, B],
    ]) {
      await signInThroughTheForm(d, { By, until }, who);
      await d.get(baseUrl + '/game/' + gameId);
      await d.wait(until.elementLocated(By.css('.board')), 25000);
    }
    await sleep(2000);
    console.log('both players are looking at the board' + NL);

    let turn = 0;
    const creaturesSeen = { Alice: 0, Bob: 0 };
    const seats = { Alice: A.username, Bob: B.username };

    for (let i = 0; i < 900 && turn < TURNS; i++) {
      for (const [d, who] of [
        [alice, 'Alice'],
        [bob, 'Bob'],
      ]) {
        const said = await act(d, who, seats[who]);
        if (said) console.log('  ' + said);
      }

      // A spell is counted when the creature is on the battlefield, which is the only moment
      // either browser can see that it resolved.
      for (const [d, who] of [
        [alice, 'Alice'],
        [bob, 'Bob'],
      ]) {
        const view = await board(d);
        const creatures = view.mine.filter((n) => /Goblin Piker|Grizzly Bears/.test(n)).length;
        if (creatures > creaturesSeen[who]) {
          did.spells += creatures - creaturesSeen[who];
          console.log('  ' + who + "'s creature resolves");
          creaturesSeen[who] = creatures;
        } else if (creatures < creaturesSeen[who]) {
          console.log('  ' + who + ' lost a creature');
          creaturesSeen[who] = creatures;
        }
      }

      const s = await board(alice);
      const now = s.turn || 0;
      if (now > turn) {
        turn = now;
        console.log(
          '  -- turn ' + turn + ' (' + (s.step || '?') + ', life ' + s.myLife + ' v ' + s.theirLife + ')',
        );
        await shot(alice, 'turn-' + String(turn).padStart(2, '0'));
      }
      await sleep(120);
    }

    await shot(alice, 'zz-alice-final');
    await shot(bob, 'zz-bob-final');

    const final = await board(alice);
    const log = await api(tokenA, 'GET', '/api/games/' + gameId + '/log');

    console.log(NL + '--- what happened, all of it by clicking ---');
    console.log('  turns played      ' + turn);
    console.log('  lands played      ' + did.lands);
    console.log('  spells cast       ' + did.spells);
    console.log('  attacks declared  ' + did.attacks);
    console.log('  blocks declared   ' + did.blocks);
    console.log('  questions answered' + ' ' + did.choices);
    console.log('  priority passes   ' + did.passes);
    console.log('  life              ' + final.myLife + ' v ' + final.theirLife);
    console.log('  board             ' + JSON.stringify(final.mine));
    console.log('  log lines         ' + log.length);

    const played = turn >= 2 && did.lands > 0 && did.spells > 0 && log.length > 50;
    console.log(NL + (played ? 'a game was played.' : 'THE GAME DID NOT GET GOING'));
    if (!played) process.exitCode = 1;
  } finally {
    for (const d of [alice, bob]) {
      try {
        await d.quit();
      } catch {
        /* the report matters more than the browser */
      }
    }
  }
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
