// Measures whether cards on a battlefield row overlap, because "it looks squeezed" is not a
// number and the tapped-card overlap has already been mis-diagnosed once as flex shrink.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(1500);

    const rows = await d.executeScript(`
      const out = [];
      for (const row of document.querySelectorAll('app-zones .lands-row, app-zones .permanents-row')) {
        const cards = Array.from(row.querySelectorAll('app-card'));
        if (!cards.length) continue;
        const boxes = cards.map(c => {
          const face = c.querySelector('.card');
          const r = face.getBoundingClientRect();
          return { name: c.querySelector('.card-name')?.textContent.trim(),
                   tapped: face.classList.contains('tapped'),
                   left: Math.round(r.left), right: Math.round(r.right) };
        }).sort((a, b) => a.left - b.left);
        let worst = 0;
        for (let i = 1; i < boxes.length; i++) {
          worst = Math.max(worst, Math.round(boxes[i - 1].right - boxes[i].left));
        }
        out.push({ row: row.className, count: boxes.length,
                   tapped: boxes.filter(b => b.tapped).length, worstOverlapPx: worst });
      }
      return out;
    `);
    for (const r of rows) {
      console.log(
        '  ' + r.row.padEnd(16) + ' ' + r.count + ' cards (' + r.tapped + ' tapped)' +
          ' — worst overlap: ' + r.worstOverlapPx + 'px' +
          (r.worstOverlapPx > 0 ? '   <-- OVERLAPPING' : '   ok'),
      );
    }
    process.exitCode = rows.some((r) => r.worstOverlapPx > 0) ? 1 : 0;
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
