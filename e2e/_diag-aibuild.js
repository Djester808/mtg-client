// One-off measurement of the AI builder's review step at phone width.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay } = require('./helpers/ai-build-replay');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await d.wait(until.elementLocated(By.css('.ab-textarea')), 20000);
    await d.findElement(By.css('.ab-textarea')).sendKeys('wolf tribal');
    await d.executeScript("document.querySelector('.ab-go').click();");
    await d.wait(until.elementLocated(By.css('.ab-cmd')), 20000);
    await sleep(600);
    await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
    await d.wait(until.elementLocated(By.css('.ab-row-btn')), 30000);
    await sleep(1000);

    const m = await d.executeScript(`
      const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        return {w:Math.round(b.width), h:Math.round(b.height), l:Math.round(b.left), t:Math.round(b.top)}; };
      const tabs = Array.from(document.querySelectorAll('.ab-review-tab')).map(t => ({
        text: t.textContent.trim().replace(/\s+/g,' '), ...box(t) }));
      const row = document.querySelector('.ab-row-btn');
      const actions = Array.from(document.querySelectorAll('.ab-actions button, .ab-foot button, .ab-review ~ * button'))
        .map(b => ({ text: b.textContent.trim(), cls: b.className, ...box(b) }));
      const allBtns = Array.from(document.querySelectorAll('button'))
        .filter(b => /discard|save to deck/i.test(b.textContent))
        .map(b => ({ text: b.textContent.trim(), cls: b.className,
                     pos: getComputedStyle(b.parentElement).position,
                     parentCls: b.parentElement.className, ...box(b) }));
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        tabs,
        tabStripTop: box(document.querySelector('.ab-review-tabs, .ab-tabs')),
        row: row ? { ...box(row), text: row.textContent.trim().replace(/\s+/g,' ') } : null,
        rowChildren: row ? Array.from(row.children).map(c => ({ tag:c.tagName.toLowerCase(), cls:c.className, ...box(c) })) : [],
        actions: allBtns,
        navbarH: box(document.querySelector('nav, .navbar, header.navbar')),
      };
    `);
    console.log(JSON.stringify(m, null, 1));
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
