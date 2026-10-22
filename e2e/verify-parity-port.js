// Real account and collection parity checks. Uses only disposable accounts.
const fs=require('fs'),path=require('path'),https=require('https'),assert=require('assert/strict');const root=__dirname+'/';const {By,until}=require(root+'node_modules/selenium-webdriver'),{buildDriver}=require(root+'helpers/driver'),devices=require(root+'devices');let token;fs.mkdirSync(path.join(__dirname,'screenshots','parity-port'),{recursive:true});
const {api,ok}=require(root+'helpers/parity-api').createParityApi(()=>token);
async function open(d,route,ready){await d.get('http://127.0.0.1:4200'+route);await d.wait(until.elementLocated(By.css('.intro-skip')),15000);await d.findElement(By.css('.intro-skip')).click();await d.wait(async()=>!(await d.findElements(By.css('.brand-intro'))).length,15000);if(ready)await d.wait(until.elementLocated(By.css(ready)),20000);}
async function save(d,device,state){await d.executeAsyncScript('document.fonts.ready.then(arguments[0]);');fs.writeFileSync(path.join(__dirname,'screenshots','parity-port',device+'-'+state+'.png'),await d.takeScreenshot(),'base64')}

(async()=>{const username='parity_'+Date.now(),password='ParityTest!'+Date.now();let d;try{
 token=(await ok('auth/register',{username,email:username+'@example.test',password,acceptedTerms:true})).token;
 const sol=await ok('cards/by-name?name=Sol%20Ring');
 for(const device of devices.filter(x=>['iphone-se','ipad-mini','desktop'].includes(x.id) && (!process.env.PORT_DEVICE || x.id===process.env.PORT_DEVICE))){
  const col=await ok('collections',{name:'Port verification '+device.id});const row=await ok('collections/'+col.id+'/cards',{oracleId:sol.oracleId,quantity:3,quantityFoil:2});
  d=await buildDriver({device,dpr:1});await open(d,'/login','form');
  await d.findElement(By.css('[formcontrolname=username]')).sendKeys(username);await d.findElement(By.css('[formcontrolname=password]')).sendKeys(password);await d.findElement(By.css('[formcontrolname=rememberMe]')).click();await d.findElement(By.css('button[type=submit]')).click();
  await d.wait(async()=>await d.executeScript('return !!sessionStorage.getItem("auth_token")'),10000);assert.equal(await d.executeScript('return localStorage.getItem("auth_token")'),null);
  await open(d,'/collection/'+col.id,'app-collection-tools');await d.findElement(By.xpath('//app-collection-tools//button[normalize-space(.)="Insights"]')).click();assert.equal((await d.findElements(By.css('app-collection-insights article'))).length,10);
  assert(await d.executeScript('return document.documentElement.scrollWidth<=innerWidth+1'));
  await save(d,device.id,'insights-restored');await d.findElement(By.xpath('//app-collection-tools//button[normalize-space(.)="Close insights"]')).click();
  await save(d,device.id,'before-card-open');
  await d.actions().doubleClick(await d.findElement(By.css('.card-wrap .ct-art'))).perform();await save(d,device.id,'after-card-open');await d.wait(until.elementLocated(By.css('app-card-modal app-owned-card-badge')),10000);await d.wait(async()=>(await d.findElement(By.css('app-card-modal app-owned-card-badge')).getText()).includes('Owned across collections:'),10000);
  await d.wait(until.elementLocated(By.css('app-card-modal app-card-community')),5000);await d.wait(async()=>!(await d.findElements(By.css('app-card-community [role=status]'))).length,30000);
  const community=await d.findElement(By.css('app-card-community'));assert(!(await community.getText()).includes('could not be loaded'));assert((await d.findElement(By.css('app-card-community .community-open')).getAttribute('href')).includes('/explore/cards/'+sol.oracleId));await d.executeScript('arguments[0].scrollIntoView({block:"center"})',community);await save(d,device.id,'card-community');
  await d.findElement(By.css('.modal-title-btn[title="Move this card to another collection"]')).click();await d.wait(until.elementLocated(By.css('.picker-modal')),5000);
  const name='Created while moving '+device.id;await d.findElement(By.css('.picker-modal input[maxlength="100"]')).sendKeys(name);
  const inputs=await d.findElements(By.css('.picker-modal input[type=number]'));assert.equal(inputs.length,2);for(const input of inputs){await input.clear();await input.sendKeys('1');}
  await save(d,device.id,'partial-move-restored');await d.findElement(By.css('.picker-confirm')).click();await d.wait(async()=>!(await d.findElements(By.css('.picker-overlay'))).length,15000);
  await d.wait(async()=>{const collection=await ok('collections/'+col.id);return collection.cards[0]?.quantity===2 && collection.cards[0]?.quantityFoil===1},10000);
  const target=(await ok('collections')).find(c=>c.name===name);assert(target);const moved=await ok('collections/'+target.id);assert.equal(moved.cards[0].quantity,1);assert.equal(moved.cards[0].quantityFoil,1);
  await d.wait(until.elementLocated(By.css('.collection-undo-banner button')),3000);await d.findElement(By.css('.collection-undo-banner button')).click();
  await d.wait(async()=>{const collection=await ok('collections/'+col.id);return collection.cards[0]?.quantity===3 && collection.cards[0]?.quantityFoil===2},10000);assert.equal((await ok('collections/'+target.id)).cards.length,0);
  await save(d,device.id,'move-undone');
  await d.findElement(By.css('app-collection-detail .add-btn')).click();const search=await d.wait(until.elementLocated(By.css('app-card-search-panel .search-input')),5000);await search.sendKeys('Sol Ring');await d.findElement(By.css('app-card-search-panel .copy-language select option[value=ja]')).click();
  const menu=await d.wait(until.elementLocated(By.css('app-card-search-panel .result-set-menu .asm-btn')),15000);await menu.click();await d.wait(until.elementLocated(By.css('.asm-menu .app-menu-item')),10000);await d.findElement(By.css('.asm-menu .app-menu-item')).click();
  const addButtons=await d.findElements(By.css('app-card-search-panel button[title="Add regular"],app-card-search-panel .add-result-btn'));let add;for(const button of addButtons)if(await button.isDisplayed()){add=button;break;}assert(add);await add.click();
  const copies=async()=> (await ok('collections/'+col.id)).cards.reduce((n,c)=>n+c.quantity+c.quantityFoil,0);
  await d.wait(async()=>await copies()===6,10000);assert.equal((await ok('collections/'+col.id)).cards.find(c=>c.language==='ja')?.quantity,1);await d.wait(until.elementLocated(By.css('app-card-search-panel .undo-add')),5000);await save(d,device.id,'undo-last-add');await d.findElement(By.css('app-card-search-panel .undo-add')).click();await d.wait(async()=>await copies()===5,10000);
  await ok('collections/'+col.id+'/cards',{oracleId:sol.oracleId,quantity:4,quantityFoil:0,language:'ja'});
  await open(d,'/collection/'+col.id,'app-collection-tools');await d.actions().doubleClick(await d.findElement(By.css('.card-wrap[data-card-id="'+row.id+'"] .ct-art'))).perform();await d.wait(until.elementLocated(By.css('app-card-modal .copy-language select')),10000);
  await d.findElement(By.css('app-card-modal .copy-language select option[value=ja]')).click();await d.wait(async()=>(await d.findElement(By.css('app-card-modal .copy-language-counts')).getText()).includes('4 normal'),5000);
  await d.findElement(By.xpath('//app-card-modal//div[contains(@class,"modal-extra-wrap--top")]//button[contains(normalize-space(.),"Normal")]')).click();await d.wait(async()=>{const cards=(await ok('collections/'+col.id)).cards;return cards.find(c=>c.language==='ja')?.quantity===5 && cards.find(c=>(c.language??'en')==='en')?.quantity===3},10000);
  await d.findElement(By.css('app-card-modal .copy-language select option[value=en]')).click();await d.wait(async()=>(await d.findElement(By.css('app-card-modal .copy-language-counts')).getText()).includes('3 normal · 2 foil'),5000);assert(await d.executeScript('return document.querySelector("app-card-modal .copy-language select").getBoundingClientRect().width>=140'));await save(d,device.id,'language-context');

  await ok('collections/'+col.id+'/cards',{oracleId:sol.oracleId,quantity:0,quantityFoil:0,quantityEtched:3});
  await open(d,'/collection/'+col.id,'app-collection-tools');await d.actions().doubleClick(await d.findElement(By.css('.card-wrap[data-card-id="'+row.id+'"] .ct-art'))).perform();
  await d.wait(until.elementLocated(By.css('app-card-modal .copy-language-counts')),10000);
  await d.wait(async()=>(await d.findElement(By.css('app-card-modal .copy-language-counts')).getText()).includes('3 etched'),5000);
  await d.findElement(By.xpath('//app-card-modal//button[normalize-space(.)="+ Etched"]')).click();
  await d.wait(async()=>(await ok('collections/'+col.id)).cards.find(c=>c.id===row.id)?.quantityEtched===4,10000);
  await d.findElement(By.xpath('//app-card-modal//button[normalize-space(.)="Owned details"]')).click();
  await d.wait(until.elementLocated(By.css('app-collection-metadata select[name=finish]')),5000);
  await d.findElement(By.css('app-collection-metadata select[name=finish] option[value=etched]')).click();
  await d.wait(until.elementLocated(By.css('app-collection-metadata textarea[name=finishNotes]')),5000);
  const finishNotes=await d.findElement(By.css('app-collection-metadata textarea[name=finishNotes]'));await finishNotes.sendKeys('Etched copy only');
  const finishPrice=await d.findElement(By.css('app-collection-metadata input[name=purchasePrice]'));await finishPrice.clear();await finishPrice.sendKeys('4.25');
  await save(d,device.id,'etched-details');await d.findElement(By.css('app-collection-metadata form button')).click();
  await d.wait(async()=>(await ok('collections/'+col.id+'/cards/'+row.id+'/metadata?finish=etched')).notes==='Etched copy only',10000);
  assert.notEqual((await ok('collections/'+col.id+'/cards/'+row.id+'/metadata?finish=nonfoil')).notes,'Etched copy only');
  const csv=await ok('collections/'+col.id+'/export?format=csv');assert(csv.includes('etched'));assert(csv.includes('Etched copy only'));
  await d.findElement(By.xpath('//app-card-modal//button[normalize-space(.)="History"]')).click();
  await d.wait(async()=>(await d.findElement(By.css('app-card-history-panel')).getText()).includes('etched'),10000);
  await save(d,device.id,'etched-history');
  console.log(device.id+': session-only login, reload, insights, global ownership and partial move to a new collection, transfer undo, and last-add undo, and language-specific additions/quantities passed.');await d.quit();d=null;
 }
 }finally{if(d)await d.quit();if(token)await ok('account',{password},'DELETE');console.log('Disposable parity account removed.');}})().catch(e=>{console.error(e);process.exitCode=1});
