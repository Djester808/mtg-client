// Opens the restored original board on a real game and photographs it.
//
//   node _shot-original-board.js <gameId> [width] [height]
//
// Nothing is stubbed. The board joins through GameApiService.joinGame and SignalRService, both
// of which now speak to MtgEngine.Rules through GameViewAdapter — so what is on screen is the
// original UI drawing a live game from the rebuilt engine.
//
// The one thing seeded is `mtg_session`, which the board's ngOnInit guards on. The original
// lobby wrote it after creating a game; games are made from invitations now, so the way in is
// the current lobby and this stands in for it.
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const SHOTS = path.join(__dirname, 'screenshots', 'original-board');

(async () => {
  const gameId = process.argv[2];
  if (!gameId) throw new Error('pass a game id (see _make-a-game.js)');
  const width = Number(process.argv[3] || 1600);
  const height = Number(process.argv[4] || 1100);

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.manage().window().setRect({ width, height });
    await signInThroughTheForm(d, { By, until }, A);
    fs.mkdirSync(SHOTS, { recursive: true });

    await d.get(baseUrl + '/lobby');
    await sleep(1500);
    fs.writeFileSync(path.join(SHOTS, 'lobby.png'), await d.takeScreenshot(), 'base64');
    console.log('shot: lobby');

    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const board = await d.executeScript(
      [
        'var text = function (s) { var el = document.querySelector(s); return el ? el.textContent.trim().replace(/\\s+/g, " ") : null; };',
        'var names = function (s) { return [].slice.call(document.querySelectorAll(s)).map(function (n) { return n.textContent.trim(); }); };',
        'var fields = document.querySelectorAll(".battlefield");',
        'return {',
        '  url: location.pathname,',
        '  turn: text(".turn-badge"),',
        '  status: text(".status-message"),',
        '  cards: document.querySelectorAll("app-card").length,',
        '  art: document.querySelectorAll("app-card img").length,',
        '  theirs: fields[0] ? names("app-zones .permanents-row .card-name").slice(0, 4) : [],',
        '  hand: document.querySelectorAll(".hand-card-wrapper").length,',
        '  life: names(".life-number"),',
        '  mana: names(".mana-pip-icon").length,',
        '  zones: names(".zone-row .zone-num"),',
        '  phasePips: document.querySelectorAll(".phase-pip").length,',
        '  activePip: text(".phase-pip.active .pip-label"),',
        '};',
      ].join(''),
    );
    console.log('board: ' + JSON.stringify(board, null, 2));

    fs.writeFileSync(path.join(SHOTS, 'board.png'), await d.takeScreenshot(), 'base64');
    console.log('shot: board');

    const logs = await d.manage().logs().get('browser');
    const rules = logs.filter((l) => /\[rules\]|SignalR|GameHub/.test(String(l.message)));
    if (rules.length) {
      console.log('rules messages:');
      for (const entry of rules.slice(-6)) {
        console.log('  ' + String(entry.message).slice(0, 200));
      }
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
