// Photographs the restored board at both sizes, for a claim about how it looks that can be
// looked at rather than believed.
//
//   node _shot-restored-board.js <gameId> [device...]
//
// It opens an existing game as a person — through the sign-in form — and captures the board,
// then the pieces the restore was about: a graveyard opened from a player panel, and a card
// being read.
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const SHOTS = path.join(__dirname, 'screenshots', 'restored-board');

const shoot = async (d, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), await d.takeScreenshot(), 'base64');
  console.log('    shot: ' + name);
};

(async () => {
  const gameId = process.argv[2];
  if (!gameId) throw new Error('pass a game id');
  const wanted = process.argv.slice(3);
  const devices = DEVICES.filter((x) => (wanted.length ? wanted.includes(x.id) : true));

  for (const device of devices) {
    const d = await buildDriver({ device, dpr: 1 });
    try {
      console.log('  ' + device.id + ' (' + device.width + '×' + device.height + ')');
      await signInThroughTheForm(d, { By, until }, A);
      await d.get(baseUrl + '/play/' + gameId);
      await d.wait(until.elementLocated(By.css('.board')), 25000);
      await sleep(1800);

      // What the board is actually showing, read off the DOM rather than guessed.
      const state = await d.executeScript(`
        const text = (s, r) => Array.from((r || document).querySelectorAll(s))
          .map(n => n.textContent.trim()).filter(Boolean);
        const halves = document.querySelectorAll('app-zones');
        const row = (half, sel) => half ? text(sel + ' .card-name', half) : [];
        return {
          overflows: document.documentElement.scrollWidth > window.innerWidth,
          theirCreatures: row(halves[0], '.permanents-row'),
          theirLands: row(halves[0], '.lands-row'),
          myCreatures: row(halves[1], '.permanents-row'),
          myLands: row(halves[1], '.lands-row'),
          art: document.querySelectorAll('app-zones .card-img').length,
          // A permanent you cannot read is a permanent you cannot play around.
          cutNames: [...document.querySelectorAll('app-zones .card-name')]
            .filter((n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1)
            .map((n) => n.textContent.trim()),
          panels: Array.from(document.querySelectorAll('app-player-sidebar')).map(p => ({
            who: p.querySelector('.pn-text')?.textContent.trim(),
            life: p.querySelector('.life-number')?.textContent.trim(),
            mana: text('.mana-pip', p).join(' ') || (p.querySelector('.mana-empty') ? 'empty' : '?'),
            zones: text('.zone-row', p).map(s => s.replace(/\s+/g, ' ')),
          })),
          turn: document.querySelector('.turn-badge')?.textContent.trim().replace(/\s+/g, ' '),
          pips: Array.from(document.querySelectorAll('.phase-pip'))
            .map(p => p.textContent.trim() + (p.classList.contains('active') ? '*' : '')).join(' '),
          priority: document.querySelector('app-priority-indicator')?.textContent.trim(),
          hand: document.querySelectorAll('app-hand app-card').length,
          arrows: document.querySelectorAll('app-attack-arrows path').length,
        };
      `);
      console.log('    ' + JSON.stringify(state, null, 2).split('\n').join('\n    '));
      await shoot(d, device.id + '-1-board');

      // A player panel opens a graveyard.
      const opened = await d.executeScript(`
        const btn = document.querySelector('app-player-sidebar button.zone-row.grave');
        if (!btn) return 'no graveyard button';
        btn.click();
        return true;
      `);
      await sleep(900);
      console.log('    graveyard: ' + (await d.executeScript(
        `const h = document.querySelector('.viewer-title'); const n = document.querySelectorAll('.viewer-card-slot').length; return h ? h.textContent.trim() + ' -> ' + n + ' card(s)' : String(${JSON.stringify(opened)});`,
      )));
      await shoot(d, device.id + '-2-graveyard');
      await d.executeScript(`document.querySelector('.viewer-close')?.click();`);
      await sleep(600);

      // Holding a card reads it.
      await d.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        const el = document.querySelector('app-zones .card');
        if (!el) return done(false);
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); done(true); }, 700);
      `);
      await sleep(900);
      console.log('    reading: ' + (await d.executeScript(
        `const i = document.querySelector('.gb-inspect img'); return i ? i.getAttribute('alt') : 'nothing came up';`,
      )));
      await shoot(d, device.id + '-3-reading');
    } finally {
      await d.quit();
    }
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
