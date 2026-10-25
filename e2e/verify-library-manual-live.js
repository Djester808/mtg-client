const assert = require('assert/strict');
const {randomUUID} = require('crypto');
const {By, until, Key} = require('selenium-webdriver');
const {LibraryTable} = require('./helpers/library-table');
(async () => {
  const table = new LibraryTable('Manual library live', '60 Mountain', 'library-manual');
  const {drivers, views, wait, shot} = table;
  try {
    await table.start();
    const d = drivers[0], owner = views[0].viewer.value;
    const player = () => views[0].players.find(p => p.id.value === owner);
    const open = async () => {
      await d.findElement(By.css('.self-table .zone-pile[data-zone="library"]')).click();
      await d.wait(until.elementLocated(By.css('app-zone-viewer .library-draw')), 5000);
    };
    const hand = views[0].hand.length, library = player().libraryCount;
    await open(); await shot(0, 'desktop');
    for (const [width, height, name] of [[375,667,'portrait'], [667,375,'landscape']]) {
      await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:true});
      await d.sleep(250);
      assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
      assert(await d.executeScript('return Array.from(document.querySelectorAll(".library-actions button")).every(b => b.getBoundingClientRect().height >= 44)'));
      await shot(0, name);
    }
    await d.findElement(By.css('.library-draw')).click();
    await wait(() => views[0].hand.length === hand + 1);
    assert.equal(player().libraryCount, library - 1);
    const drawn = views[0].hand.at(-1).id.value;
    assert(!views[1].hand.some(card => card.id.value === drawn));
    await open();
    const revision = [...table.revisions];
    await d.findElement(By.css('.library-shuffle')).click();
    await wait(() => table.revisions.every((r,i) => r > revision[i]));
    assert.equal(player().libraryCount, library - 1);
    assert.equal(views[0].hand.length, hand + 1);
    await d.findElement(By.css('.opponents-row .zone-pile[data-zone="library"]')).click();
    await d.wait(until.elementLocated(By.css('app-zone-viewer dialog[open]')), 5000);
    assert.equal((await d.findElements(By.css('.library-actions'))).length, 0);
    await d.actions().sendKeys(Key.ESCAPE).perform();
    const request = {kind:'manualLibraryDraw', requestId:randomUUID()};
    await table.command(0, request);
    const after = views[0].hand.length, refusals = table.refused.length;
    await table.hubs[0].invoke('Command', table.gameId, request);
    await wait(() => table.refused.length > refusals);
    assert.equal(views[0].hand.length, after);
    await d.navigate().refresh();
    await d.wait(until.elementLocated(By.css('.self-table .life')), 15000);
    await table.dismiss(d);
    await open(); await shot(0, 'reconnected');
    assert.equal(player().libraryCount, library - 2);
    assert.equal(views[0].hand.length, hand + 2);
    console.log('PASS: manual library draw/shuffle, owner-only controls, retry protection, refresh and phone captures');
  } catch (error) {
    for (let i=0;i<drivers.length;i++) await shot(i, 'failure-'+i).catch(() => {});
    throw error;
  } finally { await table.close(); }
})().catch(error => {console.error(error.stack);process.exitCode=1;});
