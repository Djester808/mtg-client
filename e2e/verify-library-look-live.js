const assert=require('assert/strict');
const {By,until}=require('selenium-webdriver');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const t=new LibraryTable('Private library look live',"40 Mountain\n20 Sensei's Divining Top",'library-look');
 try{
  await t.start();let actor=-1;
  for(let n=0;n<220;n++){
   const v=t.views[0],i=t.seat(v.activePlayer.value),own=t.views[i];
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value){
    const p=own.players.find(p=>p.id.value===own.viewer.value),land=own.hand.find(c=>c.name==='Mountain');
    if(p.landsPlayedThisTurn===0&&land){await t.command(i,{kind:'playLand',card:land.id.value});continue;}
    const lands=own.battlefield.filter(c=>c.name==='Mountain'&&c.controller.value===own.viewer.value&&!c.tapped);
    const top=own.battlefield.find(c=>c.name==="Sensei's Divining Top"&&c.controller.value===own.viewer.value);
    const held=own.hand.find(c=>c.name==="Sensei's Divining Top");
    if(!top&&held&&lands.length){await t.command(i,{kind:'activate',source:lands[0].id.value,abilityIndex:0});await t.command(i,{kind:'cast',card:held.id.value,faceIndex:0});continue;}
    if(top&&lands.length){await t.command(i,{kind:'activate',source:lands[0].id.value,abilityIndex:0});await t.command(i,{kind:'activate',source:top.id.value,abilityIndex:0});actor=i;break;}
   }
   await t.advance();
  }
  assert(actor>=0);
  for(let n=0;n<10&&!t.views[actor].lastLook;n++)await t.advance();
  assert.equal(t.views[actor].lastLook.cards.length,3);
  assert.equal(t.views[1-actor].lastLook,null);
  assert.equal(t.views[1-actor].lastReveal,null);
  assert.equal(t.views[actor].inspectedLibraryCards.length,3);
  assert.equal(t.views[1-actor].inspectedLibraryCards.length,0);
  await t.drivers[actor].navigate().refresh();await t.dismiss(t.drivers[actor]);
  await t.drivers[actor].wait(until.elementLocated(By.css('[data-active-inspection] summary')),15000);
  await t.drivers[actor].findElement(By.css('[data-active-inspection] summary')).click();
  assert.equal((await t.drivers[actor].findElements(By.css('[data-active-inspection] button'))).length,3);
  await t.shot(actor,'active');
  const inspectionDriver=t.drivers[actor];
  for(const [width,height,label] of [[375,667,'portrait'],[667,375,'landscape']]){
   await inspectionDriver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
   if(label==='portrait'){
    assert((await inspectionDriver.findElement(By.css('body')).getText()).includes('Turn your phone sideways'));
    assert(await inspectionDriver.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
    await t.shot(actor,'active-'+label);
    continue;
   }
   const summary=await inspectionDriver.findElement(By.css('[data-active-inspection] summary'));
   await inspectionDriver.executeScript('arguments[0].scrollIntoView({block:"center"})',summary);
   assert((await summary.getText()).includes(t.views[actor].players.find(p=>p.id.value===t.views[actor].viewer.value).name));
   assert(await inspectionDriver.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
   const buttons=await inspectionDriver.findElements(By.css('[data-active-inspection] button'));
   for(const button of buttons){
    await inspectionDriver.executeScript('arguments[0].scrollIntoView({block:"center"})',button);
    assert(await button.isDisplayed());
    assert((await button.getRect()).height>=44);
   }
   await inspectionDriver.executeScript('arguments[0].scrollIntoView({block:"center"})',summary);
   await t.shot(actor,'active-'+label);
   await summary.click();
   await summary.click();
  }
  await inspectionDriver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
  await inspectionDriver.findElement(By.css('[data-active-inspection] summary')).click();
  const pending=t.views[actor].pending;
  assert.equal(pending.kind,'library-top-order');
  const orderButtons=await t.drivers[actor].findElements(By.css('app-choice-controls .choice'));
  assert.equal(orderButtons.length,3);
  for(const button of [...orderButtons].reverse())await button.click();
  await t.drivers[actor].findElement(By.css('app-choice-controls .confirm')).click();
  await t.wait(()=>t.views.every(v=>v.pending?.id.value!==pending.id.value));
  assert.equal(t.views[actor].inspectedLibraryCards.length,0);
  assert.equal(t.views[1-actor].inspectedLibraryCards.length,0);
  for(let i=0;i<2;i++){await t.drivers[i].navigate().refresh();await t.dismiss(t.drivers[i]);await t.drivers[i].wait(until.elementLocated(By.css('.self-table .life')),15000);}
  const d=t.drivers[actor];await d.wait(until.elementLocated(By.css('app-library-reveal summary')),10000);
  assert((await d.findElement(By.css('app-library-reveal summary')).getText()).includes('only you'));
  assert.equal((await t.drivers[1-actor].findElements(By.css('app-library-reveal summary'))).length,0);
  await d.findElement(By.css('app-library-reveal summary')).click();
  assert.equal((await d.findElements(By.css('app-library-reveal button'))).length,3);
  await t.shot(actor,'private');await t.shot(1-actor,'opponent');
  await d.findElement(By.css('app-library-reveal button')).click();await d.wait(until.elementLocated(By.css('app-card-modal .card-modal')),5000);
  await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});
  assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
  await t.shot(actor,'details-landscape');
  console.log('PASS: private look details, no opponent disclosure, reconnect and landscape capture');
 }catch(e){for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}finally{await t.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
