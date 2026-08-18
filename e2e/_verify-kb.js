// kb master-detail on a phone: list -> tap an entry -> readable article -> back to list.
// The audit reporting "ok" is not enough here: the detail pane is display:none until
// something is selected, so an empty pane would pass trivially.
const { By, until } = require('selenium-webdriver');
const fs = require('fs');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `
  const vw = window.innerWidth;
  const detail = document.querySelector('.kb-detail');
  const side = document.querySelector('.kb-sidebar');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  const para = document.querySelector('.kb-detail p.detail-desc, .kb-detail .detail-card p');
  const pb = para && para.getBoundingClientRect();
  const lh = para ? parseFloat(getComputedStyle(para).lineHeight) || 16 : 0;
  return {
    sidebarVisible: vis(side),
    detailVisible: vis(detail),
    detailW: detail ? Math.round(detail.getBoundingClientRect().width) : null,
    detailScrollsX: detail ? detail.scrollWidth > detail.clientWidth + 1 : null,
    paraW: pb ? Math.round(pb.width) : null,
    paraLines: pb ? Math.round(pb.height / lh) : null,
    paraText: para ? para.textContent.trim().slice(0, 46) : null,
    backVisible: vis(document.querySelector('.kb-back')),
    vw,
  };
`;

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await d.get(baseUrl + '/kb');
    await d.wait(until.elementLocated(By.css('.kb-sidebar')), 12000);
    await sleep(2000);
    console.log('1. list view :', JSON.stringify(await d.executeScript(MEASURE)));
    fs.writeFileSync('screenshots/_kb-list.png', await d.takeScreenshot(), 'base64');

    // Tap the first sidebar entry.
    const item = await d.findElement(By.css('.sidebar-item'));
    await d.executeScript('arguments[0].click();', item);
    await sleep(1200);
    console.log('2. detail    :', JSON.stringify(await d.executeScript(MEASURE)));
    fs.writeFileSync('screenshots/_kb-detail.png', await d.takeScreenshot(), 'base64');

    // Back.
    const back = await d.findElement(By.css('.kb-back'));
    await back.click();
    await sleep(900);
    console.log('3. after back:', JSON.stringify(await d.executeScript(MEASURE)));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
