const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript('localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));', process.argv[2]);
    await d.get(baseUrl + '/game/' + process.argv[2]);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(2500);
    const m = await d.executeScript([
      'var cs = function (s, p) { var el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; };',
      'var box = function (s) { var el = document.querySelector(s); if (!el) return null; var r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; };',
      'return {',
      '  width: window.innerWidth,',
      '  cols: cs(".board","gridTemplateColumns"),',
      '  stackCol: cs(".stack-col","position"),',
      '  tooltip: cs(".card-tooltip","display"),',
      '  lifeControls: cs(".life-controls","display"),',
      '  sidebar: box(".self-sidebar"),',
      '  field: box(".self-field"),',
      '  stack: box(".stack-col"),',
      '  handCards: cs(".hand-cards","overflowX"),',
      '};'].join(''));
    console.log(JSON.stringify(m, null, 1));
    const ok = [];
    const chk = (n, c, d) => { ok.push(c); console.log('  ' + (c ? 'PASS  ' : 'FAIL  ') + n.padEnd(50) + (d ?? '')); };
    chk('desktop keeps its three columns', /180px .* 220px/.test(m.cols), m.cols);
    chk('the stack keeps its own column', m.stackCol === 'relative' && m.stack && m.stack[2] > 100, JSON.stringify(m.stack));
    chk('the hover tooltip still exists', m.tooltip !== 'none', m.tooltip);
    chk('manual life controls still exist', m.lifeControls !== 'none', m.lifeControls);
    chk('the hand does not pan on desktop', m.handCards !== 'auto' && m.handCards !== 'scroll', m.handCards);
    console.log('\n' + ok.length + ' checks, ' + ok.filter(x => !x).length + ' failed\n');
    process.exitCode = ok.every(Boolean) ? 0 : 1;
  } finally { await d.quit(); }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exitCode = 1; });
