const assert=require('assert/strict');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const t=new LibraryTable('Library top search live','20 Forest\n20 Worldly Tutor\n20 Llanowar Elves','library-top-search');
 try{
  await t.start();let actor=-1;
  for(let n=0;n<160;n++){
   const v=t.views[0],i=t.seat(v.activePlayer.value),own=t.views[i];
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value){
    const player=own.players.find(p=>p.id.value===own.viewer.value),land=own.hand.find(c=>c.name==='Forest');
    if(player.landsPlayedThisTurn===0&&land){await t.command(i,{kind:'playLand',card:land.id.value});continue;}
    const forest=own.battlefield.find(c=>c.name==='Forest'&&c.controller.value===own.viewer.value&&!c.tapped);
    const tutor=own.hand.find(c=>c.name==='Worldly Tutor');
    if(forest&&tutor){await t.command(i,{kind:'activate',source:forest.id.value,abilityIndex:0});await t.command(i,{kind:'cast',card:tutor.id.value,faceIndex:0});actor=i;break;}
   }
   await t.advance();
  }
  assert(actor>=0);
  for(let n=0;n<10&&!t.views[actor].pending;n++)await t.advance();
  const pending=t.views[actor].pending;assert.equal(pending.kind,'search');
  assert.equal(t.views[1-actor].choiceCards.length,0);
  await t.command(actor,{kind:'answer',choice:pending.id.value,answer:[pending.options[0].id]});
  assert(t.views.every(v=>v.lastReveal.cards[0].name==='Llanowar Elves'));
  const originalTurn=t.views[actor].turnNumber;
  const hand=new Set(t.views[actor].hand.map(c=>c.id.value));
  let drew=false;
  for(let n=0;n<140;n++){
   const v=t.views[actor];
   const added=v.hand.filter(c=>!hand.has(c.id.value));
   if(v.turnNumber>originalTurn&&added.length){assert.equal(added.length,1);assert.equal(added[0].name,'Llanowar Elves');drew=true;break;}
   await t.advance();
  }
  assert(drew,'Reached the caster next normal draw');
  await t.shot(actor,'after-draw');
  console.log('PASS: live search/reveal/shuffle/top placement followed by the correct next draw');
 }finally{await t.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
