// Two or four live seats; legal setup, browser ordering and privacy checks.
const assert=require('assert/strict');
const {By,until}=require('selenium-webdriver');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const seats=process.argv.includes('--four-seats')?4:2;
 const table=new LibraryTable('Library scry live','60 Castle Vantress',seats===4?'library-scry-four':'library-scry-v2',seats);
 const {drivers,views,wait,shot,dismiss,command,seat,advance}=table;
 try{
  await table.start();
  let actor=-1;
  for(let step=0;step<400*seats;step++){
   const v=views[0],i=seat(v.activePlayer.value),own=views[i];
   const lands=own.battlefield.filter(c=>c.controller.value===own.viewer.value&&c.name==='Castle Vantress');
   if(v.priorityHolder?.value===v.activePlayer.value&&lands.filter(c=>!c.tapped).length>=5){actor=i;break;}
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value&&own.players.find(p=>p.id.value===own.viewer.value).landsPlayedThisTurn===0){await command(i,{kind:'playLand',card:own.hand[0].id.value});}
   else await advance();
  }
  assert(actor>=0,'Reached five untapped lands through legal turns');
  const lands=views[actor].battlefield.filter(c=>c.controller.value===views[actor].viewer.value&&!c.tapped);
  for(const land of lands.slice(0,4))await command(actor,{kind:'activate',source:land.id.value,abilityIndex:1});
  await command(actor,{kind:'activate',source:lands[4].id.value,abilityIndex:2});
  for(let n=0;n<2*seats+2&&!views[actor].pending;n++)await advance();
  assert.equal(views[actor].pending.kind,'scry');
  assert.equal(views[actor].inspectedLibraryCards.length,2);
  assert(views.every((v,i)=>i===actor||v.inspectedLibraryCards.length===0));
  const observers=views.filter((v,i)=>i!==actor);
  assert.equal(views[actor].choiceCards.length,2);assert(observers.every(v=>v.choiceCards.length===0&&v.pending.options.length===0));
  await drivers[actor].wait(until.elementLocated(By.css('app-choice-controls .cancel')),5000);
  await drivers[actor].findElement(By.css('app-choice-controls .cancel')).click();
  await wait(()=>views[actor].pending?.kind==='library-top-order');
  const offered=views[actor].pending.options.map(o=>o.id),pending=views[actor].pending.id.value;
  await drivers[actor].navigate().refresh();await drivers[actor].wait(until.elementLocated(By.css('app-choice-controls .choice')),15000);await dismiss(drivers[actor]);
  assert.equal(views[actor].pending.id.value,pending);
  const cards=await drivers[actor].findElements(By.css('app-choice-controls .choice'));await cards[0].click();await cards[1].click();
  const earlier=await drivers[actor].findElements(By.css('.choice-order button:first-child'));await earlier[1].click();
  assert((await cards[1].getText()).trim().startsWith('1.'));
  await drivers[actor].wait(until.elementLocated(By.css('[data-active-inspection]')),5000);
  await shot(actor,'top-order');
  await drivers[actor].sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});await drivers[actor].sleep(300);assert(await drivers[actor].executeScript('return document.documentElement.scrollWidth <= innerWidth'));await shot(actor,'top-order-landscape');await drivers[actor].sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
  await drivers[actor].findElement(By.css('app-choice-controls .confirm')).click();await wait(()=>views.every(v=>!v.pending&&v.stack.length===0));
  assert(views.every(v=>v.inspectedLibraryCards.length===0));
  assert(views.every(v=>v.choiceCards.length===0));
  const completedTurn=views[actor].turnNumber;
  const libraryBeforeDraw=views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount;
  let ready=false;
  for(let n=0;n<120*seats;n++){
   const v=views[actor];
   if(v.turnNumber>completedTurn&&v.activePlayer.value===v.viewer.value&&v.priorityHolder?.value===v.viewer.value&&v.step==='Upkeep'){ready=true;break;}
   await advance();
  }
  assert(ready,'Reached next upkeep before drawing');
  const available=views[actor].battlefield.filter(c=>c.controller.value===views[actor].viewer.value&&!c.tapped);
  for(const land of available.slice(0,4))await command(actor,{kind:'activate',source:land.id.value,abilityIndex:1});
  await command(actor,{kind:'activate',source:available[4].id.value,abilityIndex:2});
  for(let n=0;n<2*seats+2&&!views[actor].pending;n++)await advance();
  assert.equal(views[actor].pending.kind,'scry');
  assert.equal(views[actor].inspectedLibraryCards.length,2);
  assert(views.every((v,i)=>i===actor||v.inspectedLibraryCards.length===0));
  assert.equal(views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount,libraryBeforeDraw-1,'Exactly one normal draw occurred between scries');
  assert.equal(views[actor].pending.options[0].id,offered[0],'The card ordered second is now on top after drawing the first');
  assert(!views[actor].pending.options.some(o=>o.id===offered[1]),'The card ordered first was drawn');
  assert(views.every((v,i)=>i===actor||v.choiceCards.length===0));
  table.assertChoicePrivacy();console.log('PASS: subsequent scry after one draw confirms server top order and stable remaining card identity');
  table.assertChoicePrivacy();console.log('PASS: live scry 2, private top-order prompt, refresh, reorder controls and completion', {seats, offered:offered.length});
 }catch(e){for(let i=0;i<drivers.length;i++)await shot(i,'failure-'+i).catch(()=>{});throw e;}
 finally{await table.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
