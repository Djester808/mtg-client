const assert = require('assert/strict');
const {By, until} = require('selenium-webdriver');
const {LibraryTable} = require('./helpers/library-table');
(async () => {
  const seats = process.argv.includes('--four-seats') ? 4 : 2;
  const table = new LibraryTable('Library surveil live', '30 Desert\n30 Arid Archway', seats === 4 ? 'library-surveil-four' : 'library-surveil', seats);
  const {views, drivers, command, advance, seat, wait, shot, dismiss} = table;
  try {
    await table.start();
    let actor = -1;
    for (let step = 0; step < 250 * seats; step++) {
      const view = views[0];
      if (view.pending) {
        const i = seat(view.pending.player.value), own = views[i];
        if (own.pending.kind === 'surveil') { actor = i; break; }
        const desert = own.battlefield.find(c => c.name === 'Desert' && c.controller.value === own.viewer.value);
        const option = own.pending.options.find(o => o.object?.value === desert?.id.value);
        assert(option, 'Return the other Desert offered by the trigger');
        await command(i, {kind:'answer', choice:own.pending.id.value, answer:[option.id]});
      } else {
        const i = seat(view.activePlayer.value), own = views[i];
        const player = own.players.find(p => p.id.value === own.viewer.value);
        if (view.step === 'PrecombatMain' && view.priorityHolder?.value === view.activePlayer.value && player.landsPlayedThisTurn === 0) {
          const hasDesert = own.battlefield.some(c => c.name === 'Desert' && c.controller.value === own.viewer.value);
          const land = own.hand.find(c => c.name === (hasDesert ? 'Arid Archway' : 'Desert'));
          if (land) { await command(i, {kind:'playLand', card:land.id.value}); continue; }
        }
        await advance();
      }
    }
    assert(actor >= 0, 'Reached surveil through legal land plays');
    const observers = views.map((v, i) => i).filter(i => i !== actor), pending = views[actor].pending;
    assert.equal(views[actor].choiceCards.length, 1);
    assert.equal(views[actor].inspectedLibraryCards.length, 1);
    assert(observers.every(i => views[i].inspectedLibraryCards.length === 0));
    assert(observers.every(i => views[i].choiceCards.length === 0));
    assert(observers.every(i => views[i].pending.options.length === 0));
    const before = views[actor].players.find(p => p.id.value === views[actor].viewer.value);
    await drivers[actor].navigate().refresh();
    await drivers[actor].wait(until.elementLocated(By.css('app-choice-controls .choice')), 15000);
    await dismiss(drivers[actor]);
    assert.equal(views[actor].pending.id.value, pending.id.value);
    await drivers[actor].wait(until.elementLocated(By.css('[data-active-inspection]')), 5000);
    for (const i of observers) assert.equal((await drivers[i].findElements(By.css('[data-active-inspection]'))).length, 0);
    await shot(actor, 'choice');
    for (const i of observers) await shot(i, 'opponent-' + i);
    await drivers[actor].sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {width:667,height:375,deviceScaleFactor:1,mobile:true});
    await drivers[actor].sleep(300);
    assert(await drivers[actor].executeScript('return document.documentElement.scrollWidth <= innerWidth'));
    await shot(actor, 'choice-landscape');
    if (process.argv.includes('--detail-expiry')) {
      await drivers[actor].findElement(By.css('[data-active-inspection] summary')).click();
      await drivers[actor].findElement(By.css('[data-active-inspection] button')).click();
      await drivers[actor].findElement(By.xpath("//button[@role='menuitem' and contains(., 'Card details')]" )).click();
      await drivers[actor].wait(until.elementLocated(By.css('body > app-card-modal')), 5000);
      await shot(actor, 'active-detail');
      await command(actor, {kind:'answer', choice:pending.id.value, answer:[pending.options[0].id]});
    } else {
      await drivers[actor].findElement(By.css('app-choice-controls .choice')).click();
    }
    await wait(() => views.every(v => !v.pending && v.stack.length === 0));
    const after = views[actor].players.find(p => p.id.value === views[actor].viewer.value);
    assert.equal(after.libraryCount, before.libraryCount - 1);
    assert.equal(after.graveyard.length, before.graveyard.length + 1);
    for (const i of observers) {
      const observed = views[i].players.find(p => p.id.value === views[actor].viewer.value);
      assert.equal(observed.libraryCount, after.libraryCount);
      assert.deepEqual(observed.graveyard, after.graveyard);
    }
    assert(views.every(v => v.choiceCards.length === 0));
    assert(views.every(v => v.inspectedLibraryCards.length === 0));
    await drivers[actor].wait(async () => (await drivers[actor].findElements(By.css('[data-active-inspection], body > app-card-modal'))).length === 0, 5000);
    await shot(actor, 'completed-landscape');
    table.assertChoicePrivacy();console.log(process.argv.includes('--detail-expiry') ? 'PASS: live surveil private inspection, refresh, open detail expiry after authoritative answer, and public graveyard result' : 'PASS: live surveil privacy, refresh, phone selection and public graveyard result');
  } catch (error) {
    for (let i = 0; i < drivers.length; i++) await shot(i, 'failure-' + i).catch(() => {});
    throw error;
  } finally { await table.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
