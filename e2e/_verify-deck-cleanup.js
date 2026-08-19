// End-to-end: an abandoned build must not leave an empty deck behind.
const https = require('https');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay } = require('./helpers/ai-build-replay');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agent = new https.Agent({ rejectUnauthorized: false });
const API = 'https://localhost:7001';

function req(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      url,
      { method, agent, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); },
    );
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const token = JSON.parse(await req('POST', API + '/api/auth/login', null, { username, password })).token;
  const count = async () => {
    const d = JSON.parse(await req('GET', API + '/api/decks', token));
    const all = Array.isArray(d) ? d : d.items || [];
    return { total: all.length, empty: all.filter((x) => (x.cardCount || 0) === 0).length };
  };

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await armAiBuildReplay(d);
    await d.get(baseUrl + '/login');
    await d.wait(until.elementLocated(By.id('username')), 20000);
    await d.findElement(By.id('username')).sendKeys(username);
    await d.findElement(By.id('password')).sendKeys(password);
    await d.findElement(By.css('.submit-btn')).click();
    await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);

    const toPlan = async () => {
      await d.get(baseUrl + '/deck/build');
      await d.wait(until.elementLocated(By.css('.ab-textarea')), 25000);
      await d.findElement(By.css('.ab-textarea')).sendKeys('wolf tribal');
      await d.executeScript("document.querySelector('.ab-go').click();");
      await d.wait(until.elementLocated(By.css('.ab-cmd')), 25000);
      await sleep(700);
      await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
      await d.wait(until.elementLocated(By.css('.ab-row-btn')), 40000);
      await sleep(1200);
    };

    const before = await count();
    console.log('before          ', JSON.stringify(before));

    await toPlan();
    const during = await count();
    console.log('deck created    ', JSON.stringify(during), during.total === before.total + 1 ? 'OK' : 'UNEXPECTED');

    await d.executeScript(
      "Array.from(document.querySelectorAll('.ab-accept button')).filter(function(b){return /discard/i.test(b.textContent);})[0].click();",
    );
    await sleep(2500);
    const afterDiscard = await count();
    console.log('after Discard   ', JSON.stringify(afterDiscard), afterDiscard.total === before.total ? 'CLEANED UP' : 'ORPHAN LEFT');

    // In-app router navigation: the component is destroyed, the page is not.
    await toPlan();
    await d.executeScript(
      "var a = Array.from(document.querySelectorAll('a')).filter(function(x){return (x.getAttribute('href')||'') === '/deck';})[0]; if (a) a.click();",
    );
    await sleep(3000);
    const afterRouter = await count();
    console.log('after router nav', JSON.stringify(afterRouter), afterRouter.total === before.total ? 'CLEANED UP' : 'ORPHAN LEFT');

    // Hard unload: the JS context goes away mid-flight.
    await toPlan();
    await d.get(baseUrl + '/deck');
    await sleep(3000);
    const afterUnload = await count();
    console.log('after hard unload', JSON.stringify(afterUnload), afterUnload.total === afterRouter.total ? 'CLEANED UP' : 'ORPHAN LEFT');
  } finally { await d.quit(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
