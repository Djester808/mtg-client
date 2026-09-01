// The game board at phone size (mtg-client/CLAUDE.md, "Mobile is the baseline").
//
//   node _check-board-phone.js <gameId> [device] [out.png]
//
// The board was restored from a commit that predated the mobile standard and had no phone
// layout at all: a three-column grid asking for 400px of fixed side columns on a 375px screen,
// with `overflow: hidden` swallowing the evidence. Every claim here is a measurement, because
// the failure mode is a layout that looks plausible in a screenshot and is clipped underneath.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

const measure = (d) =>
  d.executeScript(
    [
      'var box = function (sel) {',
      '  var el = document.querySelector(sel);',
      '  if (!el) return null;',
      '  var r = el.getBoundingClientRect();',
      '  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };',
      '};',
      'var out = {',
      '  width: window.innerWidth,',
      '  height: window.innerHeight,',
      '  docWidth: document.documentElement.scrollWidth,',
      '  board: box(".board"),',
      '  theirField: box(".opponent-field"),',
      '  myField: box(".self-field"),',
      '  theirBar: box(".opponent-sidebar"),',
      '  myBar: box(".self-sidebar"),',
      '  status: box(".status-bar"),',
      '  hand: box(".hand-row"),',
      '};',
      // Anything painted wider than the viewport, or hanging off either edge.
      // Content inside a container that pans is meant to extend past it — that is what
      // scrolling is, and the standard allows it for a layout the player arranged. What is not
      // allowed is content escaping the screen with nowhere to scroll, so the walk up the tree
      // asks whether anything above it actually scrolls sideways.
      'var pans = function (el) {',
      '  for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {',
      '    var ov = getComputedStyle(n).overflowX;',
      '    if (ov === "auto" || ov === "scroll") return true;',
      '  }',
      '  return false;',
      '};',
      'out.tooWide = [].slice.call(document.querySelectorAll(".board *")).filter(function (el) {',
      '  var r = el.getBoundingClientRect();',
      '  return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !pans(el);',
      '}).slice(0, 6).map(function (el) {',
      '  return el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0];',
      '});',
      // Primary controls must be reachable with a thumb.
      'out.smallTargets = [].slice.call(document.querySelectorAll(".status-actions .action-btn"))',
      '  .map(function (b) { var r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 18), h: Math.round(r.height) }; })',
      '  .filter(function (b) { return b.h < 44; });',
      'out.cardWidth = (function () {',
      '  var c = document.querySelector(".self-field app-card .card");',
      '  return c ? Math.round(c.getBoundingClientRect().width) : null;',
      '})();',
      'out.perRow = (function () {',
      '  var cards = [].slice.call(document.querySelectorAll(".self-field .lands-row app-card"));',
      '  if (!cards.length) return null;',
      '  var tops = cards.map(function (c) { return Math.round(c.getBoundingClientRect().top); });',
      '  var first = tops[0];',
      '  return tops.filter(function (t) { return t === first; }).length;',
      '})();',
      'out.handPans = (function () {',
      '  var el = document.querySelector(".hand-cards");',
      '  if (!el) return null;',
      '  if (el.scrollWidth <= el.clientWidth) return null;',
      '  var ov = getComputedStyle(el).overflowX;',
      '  return (ov === "auto" || ov === "scroll") && el.getBoundingClientRect().width <= window.innerWidth + 1;',
      '})();',
      'return out;',
    ].join(''),
  );

(async () => {
  const gameId = process.argv[2];
  const deviceId = process.argv[3] || 'iphone-se';
  const out = process.argv[4] || 'board-phone.png';
  const device = DEVICES.find((x) => x.id === deviceId);
  if (!device) throw new Error('unknown device ' + deviceId);

  const d = await buildDriver({ device, dpr: 1 });
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log('  ' + (ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(50) + (detail ?? ''));
  };

  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const m = await measure(d);
    console.log('  measured: ' + JSON.stringify(m, null, 0).slice(0, 700) + '\n');

    check(
      'the document does not overflow the screen',
      m.docWidth <= m.width,
      m.docWidth + ' vs ' + m.width,
    );
    check('nothing is painted off either edge', m.tooWide.length === 0, JSON.stringify(m.tooWide));
    check(
      'the board fills the width',
      m.board && m.board.w >= m.width - 1,
      JSON.stringify(m.board),
    );
    check(
      'both battlefields have real height',
      m.theirField && m.myField && m.theirField.h > 60 && m.myField.h > 60,
      'theirs ' + (m.theirField || {}).h + ', mine ' + (m.myField || {}).h,
    );
    check(
      'they are stacked, not side by side',
      m.theirField && m.myField && m.myField.y > m.theirField.y,
      'theirs y=' + (m.theirField || {}).y + ', mine y=' + (m.myField || {}).y,
    );
    check(
      'each half sits next to its own numbers',
      m.theirBar && m.myBar && m.theirBar.y < m.theirField.y && m.myBar.y > m.myField.y,
      'theirs bar y=' + (m.theirBar || {}).y + ', mine bar y=' + (m.myBar || {}).y,
    );
    check(
      'the status bar and hand are both on screen',
      m.status && m.hand && m.status.y + m.status.h <= m.height && m.hand.y < m.height,
      'status ' + JSON.stringify(m.status) + ', hand y=' + (m.hand || {}).y,
    );
    check(
      'the primary actions are thumb-sized (44px)',
      m.smallTargets.length === 0,
      JSON.stringify(m.smallTargets),
    );
    check(
      'a hand wider than the screen pans inside its own row',
      m.handPans === null || m.handPans === true,
      'hand scroller: ' + JSON.stringify(m.handPans),
    );
    if (m.perRow !== null) {
      check(
        'a land row holds more than two cards',
        m.perRow > 2,
        m.perRow + ' per row at ' + m.cardWidth + 'px',
      );
    }

    await d.takeScreenshot().then((png) => require('fs').writeFileSync(out, png, 'base64'));
    console.log('\n  shot: ' + out);
  } finally {
    await d.quit();
  }

  const failed = results.filter((r) => !r).length;
  console.log('\n' + results.length + ' checks, ' + failed + ' failed\n');
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e).slice(0, 600));
  process.exitCode = 1;
});
