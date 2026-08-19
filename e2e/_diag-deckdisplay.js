// One-off: measure how much width each deck DISPLAY mode actually uses.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left) }; };
  const area = document.querySelector('.groups-area');
  const list = document.querySelector('.groups-list');
  const groupEls = document.querySelectorAll('.cmc-group, .card-group');
  return {
    innerWidth: window.innerWidth,
    areaClasses: area ? area.className : null,
    area: box(area),
    list: box(list),
    listDirection: list ? getComputedStyle(list).flexDirection : null,
    listWrap: list ? getComputedStyle(list).flexWrap : null,
    groupCount: groupEls.length,
    groups: Array.from(groupEls).slice(0, 4).map(box),
    display: Array.from(document.querySelectorAll('.density-btn')).map(function (b) {
      return { title: b.getAttribute('title'), active: b.classList.contains('is-active') };
    }),
  };
`;

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);

    await d.get(baseUrl + '/deck/f212e621-78ff-4952-8032-31fbd221199d');
    await d.wait(until.elementLocated(By.css('.groups-area')), 30000);
    await sleep(2500);

    console.log('INITIAL:', JSON.stringify(await d.executeScript(PROBE), null, 1));

    const titles = await d.executeScript(
      "return Array.from(document.querySelectorAll('.density-btn')).map(function(b){return b.getAttribute('title');});",
    );
    console.log('DISPLAY buttons:', JSON.stringify(titles));

    for (let i = 0; i < titles.length; i++) {
      await d.executeScript('document.querySelectorAll(".density-btn")[' + i + '].click();');
      await sleep(1500);
      const m = await d.executeScript(PROBE);
      console.log(
        `[${titles[i]}] list=${m.list ? m.list.w : '-'} of ${m.innerWidth}  dir=${m.listDirection} wrap=${m.listWrap}  groups=${m.groupCount} first=${m.groups[0] ? m.groups[0].w : '-'}`,
      );
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
