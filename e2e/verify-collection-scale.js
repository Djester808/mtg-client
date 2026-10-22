// Live collection paging and complete regex checks, using a disposable account only.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { By, until, Key } = require('./node_modules/selenium-webdriver');
const { buildDriver } = require('./helpers/driver'), devices = require('./devices');
let token;
const { ok } = require('./helpers/parity-api').createParityApi(() => token);
const out = path.join(__dirname, 'screenshots', 'parity-port');
fs.mkdirSync(out, { recursive: true });
async function open(d, route, ready) {
  await d.get('http://127.0.0.1:4200' + route);
  await d.wait(until.elementLocated(By.css('.intro-skip')), 15000);
  await d.findElement(By.css('.intro-skip')).click();
  await d.wait(async () => !(await d.findElements(By.css('.brand-intro'))).length, 15000);
  await d.wait(until.elementLocated(By.css(ready)), 20000);
}
async function save(d, device, state) {
  await d.executeAsyncScript('document.fonts.ready.then(arguments[0]);');
  fs.writeFileSync(path.join(out, device + '-' + state + '.png'), await d.takeScreenshot(), 'base64');
}
const instrument = `(()=>{window.__collectionReads=[];const nativeFetch=window.fetch;window.fetch=async function(input,init){const response=await nativeFetch.apply(this,arguments);const url=String(input?.url??input);if(url.includes('/api/collections/')){let result;try{result=await response.clone().json()}catch{};window.__collectionReads.push({url,method:init?.method??'GET',body:init?.body?JSON.parse(init.body):null,cards:result?.cards?.length,total:result?.pageData?.total,totalRows:result?.pageData?.totalRows,error:result?.pageData?.queryError});}return response;};})();`;
(async () => {
  const username = 'scale_' + Date.now(), password = 'ScaleTest!' + Date.now();
  let d;
  try {
    token = (await ok('auth/register', { username, email: username + '@example.test', password, acceptedTerms: true })).token;
    const col = await ok('collections', { name: 'Large collection verification' });
    const cards = await ok('cards/search?q=t%3Acreature&limit=200');
    const extra = (await ok('cards/search?q=t%3Acreature&limit=1&offset=200')).find(c => !cards.some(x => x.oracleId === c.oracleId));
    assert(extra); cards.push(extra); assert.equal(cards.length, 201);
    const rows = [];
    for (let i = 0; i < cards.length; i += 4) rows.push(...await Promise.all(cards.slice(i, i + 4).map(c => ok('collections/' + col.id + '/cards', { oracleId: c.oracleId, quantity: 1, quantityFoil: 0 }))));
    const expectedId = rows.find(c => c.oracleId === cards[0].oracleId).id;
    console.log('201 distinct rows created.');
    for (const device of devices.filter(x => ['iphone-se', 'ipad-mini', 'desktop'].includes(x.id))) {
      d = await buildDriver({ device, dpr: 1 });
      await open(d, '/login', 'form');
      await d.findElement(By.css('[formcontrolname=username]')).sendKeys(username);
      await d.findElement(By.css('[formcontrolname=password]')).sendKeys(password);
      await d.findElement(By.css('button[type=submit]')).click();
      await d.wait(async () => d.executeScript('return !!localStorage.getItem("auth_token")'), 10000);
      await d.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: instrument });
      await open(d, '/collection/' + col.id, '.collection-paging');
      await d.wait(async () => (await d.findElements(By.css('.card-wrap'))).length === 100, 10000);
      await d.wait(async () => (await d.findElements(By.css('.card-wrap app-card-tile'))).length < 100, 10000);
      assert(await d.executeScript('return document.documentElement.scrollWidth<=innerWidth+1'));
      await save(d, device.id, 'paging-first');
      const next = () => d.findElement(By.xpath('//nav[contains(@class,"collection-paging")]//button[normalize-space(.)="Next"]'));
      await (await next()).click();
      await d.wait(async () => d.executeScript('return window.__collectionReads.some(r=>r.body?.page===2)'), 10000);
      await (await next()).click();
      await d.wait(async () => (await d.findElements(By.css('.card-wrap'))).length === 1, 10000);
      await save(d, device.id, 'paging-last');
      await d.findElement(By.css('app-card-grid-filters .filter-input')).sendKeys(cards[0].oracleId);
      await d.wait(async () => { const found = await d.findElements(By.css('.card-wrap')); return found.length === 1 && (await found[0].getAttribute('data-card-id')) === expectedId; }, 10000);
      console.log(device.id + ': global GUID filter passed');
      const menu = await d.findElement(By.css('app-card-grid-filters .cgf-menu-btn'));
      if (await menu.isDisplayed()) await menu.click();
      await d.findElement(By.xpath('//app-card-grid-filters//label[contains(.,"Regular expression")]//input')).click();
      const field = () => d.findElement(By.css('app-card-grid-filters .filter-input'));
      async function setQuery(query) {
        await (await field()).sendKeys(Key.chord(Key.CONTROL, 'a'), Key.BACK_SPACE, query);
        assert.equal(await (await field()).getAttribute('value'), query);
        await d.wait(async () => d.executeScript('return window.__collectionReads.some(r=>r.body?.regex&&r.body?.query===arguments[0])', query), 15000);
      }
      await setQuery('^(?=(.+)$)\\1$');
      await d.wait(async () => (await d.findElements(By.css('.card-wrap'))).length === 100, 10000);
      assert((await d.findElement(By.css('.collection-paging')).getText()).includes('201 matching'));
      await setQuery('[');
      await d.wait(async () => (await d.findElements(By.css('.card-wrap'))).length === 0, 10000);
      await d.wait(until.elementLocated(By.css('app-card-grid-filters [role=alert]')), 5000);
      assert((await d.findElement(By.css('app-card-grid-filters [role=alert]')).getText()).includes('invalid'));
      assert.equal((await d.findElements(By.css('.empty-state'))).length, 0);
      await save(d, device.id, 'regex-invalid');
      const escaped = cards[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const long = '^(?:' + Array(30).fill('This card does not exist').join('|') + '|' + escaped + ')$';
      assert(long.length > 200);
      await setQuery(long);
      await d.wait(async () => (await d.findElements(By.css('.card-wrap'))).length === 1, 10000);
      assert.equal((await d.findElements(By.css('app-card-grid-filters [role=alert]'))).length, 0);
      assert((await d.findElement(By.css('.header-count')).getAttribute('textContent')).includes('201'));
      assert(await d.executeScript('return document.documentElement.scrollWidth<=innerWidth+1'));
      await save(d, device.id, 'regex-full');
      const reads = await d.executeScript('return window.__collectionReads');
      assert(reads.some(r => r.url.endsWith('/query') && r.body.regex && r.body.query === long));
      assert(reads.filter(r => r.cards != null).every(r => r.cards <= 100));
      assert(!reads.some(r => r.method === 'GET' && r.url.endsWith('/api/collections/' + col.id)));
      assert(reads.filter(r => r.totalRows != null).every(r => r.totalRows === 201));
      fs.writeFileSync(path.join(out, device.id + '-collection-network.json'), JSON.stringify(reads, null, 2));
      console.log(device.id + ': network pages, virtualization, global filtering, complete regex, invalid recovery, whole-collection totals and overflow passed.');
      await d.quit(); d = null;
    }
  } finally {
    if (d) {
      await save(d, 'query', 'last');
      fs.writeFileSync(path.join(out, 'query-last.json'), JSON.stringify(await d.executeScript('return {reads:window.__collectionReads,text:document.body.innerText,input:document.querySelector("app-card-grid-filters .filter-input")?.value}'), null, 2));
      await d.quit();
    }
    if (token) await ok('account', { password }, 'DELETE');
    console.log('Disposable scale account removed.');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
