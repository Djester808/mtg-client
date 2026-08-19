const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DECK = '/deck/f212e621-78ff-4952-8032-31fbd221199d';
const PROBE = `
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const g = document.querySelectorAll('.cmc-group');
  const stack = document.querySelector('.visual-stack');
  const card = document.querySelector('.visual-card');
  return {
    groups: g.length,
    firstGroup: box(g[0]),
    stack: box(stack),
    stackDisplay: stack ? getComputedStyle(stack).display : null,
    stackCols: stack ? getComputedStyle(stack).gridTemplateColumns : null,
    cards: document.querySelectorAll('.visual-card').length,
    firstCard: box(card),
    cardWidthStyle: card ? getComputedStyle(card).width : null,
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
    await d.get(baseUrl + DECK);
    await d.wait(until.elementLocated(By.css('.groups-area')), 30000);
    await sleep(2500);
    const click = async (title) => {
      const ok = await d.executeScript(
        'var want = arguments[0];' +
          'var b = Array.from(document.querySelectorAll(".density-btn")).filter(function (x) {' +
          '  return x.getAttribute("title") === want; })[0];' +
          'if (b) { b.click(); return true; } return false;',
        title,
      );
      if (!ok) throw new Error('missing ' + title);
      await sleep(1500);
    };
    for (const density of ['Full card', 'Half card', 'Name only', 'Text list']) {
      await click('Horizontal groups (columns)');
      await click(density);
      const h = await d.executeScript(PROBE);
      await click('Vertical groups (rows)');
      const v = await d.executeScript(PROBE);
      console.log(density, 'V:', JSON.stringify(v));
    }
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
