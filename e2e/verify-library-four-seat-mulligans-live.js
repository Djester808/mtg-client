const assert = require('assert/strict');
const { By } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
const { api } = require('./helpers/board-driver');
(async()=>{
 const commander=process.argv.includes('--commander');
 const t=new LibraryTable(commander?'Commander library opening hands':'Four-seat opening hands',commander?'1 Avacyn, Angel of Hope\n99 Plains':'60 Plains',commander?'library-commander-mulligans':'library-four-mulligans',4,commander?'commander':'casual');
 try {
  await t.start(commander ? async(token,id)=>{
   const deck=await api(token,'GET','/api/decks/'+id);
   const leader=deck.cards.find(card=>card.cardDetails?.name==='Avacyn, Angel of Hope');
   assert(leader,'Existing commander imported');
   await api(token,'PUT','/api/decks/'+id,{name:deck.name,format:'commander',commanderOracleId:leader.oracleId});
  } : undefined,false);
  if(commander) for(const view of t.views) {
   assert(view.hand.every(card=>card.name==='Plains'),'Commander excluded from opening hand');
   for(const player of view.players) {
    assert.equal(player.life,40);
    assert.equal(player.libraryCount,92);
    assert.equal(player.command.length,1);
    assert.equal(player.command[0].name,'Avacyn, Angel of Hope');
   }
  }
  const first=t.seat(t.views[0].pending.player.value);
  const second=(first+1)%4;
  const counts=Array(4).fill(0), wanted=Array(4).fill(0);wanted[first]=2;wanted[second]=1;
  let declarations=0,bottoms=0,freeVerified=false;
  const initial=t.views.map(v=>v.hand.map(c=>c.id.value));
  for(let n=0;n<16 && t.views[0].pending;n++){
   const p=t.views[0].pending,seat=t.seat(p.player.value),d=t.drivers[seat];
   for(let j=0;j<4;j++)if(j!==seat)assert.equal((t.views[j].pending?.options??[]).length,0,'Other seats cannot see private options');
   if(p.kind==='mulligan'){
    if(declarations===4){
     assert(t.views.every(v=>v.hand.length===7),'First multiplayer mulligan retains seven cards');
     assert.equal(bottoms,0);assert.equal(seat,first);
     assert.notDeepEqual(t.views[first].hand.map(c=>c.id.value),initial[first]);
     assert.notDeepEqual(t.views[second].hand.map(c=>c.id.value),initial[second]);
     for(let j=0;j<4;j++)if(!wanted[j])assert.deepEqual(t.views[j].hand.map(c=>c.id.value),initial[j]);
     freeVerified=true;await t.shot(seat,'free-mulligan');
    }
    const key=counts[seat]<wanted[seat]?'3':'4';
    await d.wait(async()=> (await d.findElements(By.css('app-choice-controls [aria-keyshortcuts="'+key+'"]'))).length>0,15000);
    await d.actions().sendKeys(key).perform();
    if(key==='3')counts[seat]++;
    declarations++;await t.wait(()=>t.views[0].pending?.id.value!==p.id.value);
    if(declarations<4)for(let j=0;j<4;j++)assert.deepEqual(t.views[j].hand.map(c=>c.id.value),initial[j],'No redraw before every declaration');
   }else if(p.kind==='mulligan-bottom'){
    assert(freeVerified);assert.equal(seat,first);assert.equal(t.views[seat].pending.min,1);bottoms++;
    await d.navigate().refresh();await t.dismiss(d);
    await d.wait(async()=> (await d.findElements(By.css('app-choice-controls .choice'))).length===7,20000);
    await t.shot(seat,'bottom-after-refresh');
    await d.findElement(By.css('app-choice-controls .choice')).click();
    await t.wait(()=>t.views[0].pending?.id.value!==p.id.value);
   }else throw Error('Unexpected choice '+p.kind);
  }
  assert(freeVerified);assert.equal(bottoms,1);assert.equal(t.views[0].pending,null);
  assert.deepEqual(counts,wanted);
  for(let i=0;i<4;i++)assert.equal(t.views[i].hand.length,i===first?6:7);
  if(commander) for(const view of t.views) for(const player of view.players) {
   assert.equal(player.libraryCount+player.handCount,99);
   assert.equal(player.command.length,1);
  }
  assert.equal(t.refused.length,0);t.assertChoicePrivacy();
  await t.shot(first,'completed');
  for(let n=0;n<20 && t.views[first].hand.length===6;n++)await t.advance();
  assert.equal(t.views[first].hand.length,7,'Starting player draws on turn one in multiplayer');
  assert.equal(t.views[first].turnNumber,1);
  await t.shot(first,'first-draw');
  console.log('PASS: four seats declare; first mulligan free; second bottoms one; refresh preserves private choice; kept players unchanged; starting player draws on turn one');
 }catch(e){for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}
 finally{await t.close();}
})().catch(e=>{console.error(e);process.exit(1);});
