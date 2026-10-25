// Four live browsers: opening rounds, private choices, refresh, and first draw.
const fs = require('fs'), assert = require('assert/strict'), signalR = require('@microsoft/signalr');
const {By, until, Key} = require('selenium-webdriver');
const {api, signIn, userIdFromToken} = require('./helpers/board-driver');
const {buildDriver} = require('./helpers/driver');
const {baseUrl} = require('./config');
(async () => {
 const tokens=[], decks=[], hubs=[], browsers=[], views=[]; let gameId;
 const commander = process.argv.includes('--commander');
 const partners = process.argv.includes('--partners');
 const ordering = process.argv.includes('--ordering');
 const format = commander ? 'commander' : 'casual';
 const landName = partners ? 'Wastes' : 'Mountain';
 const players=['a','b','c','d'].map(s=>({username:'library_smoke_'+s,password:'LibrarySmoke-test-2026!'}));
 const wait = fn => browsers[0].wait(fn,15000);
 const shot = async (i,name)=>fs.writeFileSync('e2e/screenshots/library-live-'+name+'.png',await browsers[i].takeScreenshot(),'base64');
 const dismiss = async d => {const skip=await d.findElements(By.css('.intro-skip'));if(skip.length)await skip[0].click();await d.wait(async()=>!(await d.findElements(By.css('.brand-intro'))).length,12000);};
 const answer = async label => {
   const pending=views[0].pending; assert(pending,'Expected choice');
   const actor=views.findIndex(v=>v.viewer.value===pending.player.value);
   await dismiss(browsers[actor]);
   await browsers[actor].wait(async()=> {
     const buttons=await browsers[actor].findElements(By.css('app-choice-controls .choice'));
     for(const button of buttons)if((await button.getText()).trim()===label){await button.click();return true;}
     return false;
   },10000);
   await wait(()=>views.length===4&&views.every(v=>v.pending?.id.value!==pending.id.value));
   return actor;
 };
 try {
   for(const player of players){
     const token=await signIn(player);tokens.push(token);
     const name=commander?(partners?'Library commander pair smoke':'Library commander smoke'):'Library multiplayer smoke';
     const choices=await api(token,'GET','/api/games/lobbies/decks');
     let deck=choices.find(d=>d.name===name);
     if(!deck)deck=(await api(token,'POST','/api/decks/import',{name,text:commander?(partners?'1 Thrasios, Triton Hero\n1 Tymna the Weaver\n98 Wastes':'1 Etali, Primal Storm\n99 Mountain'):'60 Mountain',format})).deck;
     if(commander){
       const detail=await api(token,'GET','/api/decks/'+deck.id);
       const first=detail.cards.find(c=>c.cardDetails?.name===(partners?'Thrasios, Triton Hero':'Etali, Primal Storm'));
       const second=detail.cards.find(c=>c.cardDetails?.name==='Tymna the Weaver');
       assert(first&&(!partners||second),'Designated commanders imported');
       await api(token,'PUT','/api/decks/'+deck.id,{name,format,commanderOracleId:first.oracleId,secondaryCommanderOracleId:partners?second.oracleId:null});
     }
     decks.push(deck.id);
   }
   let table=await api(tokens[0],'POST','/api/games/lobbies',{deckId:decks[0],capacity:4,format,startingLife:40,allowHonourSystem:true,invitees:tokens.slice(1).map(userIdFromToken)});
   for(let i=1;i<4;i++)table=await api(tokens[i],'POST','/api/games/lobbies/'+table.id+'/deck',{deckId:decks[i],revision:table.revision});
   gameId=(await api(tokens[0],'POST','/api/games/lobbies/'+table.id+'/start',{revision:table.revision})).gameId;
   console.log('Table',gameId);
   for(let i=0;i<4;i++){
     const hub=new signalR.HubConnectionBuilder().withUrl(baseUrl+'/hubs/game',{accessTokenFactory:()=>tokens[i]}).configureLogging(signalR.LogLevel.Error).build();hubs.push(hub);
     hub.on('ViewUpdated',view=>{views[i]=view;});hub.on('Log',()=>{});await hub.start();await hub.invoke('Join',gameId);
     const d=await buildDriver();browsers.push(d);await d.get(baseUrl+'/login');await d.executeScript('localStorage.setItem("auth_token",arguments[0]);localStorage.setItem("auth_username",arguments[1]);',tokens[i],players[i].username);await d.get(baseUrl+'/game/'+gameId);await d.wait(until.elementLocated(By.css('.self-table .life')),20000);await dismiss(d);
   }
   assert(views.every(v=>v.turnNumber===0&&v.hand.length===7));
   if(commander) {
     assert(views.every(v=>v.players.every(p=>p.life===40)), 'Commander starting life is 40');
     const expected=partners?['Thrasios, Triton Hero','Tymna the Weaver']:['Etali, Primal Storm'];
     for(const view of views){
       for(const player of view.players)assert.deepEqual(player.command.map(c=>c.name).sort(),[...expected].sort(),'Designated commanders begin in command');
       assert(!view.hand.some(c=>expected.includes(c.name)),'Commander is excluded from opening hand');
     }
     assert(views.every(v=>v.players.every(p=>p.libraryCount===(partners?91:92)))); console.log('PASS: four Commander decks admitted with expected libraries after opening draws'); }
   const original=views.map(v=>v.hand.map(c=>c.id.value));
   for(let i=0;i<3;i++){await answer('Mulligan');views.forEach((v,j)=>assert.deepEqual(v.hand.map(c=>c.id.value),original[j]));}
   await answer('Mulligan');assert(views.every(v=>v.hand.length===7));console.log('PASS: all four declarations precede redraw; first mulligan keeps seven');
   const actor=await answer('Mulligan');for(let i=0;i<3;i++)await answer('Keep');
   assert.equal(views[actor].pending.kind,'mulligan-bottom');assert.equal(views[actor].pending.options.length,7);
   for(let i=0;i<4;i++)if(i!==actor)assert.equal(views[i].pending.options.length,0);
   await browsers[actor].navigate().refresh();await browsers[actor].wait(until.elementLocated(By.css('app-choice-controls .choice')),20000);await dismiss(browsers[actor]);await shot(actor,'private-bottom');
   await browsers[actor].sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});
   await browsers[actor].sleep(400);
   assert(await browsers[actor].executeScript('return document.documentElement.scrollWidth <= innerWidth'),'Landscape choice must fit document');
   await shot(actor,'choice-landscape');
   await browsers[actor].sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
   const beforeDetails=views[actor].pending.id.value;
   const details=await browsers[actor].findElement(By.css('app-choice-controls .choice-details'));
   await details.click();
   await browsers[actor].wait(until.elementLocated(By.css('dialog.card-preview-panel[open]')),5000);
   assert.equal(views[actor].pending.id.value,beforeDetails,'Details must not submit the choice');
   await shot(actor,'choice-details');
   await browsers[actor].actions().sendKeys(Key.ESCAPE).perform();
   await answer(landName);
   if(ordering){
     await answer('Mulligan');
     assert.equal(views[actor].pending.kind,'mulligan-bottom');
     assert.equal(views[actor].pending.min,2);
     const pendingId=views[actor].pending.id.value;
     const selected=views[actor].pending.options.slice(0,2);
     const cards=await browsers[actor].findElements(By.css('app-choice-controls .choice'));
     await cards[0].click();await cards[1].click();
     const earlier=await browsers[actor].findElements(By.css('.choice-order button:first-child'));
     assert.equal(earlier.length,2,'Two selected cards expose ordering controls');
     await earlier[1].click();
     assert((await cards[0].getText()).trim().startsWith('2.'),'First selected card moved later');
     assert((await cards[1].getText()).trim().startsWith('1.'),'Second selected card moved earlier');
     assert.equal(views[actor].pending.id.value,pendingId,'Reordering must not submit');
     await shot(actor,'two-card-bottom-order');
     await browsers[actor].findElement(By.css('app-choice-controls .confirm')).click();
     await wait(()=>views.every(v=>v.pending?.id.value!==pendingId));
     assert.equal(views[actor].hand.length,5);
     for(const option of selected)assert(!views[actor].hand.some(card=>card.id.value===option.object.value),'Chosen card left hand');
     console.log('PASS: two-card bottom choice exposes working reorder controls and submits once');
   }
   await answer('Keep');await wait(()=>views.every(v=>v.turnNumber===1));
   const keptCount=ordering?5:6;
   assert.equal(views[actor].hand.length,keptCount);assert.equal(views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount,(commander?(partners?98:99):60)-keptCount);
   if(commander) assert(views.every(v=>v.players.every(p=>p.command.length===(partners?2:1))), 'Commanders stay in command zones');
   for(let pass=0;pass<4;pass++){
     const holder=views.findIndex(v=>v.viewer.value===v.priorityHolder?.value);
     assert(holder>=0,'A seat holds upkeep priority');
     const before=views.map(v=>JSON.stringify(v));
     await browsers[holder].findElement(By.css('.action-btn.pass')).click();
     await wait(()=>views.every((v,index)=>JSON.stringify(v)!==before[index]));
   }
   const active=views.findIndex(v=>v.viewer.value===v.activePlayer.value);
   assert(active>=0,'Active viewer exists');
   assert.equal(views[active].hand.length,active===actor?keptCount+1:8);
   assert.equal(views[active].players.find(p=>p.id.value===views[active].viewer.value).libraryCount,
     (commander?(partners?98:99):60)-views[active].hand.length);
   console.log('PASS: multiplayer starting player draws on turn one after all four upkeep passes');
   await shot(actor,'kept');console.log('PASS: bottom choice privacy, refresh recovery and pre-draw hand/library counts verified');
 } catch(error){for(let i=0;i<browsers.length;i++)await shot(i,'failure-'+i).catch(()=>{});throw error;}
 finally {if(gameId)for(const hub of hubs)if(hub.state===signalR.HubConnectionState.Connected)await hub.invoke('Command',gameId,{kind:'concede'}).catch(()=>{});for(const d of browsers)await d.quit();for(const h of hubs)await h.stop();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
