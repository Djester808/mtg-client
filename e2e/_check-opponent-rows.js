// Which way round the opponent's half of the table is drawn.
//
//   node _check-opponent-rows.js <gameId>
//
// A board is read across a table: each player's lands sit behind their creatures, so the two
// halves are mirror images and the creatures meet in the middle. Drawn with the same row order
// on both sides, the opponent's lands end up between their creatures and yours — which is what
// "their lands are in front of their creatures" means, and it is a measurement, not an opinion.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

const rows = (d) =>
  d.executeScript(
    [
      'var half = function (sel) {',
      '  var root = document.querySelector(sel);',
      '  if (!root) return null;',
      '  var box = function (s) {',
      '    var el = root.querySelector(s);',
      '    if (!el) return null;',
      '    var cards = el.querySelectorAll("app-card");',
      '    if (!cards.length) return null;',
      '    var r = el.getBoundingClientRect();',
      '    return { top: Math.round(r.top), cards: cards.length };',
      '  };',
      '  return { lands: box(".lands-row"), perms: box(".permanents-row") };',
      '};',
      'return { them: half(".opponent-field"), me: half(".self-field") };',
    ].join(''),
  );

(async () => {
  const gameId = process.argv[2];
  if (!gameId) throw new Error('usage: node _check-opponent-rows.js <gameId>');

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log('  ' + (ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(52) + (detail ?? ''));
  };

  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const r = await rows(d);
    console.log('  measured: ' + JSON.stringify(r));

    if (!r.them || !r.them.lands || !r.them.perms) {
      check(
        'the opponent has both a land and a creature to compare',
        false,
        JSON.stringify(r.them),
      );
    } else {
      check(
        'the opponent lands sit behind their creatures (further from the middle)',
        r.them.lands.top < r.them.perms.top,
        'lands y=' + r.them.lands.top + ', creatures y=' + r.them.perms.top,
      );
    }

    if (r.me && r.me.lands && r.me.perms) {
      check(
        'and your own lands sit in front of yours, nearest you',
        r.me.lands.top > r.me.perms.top,
        'lands y=' + r.me.lands.top + ', creatures y=' + r.me.perms.top,
      );
    }

    await d
      .takeScreenshot()
      .then((png) =>
        require('fs').writeFileSync(process.argv[3] || 'opponent-rows.png', png, 'base64'),
      );
    console.log('  shot: ' + (process.argv[3] || 'opponent-rows.png'));
  } finally {
    await d.quit();
  }

  process.exitCode = results.every(Boolean) ? 0 : 1;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e).slice(0, 600));
  process.exitCode = 1;
});
