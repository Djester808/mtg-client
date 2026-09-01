// Do battlefield cards actually overlap, or does the art just read that way?
//
//   node _diag-card-overlap.js <gameId>
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const deviceId = process.argv[3] || 'desktop';
  const device = DEVICES.find((x) => x.id === deviceId);
  if (!device) throw new Error('unknown device ' + deviceId);
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const report = await d.executeScript(
      [
        'var out = { device: "' + deviceId + '" };',
        'out.width = window.innerWidth;',
        'out.docOverflows = document.documentElement.scrollWidth > window.innerWidth;',
        'var row = document.querySelector(".opponent-field .permanents-row");',
        'if (!row) return out;',
        'var boxes = [].slice.call(row.querySelectorAll("app-card")).map(function (c) {',
        '  var r = c.getBoundingClientRect();',
        '  return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width) };',
        '});',
        'out.count = boxes.length;',
        'out.widths = boxes.map(function (b) { return b.w; });',
        'out.rowsUsed = boxes.map(function (b) { return b.t; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;',
        // an overlap is two cards on the same visual row whose boxes intersect
        'var overlaps = 0;',
        'for (var i = 0; i < boxes.length; i++) {',
        '  for (var j = i + 1; j < boxes.length; j++) {',
        '    if (boxes[i].t === boxes[j].t && boxes[i].l < boxes[j].r && boxes[j].l < boxes[i].r) overlaps++;',
        '  }',
        '}',
        'out.overlappingPairs = overlaps;',
        'out.rowRight = Math.round(row.getBoundingClientRect().right);',
        'out.lastCardRight = boxes.length ? boxes[boxes.length - 1].r : null;',
        'out.clippedPastRow = boxes.filter(function (b) { return b.r > Math.round(row.getBoundingClientRect().right) + 1; }).length;',
        'return out;',
      ].join(''),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e).slice(0, 500));
  process.exitCode = 1;
});
