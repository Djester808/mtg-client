// Reports the box of every part of the board, so a layout claim is a number.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const gameId = process.argv[2];
  const wanted = process.argv.slice(3);
  for (const device of DEVICES.filter((x) => (wanted.length ? wanted.includes(x.id) : true))) {
    const d = await buildDriver({ device, dpr: 1 });
    try {
      await signInThroughTheForm(d, { By, until }, A);
      await d.get(baseUrl + '/play/' + gameId);
      await d.wait(until.elementLocated(By.css('.board')), 25000);
      await sleep(1500);

      const boxes = await d.executeScript(`
        const parts = ['.top-bar', '.opponent-sidebar', '.opponent-field', '.stack-col',
                       '.self-field', '.self-sidebar', '.status-bar', '.hand-row'];
        const board = document.querySelector('.board');
        const root = board.getBoundingClientRect();
        return { root: { h: Math.round(root.height), scroll: board.scrollHeight },
                 parts: parts.map(sel => {
          const el = document.querySelector(sel);
          if (!el) return { sel, missing: true };
          const r = el.getBoundingClientRect();
          return { sel, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width),
                   scrolls: el.scrollHeight > el.clientHeight + 1 ? el.scrollHeight - el.clientHeight : 0 };
        }) };
      `);
      console.log('  ' + device.id + '  board ' + boxes.root.h + 'px tall, content ' +
        boxes.root.scroll + 'px');
      for (const p of boxes.parts) {
        console.log(
          '    ' + p.sel.padEnd(18) +
            (p.missing ? 'NOT RENDERED' : 'h=' + String(p.h).padStart(4) + '  w=' +
              String(p.w).padStart(4) + '  top=' + String(p.top).padStart(4) +
              (p.h === 0 ? '   <-- COLLAPSED' : p.scrolls ? '   <-- ' + p.scrolls + 'px CLIPPED' : '')),
        );
      }
    } finally {
      await d.quit();
    }
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
