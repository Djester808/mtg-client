const assert = require('assert/strict');
const { By, until } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
(async () => {
  const t = new LibraryTable('Search trigger live acceptance', '24 Plains\n18 Evolving Wilds\n18 Archivist of Oghma', 'library-search-trigger');
  try {
    await t.start();
    let watcher = -1, searcher = -1;
    for (let n = 0; n < 500; n++) {
      const v = t.views[0], i = t.seat(v.activePlayer.value), own = t.views[i];
      if (v.step === 'PrecombatMain' && v.priorityHolder?.value === v.activePlayer.value && !v.stack.length) {
        const player = own.players.find(p => p.id.value === own.viewer.value);
        const wilds = own.battlefield.find(c => c.name === 'Evolving Wilds' && c.controller.value === own.viewer.value && !c.tapped);
        if (watcher >= 0 && i !== watcher && wilds) {
          await t.command(i, {kind:'activate',source:wilds.id.value,abilityIndex:0});
          searcher = i;
          break;
        }
        const wanted = watcher >= 0 && i !== watcher ? 'Evolving Wilds' : 'Plains';
        const land = own.hand.find(c => c.name === wanted) ?? own.hand.find(c => c.name === 'Plains');
        if (!player.landsPlayedThisTurn && land) {
          await t.command(i, {kind:'playLand',card:land.id.value});
          continue;
        }
        const plains = own.battlefield.filter(c => c.name === 'Plains' && c.controller.value === own.viewer.value && !c.tapped);
        const archivist = own.hand.find(c => c.name === 'Archivist of Oghma');
        if (watcher < 0 && archivist && plains.length >= 2) {
          for (const p of plains.slice(0,2)) await t.command(i,{kind:'activate',source:p.id.value,abilityIndex:0});
          await t.command(i,{kind:'cast',card:archivist.id.value,faceIndex:0});
          watcher = i;
          continue;
        }
      }
      await t.advance();
    }
    assert(searcher >= 0, 'Reached an opponent search with Archivist on the battlefield');
    for (let n=0;n<12&&!t.views[searcher].pending;n++) await t.advance();
    assert.equal(t.views[searcher].pending.kind,'search');
    const self = () => t.views[watcher].players.find(p=>p.id.value===t.views[watcher].viewer.value);
    const life = self().life, count = self().libraryCount, hand = t.views[watcher].hand.length;
    assert.equal(t.views[watcher].choiceCards.length,0);
    assert.equal(t.views[watcher].inspectedLibraryCards.length,0);
    const d=t.drivers[searcher];
    await d.navigate().refresh();await t.dismiss(d);
    await d.wait(until.elementLocated(By.css('app-choice-controls .choice')),10000);
    await t.shot(searcher,'pending');
    await d.findElement(By.css('app-choice-controls .choice')).click();
    await d.findElement(By.css('app-choice-controls .confirm')).click();
    await t.wait(()=>t.views.every(v=>!v.pending)&&t.views[watcher].stack.length===1);
    assert.equal(self().life,life,'Trigger waits on stack before gaining life');
    assert.equal(t.views[watcher].hand.length,hand,'Trigger waits before drawing');
    await t.drivers[watcher].wait(async()=>await t.drivers[watcher].findElement(By.css('app-stack .stack-item-type')).getText()==='Triggered Ability',10000);
    assert((await t.drivers[watcher].findElement(By.css('app-stack .stack-item-controller')).getText()).startsWith('Controlled by '));
    await t.shot(watcher,'on-stack');
    for(let n=0;n<12&&t.views[watcher].stack.length;n++) await t.advance();
    assert.equal(t.views[watcher].stack.length,0);
    assert.equal(self().life,life+1);
    assert.equal(self().libraryCount,count-1);
    assert.equal(t.views[watcher].hand.length,hand+1);
    for(const v of t.views) assert.equal(v.players.find(p=>p.id.value===t.views[watcher].viewer.value).life,life+1);
    t.assertChoicePrivacy();
    await t.shot(watcher,'resolved');
    console.log('PASS: opponent search survives refresh, Archivist trigger waits on stack, then gains exactly 1 life and draws exactly 1 card');
  } catch(e) {
    for(let i=0;i<t.drivers.length;i++) await t.shot(i,'failure-'+i).catch(()=>{});
    throw e;
  } finally { await t.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
