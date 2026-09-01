// Measures the hand: how big its cards actually are, whether they overlap into a fan, and
// whether anything inside it is scrolling when it should not be.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    await d.get(baseUrl + '/play/' + process.argv[2]);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(1500);

    const out = await d.executeScript(`
      const box = (el) => { const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) }; };
      const row = document.querySelector('.hand-row');
      const zone = document.querySelector('.hand-zone');
      const cards = document.querySelector('.hand-cards');
      const wraps = [...document.querySelectorAll('.hand-card-wrapper')];
      const faces = [...document.querySelectorAll('.hand-card-wrapper app-card')];
      return {
        row: box(row), zone: box(zone), cards: box(cards),
        cardsScrollsY: cards.scrollHeight - cards.clientHeight,
        cardsScrollsX: cards.scrollWidth - cards.clientWidth,
        zoneScrollsY: zone.scrollHeight - zone.clientHeight,
        wrapper: wraps[0] ? box(wraps[0]) : null,
        face: faces[0] ? box(faces[0]) : null,
        inlineWidth: faces[0] ? faces[0].style.width : null,
        computedWidth: faces[0] ? getComputedStyle(faces[0]).width : null,
        transforms: wraps.map((w) => getComputedStyle(w).transform.slice(0, 34)),
        gaps: faces.slice(1).map((f, i) =>
          Math.round(f.getBoundingClientRect().left - faces[i].getBoundingClientRect().right)),
      };
    `);
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
