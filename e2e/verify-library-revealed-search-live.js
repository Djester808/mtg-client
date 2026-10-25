const assert = require('assert/strict');
const { LibraryTable } = require('./helpers/library-table');
(async () => {
  const t = new LibraryTable('Revealed library identity', '24 Forest\n18 Courser of Kruphix\n18 Worldly Tutor', 'library-revealed-search');
  try {
    await t.start();
    let actor = -1, oldTop;
    for (let n = 0; n < 500; n++) {
      const v = t.views[0], i = t.seat(v.activePlayer.value), own = t.views[i];
      if (v.step === 'PrecombatMain' && v.priorityHolder?.value === v.activePlayer.value && v.stack.length === 0) {
        const player = own.players.find(p => p.id.value === own.viewer.value);
        const land = own.hand.find(c => c.name === 'Forest');
        if (player.landsPlayedThisTurn === 0 && land) { await t.command(i, {kind:'playLand',card:land.id.value}); continue; }
        const forests = own.battlefield.filter(c => c.name === 'Forest' && c.controller.value === own.viewer.value && !c.tapped);
        const courser = own.battlefield.find(c => c.name === 'Courser of Kruphix' && c.controller.value === own.viewer.value);
        const held = own.hand.find(c => c.name === 'Courser of Kruphix');
        if (!courser && held && forests.length >= 3) {
          for (const f of forests.slice(0,3)) await t.command(i,{kind:'activate',source:f.id.value,abilityIndex:0});
          await t.command(i,{kind:'cast',card:held.id.value,faceIndex:0}); continue;
        }
        const tutor = own.hand.find(c => c.name === 'Worldly Tutor');
        if (courser && forests.length && tutor && player.revealedTopCard?.name === 'Courser of Kruphix') {
          oldTop = player.revealedTopCard.id.value;
          await t.command(i,{kind:'activate',source:forests[0].id.value,abilityIndex:0});
          await t.command(i,{kind:'cast',card:tutor.id.value,faceIndex:0}); actor=i; break;
        }
      }
      await t.advance();
    }
    assert(actor >= 0, 'Reached a revealed creature and a payable tutor');
    for(let n=0;n<20&&!t.views[actor].pending;n++) await t.advance();
    const pending=t.views[actor].pending;
    assert.equal(pending.kind,'search');
    const option=pending.options.find(o=>o.object?.value===oldTop);
    assert(option,'Original publicly revealed top is offered');
    await t.command(actor,{kind:'answer',choice:pending.id.value,answer:[option.id]});
    for (const view of t.views) {
      const top=view.players.find(p=>p.id.value===t.views[actor].viewer.value).revealedTopCard;
      assert.equal(top.name,'Courser of Kruphix');
      assert.notEqual(top.id.value,oldTop);
    }
    await t.shot(actor,'after-search');
    const turn=t.views[actor].turnNumber, hand=new Set(t.views[actor].hand.map(c=>c.id.value));
    let drew=false;
    for(let n=0;n<160;n++) {
      const view=t.views[actor], added=view.hand.filter(c=>!hand.has(c.id.value));
      if(view.turnNumber>turn&&added.length){assert.equal(added.length,1);assert.equal(added[0].name,'Courser of Kruphix');drew=true;break;}
      await t.advance();
    }
    assert(drew);
    await t.shot(actor,'after-draw');
    console.log('PASS: revealed top selected, shuffled, reidentified, restored to top for both viewers, then drawn');
  } finally { await t.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
