#!/usr/bin/env node
//
// One-off: why does the delta chip not show after a driven tap?
//
// The life total moves, so the handler runs. This dumps what the DOM actually holds at
// several points after the press, rather than guessing which of the timers is at fault.

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `return {
  life: (document.querySelector('.life') || {}).textContent,
  deltas: [...document.querySelectorAll('.delta')].map((e) => e.className + '=' + e.textContent.trim()),
  panelClasses: (document.querySelector('.panel') || {}).className,
};`;

(async () => {
  const d = await buildDriver(
    DEVICES.find((x) => x.id === 'iphone-se'),
    1,
  );

  try {
    await d.get(baseUrl + '/tools/life-counter');
    await d.executeScript(
      "Object.keys(localStorage).filter((k) => k.startsWith('mtg.life-counter'))" +
        '.forEach((k) => localStorage.removeItem(k));',
    );
    await d.get(baseUrl + '/tools/life-counter');
    await d.wait(until.elementLocated(By.css('.setup')), 20000);
    await d.executeScript(`document.querySelector('.setup-actions .primary-btn').click();`);
    await d.wait(until.elementLocated(By.css('.lc-grid')), 10000);
    await sleep(500);

    // Record every pointer/mouse event the zone actually receives, so a missing handler and
    // a handler that ran and was undone look different.
    await d.executeScript(`
      window.__seen = [];
      const zone = document.querySelector('.tap-down');
      for (const type of ['pointerdown','pointerup','pointercancel','pointerleave','click','mousedown']) {
        zone.addEventListener(type, () => window.__seen.push(type), true);
      }
    `);

    const box = await d.executeScript(`
      const b = document.querySelector('.tap-down').getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    `);

    console.log('\n--- before ---');
    console.log(await d.executeScript(PROBE));

    await d.actions({ async: true }).move({ x: box.x, y: box.y }).press().release().perform();

    for (const wait of [0, 60, 200, 600, 1300, 1800]) {
      await sleep(wait === 0 ? 0 : wait);
      console.log(`--- +${wait}ms ---`);
      console.log(await d.executeScript(PROBE));
    }

    console.log('\nevents the zone saw:', await d.executeScript('return window.__seen;'));
  } finally {
    await d.quit();
  }
})();
