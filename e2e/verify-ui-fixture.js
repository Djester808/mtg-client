// Real account and collection parity checks. Uses only disposable accounts.
const fs=require('fs'),path=require('path'),https=require('https'),assert=require('assert/strict');const root=__dirname+'/';const {By,until}=require(root+'node_modules/selenium-webdriver'),{buildDriver}=require(root+'helpers/driver'),devices=require(root+'devices');let token;fs.mkdirSync(path.join(__dirname,'screenshots','parity-port'),{recursive:true});
const {api,ok}=require(root+'helpers/parity-api').createParityApi(()=>token);
async function open(d,route,ready){await d.get('http://127.0.0.1:4200'+route);await d.wait(until.elementLocated(By.css('.intro-skip')),15000);await d.findElement(By.css('.intro-skip')).click();await d.wait(async()=>!(await d.findElements(By.css('.brand-intro'))).length,15000);if(ready)await d.wait(until.elementLocated(By.css(ready)),20000);}
async function save(d,device,state){await d.executeAsyncScript('document.fonts.ready.then(arguments[0]);');fs.writeFileSync(path.join(__dirname,'screenshots','parity-port',device+'-'+state+'.png'),await d.takeScreenshot(),'base64')}


const cp=require('child_process');
(async()=>{const username='visual_'+Date.now(),password='VisualTest!'+Date.now();try{
 token=(await ok('auth/register',{username,email:username+'@example.test',password,acceptedTerms:true})).token;
 const commander=await ok('cards/by-name?name=Atraxa%2C%20Praetors%27%20Voice');const deck=await ok('decks',{name:'Visual verification',format:'commander',commanderOracleId:commander.oracleId});
 for(const name of ['Forest','Avenger of Zendikar',"Elspeth, Sun's Champion"]){const card=await ok('cards/by-name?name='+encodeURIComponent(name));await ok('decks/'+deck.id+'/cards',{oracleId:card.oracleId,quantity:name==='Forest'?96:1,quantityFoil:0});}
 const col=await ok('collections',{name:'Visual verification collection'});const sol=await ok('cards/by-name?name=Sol%20Ring');await ok('collections/'+col.id+'/cards',{oracleId:sol.oracleId,quantity:3,quantityFoil:2,quantityEtched:1});
 const env={...process.env,E2E_USERNAME:username,E2E_PASSWORD:password,E2E_DECK_ID:deck.id,E2E_COLLECTION_ID:col.id};
 console.log('Disposable visual fixture: '+username);
 const commands=process.env.UI_PORT_COMMANDS??'npm run verify:ui';
 const result=cp.spawnSync('powershell.exe',['-NoProfile','-Command',commands],{cwd:__dirname+'/..',env,stdio:'inherit'});process.exitCode=result.status??1;
}finally{if(token){token=(await ok('auth/login',{username,password,rememberMe:false})).token;await ok('account',{password},'DELETE');}console.log('Disposable visual account removed.');}})().catch(e=>{console.error(e);process.exitCode=1});
