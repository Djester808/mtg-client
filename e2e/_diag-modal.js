// Where did the art column go, and is the close button reachable under the navbar?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/community/commanders');
    await d.wait(until.elementLocated(By.css('a[href*="/commanders/"]')), 20000);
    await sleep(2000);
    await d.executeScript(
      'document.querySelector(\'a[href*="/commanders/"]\').click();',
    );
    await sleep(3500);
    const card = await d.findElement(By.css('.card-tile, img[src*="scryfall"], .card-img'));
    await d.executeScript('arguments[0].click();', card);
    await d.wait(until.elementLocated(By.css('.card-modal')), 12000);
    await sleep(1800);

    const r = await d.executeScript(`
      const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        return { l:Math.round(b.left), t:Math.round(b.top), w:Math.round(b.width), h:Math.round(b.height) }; };
      const modal = document.querySelector('.card-modal');
      const art = document.querySelector('.modal-art-col');
      const img = art && art.querySelector('img');
      const nav = document.querySelector('app-navbar nav');
      // What is painted at the modal's top-left corner region?
      const atTop = document.elementFromPoint(340, 26);
      const closeBtn = document.querySelector('.card-modal .modal-close, .card-modal [aria-label*="lose"], .card-modal .modal-x');
      return {
        modal: box(modal), modalZ: getComputedStyle(modal).zIndex,
        art: box(art), artDisplay: art ? getComputedStyle(art).display : null,
        img: box(img), imgSrc: img ? (img.currentSrc||img.src||'').slice(-30) : null,
        nav: box(nav), navZ: nav ? getComputedStyle(nav).zIndex : null,
        topElement: atTop ? atTop.tagName + '.' + (typeof atTop.className==='string'?atTop.className.split(/\\s+/)[0]:'') : null,
        closeBtn: box(closeBtn),
        closeSel: closeBtn ? closeBtn.className : null,
      };
    `);
    console.log(JSON.stringify(r, null, 2));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
