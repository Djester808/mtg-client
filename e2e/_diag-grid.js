const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === process.argv[3] || 'iphone-se'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript('localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));', process.argv[2]);
    await d.get(baseUrl + '/game/' + process.argv[2]);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(2500);
    console.log(JSON.stringify(await d.executeScript([
      'var cs = function (s, p) { var el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; };',
      'return {',
      '  innerWidth: window.innerWidth,',
      '  matchesPhone: window.matchMedia("(max-width: 639.98px)").matches,',
      '  cols: cs(".board", "gridTemplateColumns"),',
      '  rows: cs(".board", "gridTemplateRows"),',
      '  oppSidebarRow: cs(".opponent-sidebar", "gridRow"),',
      '  selfSidebarRow: cs(".self-sidebar", "gridRow"),',
      '  oppFieldRow: cs(".opponent-field", "gridRow"),',
      '  selfFieldRow: cs(".self-field", "gridRow"),',
      '  handRow: cs(".hand-row", "gridRow"),',
      '  handH: cs(".board", "--hand-h") || getComputedStyle(document.querySelector(".board")).getPropertyValue("--hand-h"),',
      '};',
    ].join('')), null, 1));
  } finally { await d.quit(); }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exitCode = 1; });
