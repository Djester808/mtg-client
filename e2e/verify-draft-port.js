const BasePage = require('./pages/BasePage');
// Real account and collection parity checks. Uses only disposable accounts.
const fs=require('fs'),path=require('path'),https=require('https'),assert=require('assert/strict');const root=__dirname+'/';const {By,until}=require(root+'node_modules/selenium-webdriver'),{buildDriver}=require(root+'helpers/driver'),devices=require(root+'devices');let token;fs.mkdirSync(path.join(__dirname,'screenshots','parity-port'),{recursive:true});
const {api,ok}=require(root+'helpers/parity-api').createParityApi(()=>token);
async function open(d, route, ready) {
  // Shared navigation honors config.baseUrl / BASE_URL and safely dismisses the intro.
  await new BasePage(d).navigate(route);
  if (ready) await d.wait(until.elementLocated(By.css(ready)), 20000);
}
async function save(d,device,state){await d.executeAsyncScript('document.fonts.ready.then(arguments[0]);');fs.writeFileSync(path.join(__dirname,'screenshots','parity-port',device+'-'+state+'.png'),await d.takeScreenshot(),'base64')}


const {armAiBuildReplay}=require('./helpers/ai-build-replay');
(async()=>{const username='draft_'+Date.now(),password='DraftTest!'+Date.now();let d;try{
 token=(await ok('auth/register',{username,email:username+'@example.test',password,acceptedTerms:true})).token;
 const deck=await ok('decks',{name:'Draft and stats verification'});
 for(const name of ['Forest','Avenger of Zendikar','Chandra, Torch of Defiance']){const card=await ok('cards/by-name?name='+encodeURIComponent(name));await ok('decks/'+deck.id+'/cards',{oracleId:card.oracleId,quantity:1,quantityFoil:0});}
 for(const device of devices.filter(x=>['iphone-se','ipad-mini','desktop'].includes(x.id)&&(!process.env.PORT_DEVICE||x.id===process.env.PORT_DEVICE))){
  d=await buildDriver({device,dpr:1});await armAiBuildReplay(d);await open(d,'/login','form');await d.findElement(By.css('[formcontrolname=username]')).sendKeys(username);await d.findElement(By.css('[formcontrolname=password]')).sendKeys(password);await d.findElement(By.css('button[type=submit]')).click();await d.wait(async()=>await d.executeScript('return !!localStorage.getItem("auth_token")'),10000);
  await open(d,'/deck/'+deck.id,'.publish-btn');await d.findElement(By.css('button.publish-btn')).click();const text='Unpublished '+device.id+' notes';await d.findElement(By.css('.publish-modal-textarea')).sendKeys(text);await d.findElement(By.css('.publish-modal-cancel')).click();
  await open(d,'/deck/'+deck.id,'.publish-btn');await d.findElement(By.css('button.publish-btn')).click();assert.equal(await d.findElement(By.css('.publish-modal-textarea')).getAttribute('value'),text);await save(d,device.id,'publication-draft');await d.findElement(By.css('.publish-modal-cancel')).click();
  await d.findElement(By.css('button[title=Stats]')).click();await d.wait(until.elementLocated(By.css('.stats-extras')),10000);const stats=await d.findElement(By.css('.stats-section'));try {
    await d.wait(until.elementIsVisible(stats),10000);
    await d.wait(async()=>(await stats.getText()).includes('Forest'),10000,'Seeded Forest did not appear in visible stats');
  } catch(error) {
    await save(d,device.id,'stats-failure-before-wait');
    console.log('STATS DIAGNOSTIC '+JSON.stringify(await d.executeScript('return [...document.querySelectorAll(".stats-section,.stats-extras")].map(e=>({cls:e.className,text:e.textContent,visibleText:e.innerText,rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility}))')));
    console.log('API FIXTURE '+JSON.stringify((await ok('decks/'+deck.id)).cards.map(c=>({name:c.cardDetails?.name,quantity:c.quantity}))));
    throw error;
  }
const readout=await stats.getText();assert(readout.includes('Forest'));assert(readout.toLowerCase().includes('tokens needed'));assert(readout.toLowerCase().includes('emblem sources'));await d.executeScript('arguments[0].scrollIntoView({block:"start"})',await d.findElement(By.css('.stats-extras')));await save(d,device.id,'deck-extra-readouts');
  await open(d,'/deck/build','.ab-textarea');const brief=await d.findElement(By.css('.ab-textarea'));await brief.clear();await brief.sendKeys('wolf tribal draft '+device.id);await d.findElement(By.css('.ab-go')).click();await d.wait(until.elementLocated(By.css('.ab-cmd .ab-btn-primary')),20000);await d.findElement(By.css('.ab-cmd .ab-btn-primary')).click();await d.wait(until.elementLocated(By.css('.ab-row-btn')),30000);const count=(await d.findElements(By.css('.ab-row-btn'))).length;assert(count>0);
  await open(d,'/deck/build','.ab-row-btn');assert.equal((await d.findElements(By.css('.ab-row-btn'))).length,count);assert.equal(await d.executeScript('return window.__aiReplayHits.filter(url=>url.includes("commander-suggestions")||url.includes("ai-build/plan/stream")).length'),0);await save(d,device.id,'resumed-builder-plan');
  console.log(device.id+': publication draft survives reload; land/token/emblem readouts visible; completed builder plan resumes without another AI call.');await d.quit();d=null;
 }
}finally{if(d)await d.quit();if(token)await ok('account',{password},'DELETE');console.log('Disposable draft account removed.');}})().catch(e=>{console.error(e);process.exitCode=1});
