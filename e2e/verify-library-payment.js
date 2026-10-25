const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armGameReplay } = require('./helpers/game-replay');
const { roomyFixture, GAME_ID } = require('./fixtures/ability-board');
const { baseUrl } = require('./config');

(async () => {
  const driver = await buildDriver();
  try {
    await armGameReplay(driver, roomyFixture(4));
    await driver.get(baseUrl + '/game/' + GAME_ID);
    await driver.wait(until.elementLocated(By.css('app-library-payment')), 20000);
    const skips = await driver.findElements(By.css('.intro-skip'));
    if (skips.length) await skips[0].click();
    await driver.wait(async () => !(await driver.findElements(By.css('.brand-intro'))).length, 12000);
    // Layout fixture only: transport behavior is covered by library-payment.service.spec.ts.
    await driver.executeScript(function () {
      const component = window.ng.getComponent(document.querySelector('app-library-payment'));
      component.payment.choose([
        { index: 1, label: 'Pay 1 life', deferred: false },
        { index: 0, label: 'Mill 1', deferred: true },
        { index: 2, label: 'Exile selected cards from your library', deferred: true },
      ]);
      window.ng.applyChanges(component);
    });
    await driver.wait(until.elementLocated(By.css('.payment-panel')), 10000);
    for (const [width, height, name] of [[1280, 800, 'desktop'], [667, 375, 'landscape'], [375, 667, 'portrait']]) {
      await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name !== 'desktop' });
      assert(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
      const panel = await driver.findElement(By.css('.payment-panel'));
      const rect = await panel.getRect();
      assert(rect.width <= width);
      assert(await driver.executeScript('return [...document.querySelectorAll(".payment-panel button")].every(b => b.getBoundingClientRect().height >= 44)'));
      await fs.promises.writeFile(path.join(__dirname, 'screenshots', 'library-payment-' + name + '.png'), await driver.takeScreenshot(), 'base64');
    }
    await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 1, mobile: true });
    await driver.findElement(By.css('[aria-label="Move Mill 1 later"]')).click();
    assert.deepEqual(await driver.findElements(By.css('.payment-panel li span')).then(items => Promise.all(items.map(item => item.getText()))),
      ['Pay 1 life', 'Exile selected cards from your library', 'Mill 1']);
    await driver.findElement(By.css('.payment-actions button')).click();
    await driver.wait(async () => (await driver.findElements(By.css('.payment-panel'))).length === 0, 5000);
    console.log('Library payment layout, group controls and cancellation verified.');
  } finally { await driver.quit(); }
})().catch(error => { console.error(error); process.exitCode = 1; });