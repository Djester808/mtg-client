const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await d.get(baseUrl + '/community/commanders');
    await d.wait(until.elementLocated(By.css('.commander-card, .cl-card, a[href*="/commanders/"]')), 20000);
    await sleep(2000);
    const first = await d.findElement(By.css('a[href*="/commanders/"], .commander-card, .cl-card'));
    await d.executeScript('arguments[0].click();', first);
    await sleep(3500);
    const card = await d.findElement(By.css('.card-tile, .cd-card, img[src*="scryfall"], .card-img'));
    await d.executeScript('arguments[0].scrollIntoView({block:"center"});', card);
    await sleep(500);
    await d.executeScript('arguments[0].click();', card);
    await d.wait(until.elementLocated(By.css('.card-modal')), 12000);
    await sleep(1500);
    console.log(JSON.stringify(await d.executeScript(`
      const root = document.querySelector('.card-modal');
      const out = [];
      for (const el of root.querySelectorAll('a,button,input,select,textarea,[role="button"]')) {
        if (el.disabled) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        if (b.width >= 44 && b.height >= 44) continue;
        out.push({ tag: el.tagName.toLowerCase(), cls: el.className, text: (el.textContent||'').trim().slice(0,24),
                   w: Math.round(b.width), h: Math.round(b.height) });
      }
      return { url: location.pathname, title: (root.querySelector('.modal-title,h2,h3')||{}).textContent, small: out };
    `), null, 1));
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
