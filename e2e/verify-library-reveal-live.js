const assert=require('assert/strict');
const {By,until}=require('selenium-webdriver');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const t=new LibraryTable('Library reveal live','40 Mountain\n20 Expedition Map','library-reveal');
 try{
  await t.start();let actor=-1;
  for(let n=0;n<220;n++){
   const v=t.views[0],i=t.seat(v.activePlayer.value),own=t.views[i];
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value){
    const player=own.players.find(p=>p.id.value===own.viewer.value);
    const land=own.hand.find(c=>c.name==='Mountain');
    if(player.landsPlayedThisTurn===0&&land){await t.command(i,{kind:'playLand',card:land.id.value});continue;}
    const lands=own.battlefield.filter(c=>c.name==='Mountain'&&c.controller.value===own.viewer.value&&!c.tapped);
    const map=own.battlefield.find(c=>c.name==='Expedition Map'&&c.controller.value===own.viewer.value);
    const held=own.hand.find(c=>c.name==='Expedition Map');
    if(!map&&held&&lands.length){await t.command(i,{kind:'activate',source:lands[0].id.value,abilityIndex:0});await t.command(i,{kind:'cast',card:held.id.value,faceIndex:0});continue;}
    if(map&&lands.length>=2){for(const l of lands.slice(0,2))await t.command(i,{kind:'activate',source:l.id.value,abilityIndex:0});await t.command(i,{kind:'activate',source:map.id.value,abilityIndex:0});actor=i;break;}
   }
   await t.advance();
  }
  assert(actor>=0);
  for(let n=0;n<10&&!t.views[actor].pending;n++)await t.advance();
  const choice=t.views[actor].pending;assert.equal(choice.kind,'search');
  assert.equal(t.views[1-actor].choiceCards.length,0);
  await t.command(actor,{kind:'answer',choice:choice.id.value,answer:[choice.options[0].id]});
  for(let i=0;i<2;i++){
   assert.equal(t.views[i].lastReveal.cards.length,1);
   assert.equal(t.views[i].lastReveal.cards[0].name,'Mountain');
   assert(!('id' in t.views[i].lastReveal.cards[0]));
   const d=t.drivers[i];await d.navigate().refresh();await t.dismiss(d);
   await d.wait(until.elementLocated(By.css('app-library-reveal summary')),15000);
   await d.findElement(By.css('app-library-reveal summary')).click();
   const button=await d.findElement(By.css('app-library-reveal button'));assert((await button.getText()).includes('Mountain'));
   await button.click();await d.wait(until.elementLocated(By.css('app-card-modal .card-modal')),5000);
   await t.shot(i,'details-'+i);
  }
  await t.drivers[0].sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});
  assert(await t.drivers[0].executeScript('return document.documentElement.scrollWidth <= innerWidth'));
  await t.shot(0,'landscape');
  console.log('PASS: public selected-card reveal, private remaining library, both-player details and refresh');
 }catch(e){for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}finally{await t.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
