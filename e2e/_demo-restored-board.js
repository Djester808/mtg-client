// Walks the restored board in a visible browser, slowly, so it can be watched rather than
// described.
//
//   HEADLESS=false node _demo-restored-board.js <gameId>
//
// Each step prints what it did and what the screen said back, so the log and the window agree.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const BEAT = 2400;

const say = (label, value) => console.log('  ' + label.padEnd(22) + value);

/** Presses and holds, the way a thumb does. */
const hold = (d, selector, ms = 700) =>
  d.executeAsyncScript(
    `const [selector, ms, done] = arguments;
     const el = document.querySelector(selector);
     if (!el) return done(false);
     el.scrollIntoView({ block: 'center' });
     el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
     setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); done(true); }, ms);`,
    selector,
    ms,
  );

const read = (d, script) => d.executeScript('return (function(){' + script + '})();');

(async () => {
  const gameId = process.argv[2];
  if (!gameId) throw new Error('pass a game id (see _make-a-game.js)');

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    console.log('\nsigning in as ' + A.username + ' and opening the game...\n');
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(BEAT);

    // ---- what is on screen ---------------------------------------------------------------
    const opened = await read(
      d,
      `
      const names = (sel) => [...document.querySelectorAll(sel + ' .card-name')].map(n => n.textContent.trim());
      const halves = document.querySelectorAll('app-zones');
      return {
        turn: document.querySelector('.turn-badge').textContent.trim().replace(/[ ]+/g, ' '),
        step: document.querySelector('.status-message')?.textContent.trim(),
        priority: document.querySelector('app-priority-indicator .label').textContent.trim(),
        theirCreatures: [...halves[0].querySelectorAll('.permanents-row .card-name')].map(n => n.textContent.trim()),
        theirLands: [...halves[0].querySelectorAll('.lands-row .card-name')].map(n => n.textContent.trim()),
        myCreatures: [...halves[1].querySelectorAll('.permanents-row .card-name')].map(n => n.textContent.trim()),
        myLands: [...halves[1].querySelectorAll('.lands-row .card-name')].map(n => n.textContent.trim()),
        art: document.querySelectorAll('app-zones .card-img').length,
      };
    `,
    );
    console.log('the board is open');
    say('where the game is', opened.turn + '  ' + opened.step + '  (' + opened.priority + ')');
    say('their creatures', JSON.stringify(opened.theirCreatures));
    say('their lands', JSON.stringify(opened.theirLands));
    say('my creatures', JSON.stringify(opened.myCreatures));
    say('my lands', JSON.stringify(opened.myLands));
    say('card art on screen', opened.art + ' images\n');
    await sleep(BEAT);

    // ---- hold a card to read it ------------------------------------------------------------
    console.log('holding one of their creatures to read it...');
    await hold(d, 'app-zones .permanents-row app-card .card');
    await sleep(1200);
    say(
      'the card came up',
      (await read(
        d,
        `
      const i = document.querySelector('.card-preview-panel .preview-img'); const n = document.querySelector('.ps-name'); return i || n ? (n ? n.textContent.trim() : i.alt) : 'NOTHING';`,
      )) + '\n',
    );
    await sleep(BEAT + 1200);
    await d.executeScript(`document.querySelector('.preview-close-btn').click();`);
    await sleep(BEAT);

    // ---- the opponent's graveyard, which the rules allow anyone to look through -------------
    console.log("opening the opponent's graveyard (CR 404.2)...");
    await d.executeScript(
      `document.querySelectorAll('app-player-sidebar')[0].querySelector('button.zone-row.grave').click();`,
    );
    await sleep(1200);
    say(
      'it says',
      (await read(
        d,
        `
      const h = document.querySelector('.viewer-title');
      const cards = [...document.querySelectorAll('.viewer-card-name')].map(c => c.textContent.trim());
      return h ? h.textContent.trim() + ' -> ' + JSON.stringify(cards) : 'NOTHING';`,
      )) + '\n',
    );
    await sleep(BEAT + 1500);
    await d.executeScript(`document.querySelector('.viewer-close').click();`);
    await sleep(BEAT);

    // ---- tapping a land puts mana in the pool ----------------------------------------------
    console.log('tapping an untapped land for mana (CR 106.4)...');
    const before = await read(
      d,
      `
      const p = document.querySelectorAll('app-player-sidebar')[1];
      return [...p.querySelectorAll('.mana-pip')].map(n => n.textContent.trim()).join(' ') || 'empty';`,
    );
    say('pool before', before);
    const tapped = await read(
      d,
      `
      const mine = document.querySelectorAll('app-zones')[1];
      const land = [...mine.querySelectorAll('.lands-row app-card')].find(c => !c.classList.contains('is-tapped'));
      if (!land) return 'every land is already tapped';
      const name = land.querySelector('.card-name').textContent.trim();
      land.querySelector('.card').click();
      return name;`,
    );
    say('tapped', tapped);
    await sleep(2000);
    say(
      'pool after',
      (await read(
        d,
        `
      const p = document.querySelectorAll('app-player-sidebar')[1];
      return [...p.querySelectorAll('.mana-pip')].map(n => n.textContent.trim()).join(' ') || 'empty';`,
      )) + '\n',
    );
    await sleep(BEAT);

    // ---- and it is still a game -------------------------------------------------------------
    console.log('passing priority (CR 117.1)...');
    // Reported honestly: the button is only offered to the player who may act, so a run where
    // it is absent has to say so rather than silently pressing nothing and calling it a pass.
    say(
      'the button',
      await read(
        d,
        `const b = document.querySelector('.status-actions .action-btn.pass');
         if (b) { b.click(); return 'pressed it'; }
         const w = document.querySelector('.status-message');
         return 'not offered - the bar says ' + (w ? JSON.stringify(w.textContent.trim()) : '(nothing)');`,
      ),
    );
    await sleep(2200);
    say(
      'now',
      await read(
        d,
        `
      return document.querySelector('.status-message')?.textContent.trim() + '  (' +
        document.querySelector('app-priority-indicator .label').textContent.trim() + ')';`,
      ),
    );
    say(
      'the server said',
      (await read(
        d,
        `
      const r = document.querySelector('.gb-refusal');
      return r ? r.textContent.trim() : 'nothing - it was not asked for anything it would refuse';`,
      )) + '\n',
    );

    console.log('leaving the window open for a look...');
    await sleep(20000);
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
