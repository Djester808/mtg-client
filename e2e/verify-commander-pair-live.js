const assert = require('assert/strict');
const fs = require('fs');
const {By, until} = require('selenium-webdriver');
const {api, signIn} = require('./helpers/board-driver');
const {buildDriver} = require('./helpers/driver');
const {loginAs} = require('./helpers/auth');
const {baseUrl, username, password} = require('./config');
(async () => {
  const token = await signIn({username, password});
  const deck = (await api(token,'GET','/api/decks')).find(d=>d.name==='Commander pair preview');
  assert(deck, 'Run seed-commander-pair.js first');
  const original = await api(token,'GET','/api/decks/'+deck.id);
  const second = original.cards.find(c=>c.cardDetails?.name==='Tymna the Weaver');
  for (const device of require('./devices').filter(d=>['iphone-se','desktop'].includes(d.id))) {
    const driver = await buildDriver({device,dpr:1});
    const dismiss = async()=>{
      for(const skip of await driver.findElements(By.css('.intro-skip'))) if(await skip.isDisplayed()) await skip.click();
      await driver.wait(async()=>!(await driver.findElements(By.css('.brand-intro'))).length,12000);
    };
    const open = async()=>{
      await driver.get(baseUrl+'/deck/'+deck.id);
      await driver.wait(until.elementLocated(By.css('.tool-btn--cmdr')),15000);
      await dismiss();
      const button=await driver.findElement(By.css('.tool-btn--cmdr'));
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});',button);
      await driver.sleep(350);
      await button.click();
      await driver.wait(until.elementLocated(By.css('app-secondary-commander .asm-btn')),10000);
    };
    const pick = async label=>{
      const button=await driver.findElement(By.css('app-secondary-commander .asm-btn'));
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});',button);
      await driver.sleep(350);
      await button.click();
      const options=await driver.findElements(By.css('body > .asm-menu .app-menu-item'));
      for(const option of options) if((await option.getText()).trim()===label){await option.click();return;}
      throw new Error('Missing option '+label);
    };
    try {
      await loginAs(driver); await open();
      await driver.executeScript(`window.deckRequests=[]; const originalOpen=XMLHttpRequest.prototype.open, originalSend=XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open=function(method,url,...rest){this.deckTrace={method,url};return originalOpen.call(this,method,url,...rest)};
        XMLHttpRequest.prototype.send=function(body){if(this.deckTrace.url.includes('/api/decks/')){const trace={...this.deckTrace,body};window.deckRequests.push(trace);this.addEventListener('loadend',()=>{trace.status=this.status;});}return originalSend.call(this,body)};`);
      console.log(device.id,'clearing'); await pick('None');
      await driver.wait(async()=>!(await api(token,'GET','/api/decks/'+deck.id)).secondaryCommanderOracleId,10000);
      await driver.wait(async()=>(await driver.findElement(By.css('app-secondary-commander .asm-btn')).getText()).trim()==='None',10000);
      console.log(device.id,'selecting'); await pick('Tymna the Weaver');
      await driver.wait(async()=>(await api(token,'GET','/api/decks/'+deck.id)).secondaryCommanderOracleId===second.oracleId,10000);
      console.log(device.id,'notes'); const notes=await driver.findElement(By.css('.cp-notes-textarea'));
      await notes.clear(); await notes.sendKeys('Pair save verification '+device.id);
      await driver.findElement(By.css('app-secondary-commander .label')).click();
      await driver.wait(async()=> (await api(token,'GET','/api/decks/'+deck.id)).notes==='Pair save verification '+device.id,10000);
      assert.equal((await api(token,'GET','/api/decks/'+deck.id)).secondaryCommanderOracleId,second.oracleId);
      await open();
      const button=await driver.findElement(By.css('app-secondary-commander .asm-btn'));
      assert.equal((await button.getText()).trim(),'Tymna the Weaver');
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});',button);
      assert.equal(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth'),true);
      fs.writeFileSync('screenshots/'+device.id+'/commander-pair-live.png',await driver.takeScreenshot(),'base64');
      console.log('PASS',device.id,'remove, select, notes save, refresh and persisted pair');
    } catch(error) { fs.writeFileSync('screenshots/commander-pair-save-failure.png',await driver.takeScreenshot(),'base64'); console.log('Requests',await driver.executeScript('return window.deckRequests')); console.log('Saved selection:',(await api(token,'GET','/api/decks/'+deck.id)).secondaryCommanderOracleId); throw error; } finally { await driver.quit(); }
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
