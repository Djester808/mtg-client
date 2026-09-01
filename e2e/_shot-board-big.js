// Photographs the board at a real desktop size, because the board is a full-screen surface and
// the harness's 1280 × 749 device is shorter than any screen it will actually run on.
//
//   node _shot-board-big.js <gameId> [width] [height]
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const SHOTS = path.join(__dirname, 'screenshots', 'restored-board');

(async () => {
  const gameId = process.argv[2];
  const width = Number(process.argv[3] || 1600);
  const height = Number(process.argv[4] || 1000);

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.manage().window().setRect({ width, height });
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(2000);

    const layout = await d.executeScript(`
      var box = function (s) {
        var el = document.querySelector(s);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return Math.round(r.height) + 'px tall';
      };
      return {
        navbarHidden: !document.querySelector('app-navbar'),
        topBar: box('.top-bar'),
        halves: box('.opponent-field') + ' / ' + box('.self-field'),
        stackColumn: box('.stack-col'),
        statusBar: box('.status-bar'),
        hand: box('.hand-row'),
        handCard: box('app-hand app-card'),
        logo: document.querySelector('.top-bar .logo') ? document.querySelector('.top-bar .logo').textContent.trim() : null,
        overflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    `);
    console.log(JSON.stringify(layout, null, 2));

    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, 'big-board.png'), await d.takeScreenshot(), 'base64');
    console.log('shot: big-board (' + width + '×' + height + ')');
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
