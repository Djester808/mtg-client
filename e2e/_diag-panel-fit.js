// Measures the player panels: whether every zone chip is inside the panel, and whether any
// label is being cut. "It looks fine" has been wrong twice on this panel.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const wanted = process.argv.slice(3);
  let bad = 0;
  for (const device of DEVICES.filter((x) => (wanted.length ? wanted.includes(x.id) : true))) {
    const d = await buildDriver({ device, dpr: 1 });
    try {
      await signInThroughTheForm(d, { By, until }, A);
      await d.get(baseUrl + '/play/' + gameId);
      await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
      await sleep(1500);

      const panels = await d.executeScript(`
        return Array.from(document.querySelectorAll('app-player-sidebar')).map(p => {
          const box = p.getBoundingClientRect();
          const chips = Array.from(p.querySelectorAll('.zone-row')).map(z => {
            const r = z.getBoundingClientRect();
            const label = z.querySelector('.zone-name');
            return {
              text: label.textContent.trim(),
              visible: r.bottom <= Math.ceil(box.bottom) + 1 && r.top >= Math.floor(box.top) - 1,
              cut: label.scrollWidth > label.clientWidth + 1,
              tapPx: Math.round(Math.min(r.width, r.height)),
            };
          });
          return { who: p.querySelector('.pn-text').textContent.trim(), chips };
        });
      `);
      console.log('  ' + device.id);
      for (const p of panels) {
        for (const c of p.chips) {
          const problems = [
            c.visible ? null : 'BELOW THE FOLD',
            c.cut ? 'LABEL CUT' : null,
            c.tapPx >= 44 ? null : 'TAP ' + c.tapPx + 'px',
          ].filter(Boolean);
          if (problems.length) bad++;
          console.log(
            '    ' + p.who.padEnd(16) + c.text.padEnd(11) +
              (problems.length ? '  <-- ' + problems.join(', ') : '  ok'),
          );
        }
      }
    } finally {
      await d.quit();
    }
  }
  process.exitCode = bad ? 1 : 0;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
