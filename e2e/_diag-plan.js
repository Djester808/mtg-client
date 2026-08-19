const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay } = require('./helpers/ai-build-replay');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  const rev = document.querySelector('.ab-review');
  const toggle = document.querySelector('.ab-assess-toggle');
  const mana = document.querySelectorAll('.ab-row-mana');
  const row = document.querySelector('.ab-row-btn');
  const kids = row ? Array.from(row.children).map(function (c) {
    const b = c.getBoundingClientRect();
    return c.className + ':' + Math.round(b.width);
  }) : [];
  return {
    pageHeight: document.documentElement.scrollHeight,
    reviewTop: rev ? Math.round(rev.getBoundingClientRect().top + window.scrollY) : null,
    toggleText: toggle ? toggle.textContent.trim() : null,
    findingsVisible: document.querySelectorAll('.ab-finding:not([hidden])').length,
    findingsTotal: document.querySelectorAll('.ab-finding').length,
    manaRendered: mana.length,
    rowParts: kids,
  };
`;

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await armAiBuildReplay(d);
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
    await d.get(baseUrl + '/deck/build');
    await d.wait(until.elementLocated(By.css('.ab-textarea')), 25000);
    await d.findElement(By.css('.ab-textarea')).sendKeys('wolf tribal');
    await d.executeScript("document.querySelector('.ab-go').click();");
    await d.wait(until.elementLocated(By.css('.ab-cmd')), 25000);
    await sleep(700);
    await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
    await d.wait(until.elementLocated(By.css('.ab-row-btn')), 40000);
    await sleep(1500);
    console.log('LANDS TAB :', JSON.stringify(await d.executeScript(PROBE), null, 1));
    await d.executeScript("document.querySelectorAll('.ab-review-tab')[1].click();");
    await sleep(700);
    console.log('CREATURES :', JSON.stringify(await d.executeScript(PROBE), null, 1));
    await d.executeScript("document.querySelector('.ab-assess-toggle').click();");
    await sleep(800);
    const open = await d.executeScript(PROBE);
    console.log('EXPANDED  : pageHeight=' + open.pageHeight + ' reviewTop=' + open.reviewTop +
      ' findingsVisible=' + open.findingsVisible);
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
