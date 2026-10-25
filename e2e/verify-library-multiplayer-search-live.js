const assert = require('assert/strict');
const { By, until } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
(async () => {
  const t = new LibraryTable('Four player library search', '30 Field of Ruin\n30 Mountain', 'library-four-search', 4);
  try {
    await t.start();
    let actor = -1;
    for (let n = 0; n < 700; n++) {
      const v = t.views[0], i = t.seat(v.activePlayer.value), own = t.views[i];
      if (v.step === 'PrecombatMain' && v.priorityHolder?.value === v.activePlayer.value) {
        const p = own.players.find(p => p.id.value === own.viewer.value);
        if (p.landsPlayedThisTurn === 0 && own.hand.length) {
          const card = own.hand.find(c => c.name === 'Field of Ruin') ?? own.hand[0];
          await t.command(i, { kind: 'playLand', card: card.id.value });
          continue;
        }
        const lands = own.battlefield.filter(c => c.controller.value === own.viewer.value && !c.tapped);
        const field = lands.find(c => c.name === 'Field of Ruin');
        const target = own.battlefield.find(c => c.controller.value !== own.viewer.value && c.name === 'Field of Ruin');
        if (field && target && lands.length >= 3) {
          for (const mana of lands.filter(c => c.id.value !== field.id.value).slice(0, 2))
            await t.command(i, { kind: 'activate', source: mana.id.value, abilityIndex: 0 });
          await t.command(i, { kind: 'activate', source: field.id.value, abilityIndex: 1, targets: [target.id.value] });
          actor = i;
          break;
        }
      }
      await t.advance();
    }
    assert(actor >= 0, 'Reached a legal Field of Ruin activation');
    for (let n = 0; n < 10 && !t.views[0].pending; n++) await t.advance();
    const counts = t.views.map(v => v.players.find(p => p.id.value === v.viewer.value).libraryCount);
    const mountains = t.views.map(v => v.battlefield.filter(c => c.controller.value === v.viewer.value && c.name === 'Mountain').length);
    const order = [];
    for (let turn = 0; turn < 4; turn++) {
      const pending = t.views[0].pending;
      assert.equal(pending.kind, 'search');
      const i = t.seat(pending.player.value);
      order.push(i);
      console.log('Choosing', {turn, seat:i, choice:pending.id.value});
      assert.equal(i, (actor + turn) % 4);
      for (let viewer = 0; viewer < 4; viewer++) {
        const view = t.views[viewer];
        assert.equal(view.lastLook.cards.length, counts[viewer]);
        assert.equal(view.inspectedLibraryCards.length, counts[viewer]);
        assert(view.inspectedLibraryCards.every(c => c.owner.value === view.viewer.value));
        assert.equal(view.players.find(p => p.id.value === view.viewer.value).libraryCount, counts[viewer]);
        assert.equal(viewer === i ? view.choiceCards.every(c => c.name === 'Mountain') : view.choiceCards.length === 0, true);
      }
      const d = t.drivers[i];
      await d.navigate().refresh();
      await t.dismiss(d);
      await d.wait(until.elementLocated(By.css('app-choice-controls .choice')), 15000);
      await d.wait(until.elementLocated(By.css('[data-active-inspection]')), 15000);
      await t.shot(i, 'choice-seat-' + i);
      if (turn === 0) {
        await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 1, mobile: true });
        assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
        await t.shot(i, 'choice-landscape');
        await d.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
      }
      await d.findElement(By.css('app-choice-controls .choice')).click();
      assert.equal(t.views[i].pending.id.value, pending.id.value);
      assert.equal(await d.findElement(By.css('app-choice-controls .choice')).getAttribute('aria-pressed'), 'true');
      await t.shot(i, 'selected-seat-' + i);
      console.log('Confirming', i);
      await d.findElement(By.css('app-choice-controls .confirm')).click();
      await t.wait(() => t.views.every(v => v.pending?.id.value !== pending.id.value));
    }
    assert.equal(new Set(order).size, 4);
    await t.wait(() => t.views.every(v => !v.pending && v.stack.length === 0));
    for (let i = 0; i < 4; i++) {
      const v = t.views[i];
      assert.equal(v.players.find(p => p.id.value === v.viewer.value).libraryCount, counts[i] - 1);
      assert.equal(v.battlefield.filter(c => c.controller.value === v.viewer.value && c.name === 'Mountain').length, mountains[i] + 1);
      assert.equal(v.choiceCards.length, 0);
      assert.equal(v.inspectedLibraryCards.length, 0);
      await t.drivers[i].wait(async () => (await t.drivers[i].findElements(By.css('[data-active-inspection]'))).length === 0, 10000);
    }
    t.assertChoicePrivacy();
    await t.shot(actor, 'completed');
    console.log('PASS: four live players inspect privately, choose in APNAP order across refresh, and each find one basic land');
  } catch (error) {
    console.error('Pending views',t.views.map(v=>({viewer:v.viewer,pending:v.pending && {id:v.pending.id.value,player:v.pending.player.value,kind:v.pending.kind}})));
    console.error('Refusals', t.refused);
    for (let i = 0; i < t.drivers.length; i++) await t.shot(i, 'failure-' + i).catch(() => {});
    throw error;
  } finally { await t.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });