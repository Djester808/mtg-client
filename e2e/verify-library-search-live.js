const assert=require('assert/strict');
const {By,until,Key}=require('selenium-webdriver');
const {LibraryTable}=require('./helpers/library-table');
(async()=>{
 const table=new LibraryTable('Library search mountains','40 Evolving Wilds\n20 Mountain','library-search');
 const {views,drivers,command,wait,advance,seat,shot}=table;
 const findNothing=process.argv.includes('--fail-to-find');
 try{
  await table.start();let actor=-1;
  for(let n=0;n<150;n++){
   const v=views[0],i=seat(v.activePlayer.value),card=views[i].hand.find(c=>c.name==='Evolving Wilds');
   if(v.step==='PrecombatMain'&&v.priorityHolder?.value===v.activePlayer.value&&card){actor=i;await command(i,{kind:'playLand',card:card.id.value});break;}
   await advance();
  }
  assert(actor>=0);const other=1-actor;
  const land=views[actor].battlefield.find(c=>c.name==='Evolving Wilds'&&c.controller.value===views[actor].viewer.value);
  await command(actor,{kind:'activate',source:land.id.value,abilityIndex:0});
  for(let n=0;n<6&&!views[actor].pending;n++)await advance();
  assert.equal(views[actor].pending.kind,'search');
  assert(views[actor].choiceCards.every(c=>c.name==='Mountain'));
  assert.equal(views[other].choiceCards.length,0);assert.equal(views[other].pending.options.length,0);assert.deepEqual(views[other].pending.context.extra,{});
  const pending=views[actor].pending.id.value,count=views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount;
  assert.equal(views[actor].lastLook.cards.length,count);
  assert(views[actor].lastLook.cards.some(c=>c.name==='Evolving Wilds'));
  assert.equal(views[other].lastLook,null);
  assert.equal(views[actor].inspectedLibraryCards.length,count);
  assert.equal(views[other].inspectedLibraryCards.length,0);
  const d=drivers[actor];await d.wait(until.elementLocated(By.css('app-choice-controls input')),5000);
  await d.navigate().refresh();await d.wait(until.elementLocated(By.css('.self-table .life')),20000);await table.dismiss(d);
  await d.wait(until.elementLocated(By.css('app-library-reveal summary')),10000);
  let previousInspectionRect;
  await d.wait(async () => {
    const hit = await d.executeScript("const s=document.querySelector('app-library-reveal summary'); const r=s.getBoundingClientRect(); const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {rect:JSON.stringify(r.toJSON()),ready:at===s||s.contains(at)};");
    const stable = hit.ready && hit.rect === previousInspectionRect;
    previousInspectionRect = hit.rect;
    return stable;
  }, 10000, 'Inspection summary is stable and receives pointer input');
  const inspectionSummary = await d.findElement(By.css('app-library-reveal summary'));
  const handHover = await d.findElement(By.css('.hand-card-wrapper'));
  await d.actions().move({origin: handHover}).perform();
  await d.wait(until.elementLocated(By.css('.quick-card')),5000);
  const hoveredTop = await d.executeScript('return arguments[0].getBoundingClientRect().top',inspectionSummary);
  await d.actions().move({origin: inspectionSummary}).perform();
  await d.wait(async () => (await d.findElements(By.css('.quick-card'))).length === 0,5000);
  const unhoveredTop = await d.executeScript('return arguments[0].getBoundingClientRect().top',inspectionSummary);
  assert(Math.abs(hoveredTop-unhoveredTop)<1,'Hand hover must not move the library inspection control');
  await d.findElement(By.css('app-library-reveal summary')).click();
  await d.wait(async()=>await d.findElement(By.css('app-library-reveal details')).getAttribute('open')!==null,5000);
  const inspected=await d.findElements(By.css('app-library-reveal button'));
  assert.equal(inspected.length,count);
  const inspectionNames = await Promise.all(inspected.map(c => c.getText()));
  const firstOther = inspectionNames.findIndex(name => name.includes('Evolving Wilds'));
  assert(firstOther > 0, 'Offered Mountains precede inspection-only cards');
  assert(inspectionNames.slice(0, firstOther).every(name => name.includes('Mountain')));
  assert(inspectionNames.slice(firstOther).every(name => name.includes('Evolving Wilds')));
  assert.deepEqual(await Promise.all((await d.findElements(By.css('app-library-reveal .inspection-group'))).map(e => e.getText())),
    ['Available in current prompt', 'Other inspected cards']);
  assert((await Promise.all(inspected.map(c=>c.getText()))).some(text=>text.includes('Evolving Wilds')));
  assert.equal(await d.findElement(By.css('app-library-reveal summary')).getText(),'Inspecting library — '+views[actor].players.find(p=>p.id.value===views[actor].viewer.value).name+' ('+count+')');
  await shot(actor,'inspection');
  await d.actions().contextClick(inspected[0]).perform();
  await d.wait(until.elementLocated(By.css('app-library-reveal [role="menu"]')),5000);
  assert.equal(views[actor].pending.id.value,pending);
  await shot(actor,'inspection-menu');
  await d.findElement(By.css('app-library-reveal [role="menuitem"]')).click();
  await d.wait(until.elementLocated(By.css('.card-modal')),5000);
  assert.equal(views[actor].pending.id.value,pending);
  await shot(actor,'inspection-menu-details');
  await d.actions().sendKeys(Key.ESCAPE).perform();
  await d.wait(async()=>(await d.findElements(By.css('.card-modal'))).length===0,5000);
  await inspected[0].sendKeys(Key.chord(Key.SHIFT,Key.F10));
  await d.wait(until.elementLocated(By.css('app-library-reveal [role="menu"]')),5000);
  await d.actions().sendKeys(Key.ESCAPE).perform();
  await d.wait(async()=>(await d.findElements(By.css('app-library-reveal [role="menu"]'))).length===0,5000);
  await d.actions().contextClick(inspected[0]).perform();
  await d.wait(until.elementLocated(By.css('app-library-reveal [role="menu"]')),5000);
  const searchAction=await d.findElement(By.xpath("//app-library-reveal//button[@role='menuitem' and normalize-space()='Select for search']"));
  await searchAction.click();
  const selectedFromLibrary=await d.findElements(By.css('app-choice-controls .choice[aria-pressed="true"]'));
  assert.equal(selectedFromLibrary.length,1,'Library menu shares the prompt selection');
  assert((await selectedFromLibrary[0].getText()).includes('Mountain'));
  assert.equal(views[actor].pending.id.value,pending,'Selecting is not confirming');
  assert.equal(views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount,count);
  await shot(actor,'inspection-search-selected');
  assert(await d.executeScript("return document.querySelector('app-stack').getBoundingClientRect().bottom <= document.querySelector('app-library-reveal summary').getBoundingClientRect().top"));
  for(const [width,height,label] of [[375,667,'portrait'],[667,375,'landscape']]){
    await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
    if(label==='landscape'){
      const panel=await d.findElement(By.css('[data-active-inspection]'));
      assert(await d.executeScript('return arguments[0].getBoundingClientRect().width > innerWidth * 0.9',panel));
      const summary=await panel.findElement(By.css('summary'));
      await summary.click();
      assert.equal(await panel.getAttribute('open'),null);
      assert(await d.executeScript("const host=document.querySelector('app-library-reveal'); return host.scrollWidth <= host.clientWidth"),'Closed inspection must not scroll horizontally');
      await shot(actor,'inspection-closed-landscape');
      await summary.click();
      assert.notEqual(await panel.getAttribute('open'),null);
    }
    await shot(actor,'inspection-'+label);
    if(label==='landscape') {
      await d.actions().contextClick(await d.findElement(By.css('app-library-reveal details button'))).perform();
      const menu=await d.wait(until.elementLocated(By.css('app-library-reveal [role="menu"]')),5000);
      assert(await d.executeScript('const r=arguments[0].getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight',menu));
      await shot(actor,'inspection-menu-landscape');
      await d.actions().sendKeys(Key.ESCAPE).perform();
    }
  }
  await d.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
  await d.findElement(By.css('app-library-reveal summary')).click();
  await d.findElement(By.css('app-choice-controls input')).sendKeys('Forest');
  await d.wait(async()=>(await d.findElements(By.css('app-choice-controls .choice'))).length===0,5000);
  await d.findElement(By.css('app-choice-controls input')).clear();
  await d.findElement(By.css('app-choice-controls input')).sendKeys('Mountain');
  await d.wait(async()=>{const cards=await d.findElements(By.css('app-choice-controls .choice'));return cards.length>0&&(await Promise.all(cards.map(c=>c.getText()))).every(t=>t.includes('Mountain'));},5000);
  await d.findElement(By.css('app-choice-controls .choice-details')).click();await d.wait(until.elementLocated(By.css('dialog.card-preview-panel[open]')),5000);assert.equal(views[actor].pending.id.value,pending);await shot(actor,'details');await d.actions().sendKeys(Key.ESCAPE).perform();
  await shot(actor,'filtered');
  await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});
  await d.sleep(300);assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
  await shot(actor,'landscape');await d.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
  await d.findElement(By.css(findNothing?'app-choice-controls .cancel':'app-choice-controls .choice')).click();if(!findNothing){assert.equal(views[actor].pending.id.value,pending);await shot(actor,'selected');
  await d.findElement(By.css('app-choice-controls .choice')).click();
  assert.equal(await d.findElement(By.css('app-choice-controls .choice')).getAttribute('aria-pressed'),'true','Repeated selection must retain the selected library card');
  assert.equal(views[actor].pending.id.value,pending);
  await shot(actor,'reselected');
  if(process.argv.includes('--automatic-reconnect')) {
    const originalChoice = await d.findElement(By.css('app-choice-controls .choice[aria-pressed="true"]')).getText();
    await d.executeScript(() => {
      const hub = window.ng.getComponent(document.querySelector('app-game-board')).signalr.hub;
      const transport = hub.connection.transport;
      if(!transport || hub.state !== 'Connected') throw Error('Expected a connected transport');
      window.libraryReconnect = { transport: transport.constructor.name, before: hub.connectionId, reconnecting: 0, reconnected: 0, views: 0, answers: 0 };
      const observed = window.libraryReconnect;
      hub.onreconnecting(() => observed.reconnecting++);
      hub.onreconnected(id => { observed.reconnected++; observed.after = id; });
      hub.on('ViewUpdated', () => observed.views++);
      const invoke = hub.invoke.bind(hub);
      hub.invoke = (...args) => {
        if(args[0] === 'Command' && args[2]?.kind === 'answer') observed.answers++;
        return invoke(...args);
      };
      void transport.stop();
    });
    await d.wait(async()=>await d.executeScript('const r=window.libraryReconnect;return r.reconnecting>0&&r.reconnected>0&&r.views>0'),15000);
    const reconnect = await d.executeScript('return window.libraryReconnect');
    assert.notEqual(reconnect.after,reconnect.before,'Automatic reconnect establishes a new connection');
    assert.equal(reconnect.answers,0,'Rejoining must not submit the retained choice');
    assert.equal(views[actor].pending.id.value,pending);
    assert.equal(await d.findElement(By.css('app-choice-controls .choice[aria-pressed="true"]')).getText(),originalChoice);
    await shot(actor,'automatic-reconnect-selected');
    console.log('PASS: actual transport interruption automatically rejoined with selection retained and no answer sent');
  }
  if(process.argv.includes('--offline-retry')){
    await d.sendDevToolsCommand('Network.enable',{});
    await d.sendDevToolsCommand('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    try {
      await d.findElement(By.css('app-choice-controls .confirm')).click();
      await d.sleep(1200);
      assert.equal(views[actor].pending.id.value,pending);
      assert.equal(await d.findElement(By.css('app-choice-controls .choice')).getAttribute('aria-pressed'),'true');
      await shot(actor,'offline-retained');
    } finally {
      await d.sendDevToolsCommand('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:0,uploadThroughput:0});
    }
    await d.sleep(6000);
    assert.equal(await d.findElement(By.css('app-choice-controls .choice')).getAttribute('aria-pressed'),'true');
  }
  if(process.argv.includes('--accepted-response-loss') || process.argv.includes('--accepted-auto-reconnect')) {
    await d.executeScript(automatic => {
      const hub = window.ng.getComponent(document.querySelector('app-game-board')).signalr.hub;
      const send = hub.invoke.bind(hub);
      const handlers = [...(hub._methods.viewupdated ?? [])];
      if(!handlers.length) throw Error('Expected authoritative view handler');
      const observed = window.libraryAcceptedFault = {
        sends: 0, accepted: false, suppressed: 0, reconnecting: 0, reconnected: 0,
        before: hub.connectionId, synced: 0
      };
      hub.off('ViewUpdated');
      const suppress = () => observed.suppressed++;
      hub.on('ViewUpdated', suppress);
      hub.onreconnecting(() => observed.reconnecting++);
      hub.onreconnected(id => { observed.reconnected++; observed.after = id; });
      hub.invoke = async (...args) => {
        if(args[0] === 'Command' && args[2]?.kind === 'answer') {
          observed.sends++;
          await send(...args);
          observed.accepted = true;
          if(automatic) {
            hub.off('ViewUpdated', suppress);
            for(const handler of handlers) hub.on('ViewUpdated', handler);
            hub.on('ViewUpdated', () => observed.synced++);
            await hub.connection.transport.stop();
          } else {
            await hub.stop();
          }
          throw new Error('Test delivery fault after server acceptance');
        }
        return send(...args);
      };
    }, process.argv.includes('--accepted-auto-reconnect'));
  }
  await d.findElement(By.css('app-choice-controls .confirm')).click();
  if(process.argv.includes('--accepted-response-loss')) {
    await wait(()=>views.every(v=>!v.pending&&v.stack.length===0));
    await d.wait(async()=>await d.executeScript('return window.libraryAcceptedFault?.accepted === true'),5000);
    assert.equal(await d.executeScript('return window.libraryAcceptedFault.sends'),1);
    assert.equal(await d.findElement(By.css('app-choice-controls .choice')).getAttribute('aria-pressed'),'true');
    await d.wait(async()=>await d.executeScript("return document.body.innerText.includes('Choice status unknown. Reload to sync.')"),5000);
    await shot(actor,'accepted-response-lost');
    await d.navigate().refresh();
    await d.wait(until.elementLocated(By.css('.self-table .life')),20000);
    await table.dismiss(d);
    await d.wait(async()=>(await d.findElements(By.css('app-choice-controls .choice'))).length===0,10000);
    await shot(actor,'accepted-response-recovered');
    console.log('PASS: one real answer accepted, browser update/result withheld, reload recovered committed state');
  }
  if(process.argv.includes('--accepted-auto-reconnect')) {
    await wait(()=>views.every(v=>!v.pending&&v.stack.length===0));
    await d.wait(async()=>await d.executeScript('const r=window.libraryAcceptedFault;return r.accepted&&r.reconnecting>0&&r.reconnected>0&&r.synced>0'),15000);
    const result = await d.executeScript('return window.libraryAcceptedFault');
    assert(result.suppressed>0,'The committed view was withheld before reconnect');
    assert.notEqual(result.before,result.after,'Reconnected on a new connection');
    assert.equal(result.sends,1,'Accepted search was never resubmitted');
    await d.wait(async()=>(await d.findElements(By.css('app-choice-controls .choice'))).length===0,10000);
    await d.wait(async()=>await d.executeScript('return window.ng.getComponent(document.querySelector("app-game-board")).signalr.pendingChoiceKey() === null'),5000);
    console.log('Recovery feedback',await d.executeScript('const s=window.ng.getComponent(document.querySelector("app-game-board")).signalr;return {updater:typeof s.updateLatest,warning:s.choiceWarning,choice:s.latest?.choice?.id};'));
    await d.wait(async()=>await d.executeScript("return !document.body.innerText.includes('Choice status unknown. Reload to sync.')"),1000,'Resolved search must dismiss the warning before its five-second expiry');
    await shot(actor,'accepted-auto-reconnected');
    console.log('PASS: accepted search result withheld, automatic rejoin recovered committed state without reload or resubmission');
  }
  }await wait(()=>views.every(v=>!v.pending&&v.stack.length===0));
  if(process.argv.includes('--automatic-reconnect')) assert.equal(await d.executeScript('return window.libraryReconnect.answers'),1,'Search confirmed exactly once after reconnect');
  assert(views.every(v=>v.choiceCards.length===0));
  assert(views.every(v=>v.inspectedLibraryCards.length===0));
  await d.wait(async()=>(await d.findElements(By.css('[data-active-inspection]'))).length===0,5000);
  assert.equal(views[actor].battlefield.some(c=>c.name==='Mountain'&&c.controller.value===views[actor].viewer.value&&c.tapped),!findNothing);
  assert.equal(views[actor].players.find(p=>p.id.value===views[actor].viewer.value).libraryCount,count-(findNothing?0:1));
  assert(views[actor].players.find(p=>p.id.value===views[actor].viewer.value).graveyard.some(c=>c.name==='Evolving Wilds'));
  table.assertChoicePrivacy();
  await shot(actor,findNothing?'choose-none-completed':'search-completed');
  console.log(findNothing?'PASS: choose none with available matches completes search without moving a card':'PASS: live private library search, filtering, details, tapped destination and matching counts');
 }catch(e){for(let i=0;i<drivers.length;i++)await shot(i,'failure-'+i).catch(()=>{});throw e;}
 finally{await table.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
