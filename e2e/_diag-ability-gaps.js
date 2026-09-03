#!/usr/bin/env node
//
// Walks the two controls the standing states photograph, and reads what went on the wire.
//
//   node _diag-ability-gaps.js
//
// The captures in shoot-states.js prove the controls are on screen and fit at 375. This proves
// the other half, which no screenshot can: that the number the player names arrives in the
// hub's `variableValue` slot rather than as the zero the board used to send.
//
// A one-off — the standing coverage is `board`, `board-ability-menu` and `board-announce-x`.

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armGameReplay } = require('./helpers/game-replay');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const { abilityFixture, GAME_ID } = require('./fixtures/ability-board');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tap = (name) => `
  const hit = [...document.querySelectorAll('.self-field .card-name')]
    .find((n) => n.textContent.trim() === ${JSON.stringify(name)});
  if (!hit) throw new Error('not on the board: ' + ${JSON.stringify(name)});
  hit.closest('.card').click();
`;

(async () => {
  const device = DEVICES.find((d) => d.id === 'iphone-se');
  const driver = await buildDriver({ device, dpr: 1 });
  try {
    await armGameReplay(driver, abilityFixture());
    await driver.get(baseUrl + '/game/' + GAME_ID);
    await driver.wait(until.elementLocated(By.css('.battlefield .card-name')), 20000);
    await sleep(1200);

    // ---- An ability whose cost is counted with X ------------------------------------------
    await driver.executeScript(tap('Calciform Pools'));
    await sleep(500);
    await driver.executeScript(
      `[...document.querySelectorAll('.action-btn.ability')]
         .find((b) => b.textContent.includes('Remove X')).click();`,
    );
    await sleep(500);

    await driver.executeScript(`
      const field = document.querySelector('.announce-input');
      field.value = '3';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await sleep(200);
    await driver.executeScript(
      `[...document.querySelectorAll('.action-btn.confirm')]
         .find((b) => b.textContent.trim() === 'Announce X').click();`,
    );
    await sleep(700);

    // ---- A spell whose only X is in an additional cost ------------------------------------
    await driver.executeScript(`
      const hit = [...document.querySelectorAll('.hand-cards .card-name')]
        .find((n) => n.textContent.trim() === 'Harvest Pyre');
      if (!hit) throw new Error('Harvest Pyre is not in hand');
      hit.closest('.card').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    `);
    await sleep(600);
    const askedForTheSpell = await driver.executeScript(
      `return {
         prompt: (document.querySelector('.status-message') || {}).textContent.trim(),
         hasField: !!document.querySelector('.announce-input'),
       };`,
    );
    console.log('Harvest Pyre, {1}{R}, X only in an additional cost:');
    console.log(' ', JSON.stringify(askedForTheSpell));

    if (askedForTheSpell.hasField) {
      await driver.executeScript(`
        const field = document.querySelector('.announce-input');
        field.value = '2';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      await sleep(200);
      await driver.executeScript(
        `[...document.querySelectorAll('.action-btn.confirm')]
           .find((b) => b.textContent.trim() === 'Announce X').click();`,
      );
      await sleep(700);

      // Harvest Pyre deals X damage to target creature, so announcing is not the end of it:
      // CR 601.2c follows 601.2b and the board goes on to ask. What this proves is that the
      // number survives the step between — lost there, the spell would be cast for zero.
      console.log(
        '  after announcing:',
        JSON.stringify(
          await driver.executeScript(
            `return (document.querySelector('.status-message') || {}).textContent.trim();`,
          ),
        ),
      );
      await driver.executeScript(`
        const hit = [...document.querySelectorAll('.opponent-field .card-name')]
          .find((n) => n.textContent.trim() === 'Wall of Blossoms');
        if (!hit) throw new Error('no opponent creature to aim at');
        hit.closest('.card').click();
      `);
      await sleep(700);
    }

    console.log('\nWhat reached the hub:');
    for (const call of await driver.executeScript('return window.__gameReplaySent || [];')) {
      console.log(' ', call.target, JSON.stringify(call.arguments));
    }
  } finally {
    await driver.quit();
  }
})();
