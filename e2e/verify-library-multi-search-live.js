const assert = require('assert/strict');
const { By, until } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
const { api } = require('./helpers/board-driver');
(async () => {
  const commander = process.argv.includes('--commander');
  const seats = commander || process.argv.includes('--four-seats') ? 4 : 2;
  const prefix = commander ? 'library-commander-search' : seats === 4 ? 'library-multi-search-four' : 'library-multi-search';
  const t = new LibraryTable(commander ? 'Commander singleton woodland search' : 'Library multi search woodland', commander ? '1 Ghalta, Primal Hunger\n98 Forest\n1 Blighted Woodland' : '40 Forest\n20 Blighted Woodland', prefix, seats, commander ? 'commander' : 'casual');
  try {
    await t.start(commander ? async(token,id) => {
      const deck = await api(token,'GET','/api/decks/'+id);
      const leader = deck.cards.find(card => card.cardDetails?.name === 'Ghalta, Primal Hunger');
      assert(leader, 'Existing commander imported');
      await api(token,'PUT','/api/decks/'+id,{name:deck.name,format:'commander',commanderOracleId:leader.oracleId});
    } : undefined);
    if (commander) for (const view of t.views) for (const player of view.players) {
      assert.equal(player.life,40);
      assert.equal(player.libraryCount,92);
      assert.equal(player.command.length,1);
      assert.equal(player.command[0].name,'Ghalta, Primal Hunger');
    }
    let actor = -1;
    for (let n = 0; n < (commander ? 3500 : 350) * seats; n++) {
      const v = t.views[0], i = t.seat(v.activePlayer.value), own = t.views[i];
      if (v.step === 'PrecombatMain' && v.priorityHolder?.value === v.activePlayer.value && !v.stack.length) {
        const player = own.players.find(p => p.id.value === own.viewer.value);
        const lands = own.battlefield.filter(c => c.controller.value === own.viewer.value);
        const woodland = lands.find(c => c.name === 'Blighted Woodland' && !c.tapped);
        const forest = own.hand.find(c => c.name === 'Forest');
        const heldWoodland = own.hand.find(c => c.name === 'Blighted Woodland');
        const nextLand = !woodland && heldWoodland ? heldWoodland : forest;
        if (!player.landsPlayedThisTurn && nextLand) {
          await t.command(i, {kind:'playLand',card:nextLand.id.value}); continue;
        }
        const forests = lands.filter(c => c.name === 'Forest' && !c.tapped);
        if (woodland && forests.length >= 4) {
          for (const f of forests.slice(0,4)) await t.command(i,{kind:'activate',source:f.id.value,abilityIndex:0});
          await t.command(i,{kind:'activate',source:woodland.id.value,abilityIndex:1});
          actor=i; break;
        }
      }
      await t.advance();
    }
    assert(actor >= 0, 'Paid for a two-card search using existing lands');
    for(let n=0;n<20&&!t.views[actor].pending;n++) await t.advance();
    const own=t.views[actor], pending=own.pending;
    assert.equal(pending.kind,'search'); assert.equal(pending.max,2);
    const count=own.players.find(p=>p.id.value===own.viewer.value).libraryCount;
    const before=new Set(own.battlefield.map(c=>c.id.value));
    for(let i=0;i<seats;i++) {
      if(i===actor) continue;
      assert.equal(t.views[i].inspectedLibraryCards.length,0);
      assert.equal(t.views[i].choiceCards.length,0);
      assert.equal(t.views[i].pending.options.length,0);
      assert.equal(t.views[i].lastLook,null);
      await t.drivers[i].wait(async()=>(await t.drivers[i].findElements(By.css('[data-active-inspection]'))).length===0,5000);
      await t.shot(i,'private-observer-'+i);
    }
    const d=t.drivers[actor];
    await d.navigate().refresh();
    await d.wait(until.elementLocated(By.css('.self-table .life')),20000);
    await t.dismiss(d);
    const summary=await d.wait(until.elementLocated(By.css('app-library-reveal summary')),10000);
    assert(await d.executeScript("return document.querySelector('app-library-reveal details').open"), 'Active search opens automatically after reload');
    const pick=async index=>{
      const cards=await d.findElements(By.css('app-library-reveal details button'));
      await d.actions().contextClick(cards[index]).perform();
      const action=await d.wait(until.elementLocated(By.xpath("//app-library-reveal//button[@role='menuitem' and normalize-space()='Toggle search selection']")),5000);
      await action.click();
    };
    const selected=()=>d.findElements(By.css('app-choice-controls .choice[aria-pressed="true"]'));
    await pick(0);
    assert.equal((await selected()).length,1);
    await pick(0);
    assert.equal((await selected()).length,0,'Menu can deselect before completion');
    await pick(2);
    assert.equal((await selected()).length,1);
    assert.equal(t.views[actor].pending.id.value,pending.id.value);
    assert.equal(t.views[actor].players.find(p=>p.id.value===own.viewer.value).libraryCount,count);
    await d.wait(async()=>(await d.findElements(By.css('app-library-reveal button.is-picked'))).length===1,5000);
    await t.shot(actor,'inspection-selected');
    await summary.click();
    await d.wait(async()=>d.executeScript("return !document.querySelector('app-library-reveal details').open"),5000);
    const collapsed = await d.executeScript("const e=document.querySelector('app-library-reveal'); return {width:e.clientWidth,scroll:e.scrollWidth,title:e.querySelector('summary').textContent}");
    assert(collapsed.scroll <= collapsed.width, 'Collapsed inspection fits the side panel');
    assert(collapsed.title.includes(own.players.find(p=>p.id.value===own.viewer.value).name), 'Full owner name remains available');
    await t.shot(actor,'selected');
    const finalOptions=await d.findElements(By.css('app-choice-controls .choice[aria-pressed="false"]'));
    assert(finalOptions.length > 0, 'Another legal card remains');
    await finalOptions[0].click();
    await t.wait(()=>t.views.every(v=>!v.pending && !v.stack.length));
    for(const view of t.views){
      const added=view.battlefield.filter(c=>!before.has(c.id.value));
      assert.equal(added.length,2);
      assert(added.every(c=>c.name==='Forest' && c.tapped));
      assert.equal(view.players.find(p=>p.id.value===own.viewer.value).libraryCount,count-2);
      assert.equal(view.inspectedLibraryCards.length,0);
    }
    t.assertChoicePrivacy();
    await t.shot(actor,'resolved');
    console.log('PASS: '+(commander ? 'Commander ' : '')+seats+'-player multi-card library menu, deselection, automatic completion, tapped destinations and privacy');
  } finally { await t.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
