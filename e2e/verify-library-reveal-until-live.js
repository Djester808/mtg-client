const assert=require('assert/strict');
const {By,until}=require('selenium-webdriver');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const t=new LibraryTable('Library replacement reveal until','40 Forest\n20 Abundance','library-reveal-until');
 try{
  await t.start();let actor=-1;
  for(let n=0;n<500;n++){
   const v=t.views[0];if(v.pending){actor=t.seat(v.pending.player.value);break;}
   const i=t.seat(v.activePlayer.value),own=t.views[i];
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value&&!v.stack.length){
    const p=own.players.find(p=>p.id.value===own.viewer.value),land=own.hand.find(c=>c.name==='Forest');
    if(!p.landsPlayedThisTurn&&land){await t.command(i,{kind:'playLand',card:land.id.value});continue;}
    const lands=own.battlefield.filter(c=>c.name==='Forest'&&c.controller.value===own.viewer.value&&!c.tapped);
    const held=own.hand.find(c=>c.name==='Abundance');
    if(held&&lands.length>=4&&!own.battlefield.some(c=>c.name==='Abundance'&&c.controller.value===own.viewer.value)){
     for(const land of lands.slice(0,4))await t.command(i,{kind:'activate',source:land.id.value,abilityIndex:0});
     await t.command(i,{kind:'cast',card:held.id.value,faceIndex:0});continue;
    }
   }
   await t.advance();
  }
  assert(actor>=0);let verifiedRemainder=false;
  for(let attempt=0;attempt<12;attempt++){
  actor=t.seat(t.views[0].pending.player.value);const d=t.drivers[actor],own=()=>t.views[actor].players.find(p=>p.id.value===t.views[actor].viewer.value);
  const beforeHand=t.views[actor].hand.length,beforeLibrary=own().libraryCount;
  let choseKind=false,orderedRemainder=false;
  for(let n=0;n<10&&t.views[actor].pending;n++){
   const p=t.views[actor].pending;
   const option=p.options.find(o=>o.label.toLowerCase()==='nonland');
   if(option){
    await d.navigate().refresh();await t.dismiss(d);
    await d.wait(until.elementLocated(By.css('app-choice-controls .choice')),15000);
    await t.shot(actor,'choice');
    const buttons=await d.findElements(By.css('app-choice-controls .choice'));
    for(const button of buttons)if((await button.getText()).trim().toLowerCase()==='nonland'){await button.click();choseKind=true;break;}
    await t.wait(()=>t.views[actor].pending?.id.value!==p.id.value);
   }else if(p.kind==='replacement-order')await t.command(actor,{kind:'answer',choice:p.id.value,answer:[p.options[0].id]});
   else if(p.kind==='may')await t.command(actor,{kind:'answer',choice:p.id.value,answer:['yes']});
   else if(p.kind==='library-top-order'||p.kind==='library-bottom-order'){
    orderedRemainder=true;
    await d.wait(until.elementLocated(By.css('app-choice-controls .choice')),15000);
    assert.equal((await d.findElements(By.css('app-choice-controls .choice img'))).length,p.options.length);
    assert.equal((await d.findElements(By.css('app-choice-controls .choice-details'))).length,p.options.length);
    await t.shot(actor,'remainder-order');
    const buttons=await d.findElements(By.css('app-choice-controls .choice'));
    for(const button of [...buttons].reverse())await button.click();
    await d.findElement(By.css('app-choice-controls .confirm')).click();
    await t.wait(()=>t.views[actor].pending?.id.value!==p.id.value);
   }
   else throw Error('Unexpected choice '+p.kind);
  }
  assert(choseKind);assert.equal(t.views[actor].pending,null);
  assert.equal(t.views[actor].hand.length,beforeHand+1);assert.equal(own().libraryCount,beforeLibrary-1);
  const reveal=t.views[actor].lastReveal;assert(reveal?.cards.length>0);
  assert.equal(reveal.cards.at(-1).name,'Abundance');
  assert(reveal.cards.slice(0,-1).every(c=>c.name==='Forest'));
  assert.deepEqual(t.views[1-actor].lastReveal,reveal);
  assert(t.views.every(v=>v.inspectedLibraryCards.length===0));t.assertChoicePrivacy();
  await t.shot(actor,'resolved');await t.shot(1-actor,'opponent');
  console.log('Revealed cards',reveal.cards.length,'ordered remainder',orderedRemainder);
  if(reveal.cards.length>=3){assert(orderedRemainder,'Two or more preceding cards require a bottom-order decision');verifiedRemainder=true;break;}
  for(let n=0;n<150;n++){
   if(t.views[0].pending && t.views[0].pending.kind!=='discard')break;
   await t.advance();
  }
  assert(t.views[0].pending,'Next replacement decision must arrive');
  }
  assert(verifiedRemainder,'Fixture must exercise at least two preceding cards');
  console.log('PASS: replacement choice survives refresh; RevealUntil reveals a nonempty prefix; bottom-order UI works; counts and public history agree; active access expires');
 }catch(e){for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}finally{await t.close();}
})().catch(e=>{console.error(e.stack);process.exit(1);});
