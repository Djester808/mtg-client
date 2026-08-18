// Reproduce: open a card, click a keyword in its rules text, press back.
// Reported: you land on the home page rather than back on the card.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = 'Bloodbraid Elf';

const state = async (d) =>
  d.executeScript(`
    return {
      url: location.pathname + location.search,
      historyLength: history.length,
      modalOpen: !!document.querySelector('.card-modal, .modal-oracle'),
      sheetOpen: !!document.querySelector('.kws-panel'),
      sheetTitle: document.querySelector('.kws-title')?.textContent.trim() ?? null,
      searchValue: document.querySelector('input.search-input')?.value ?? null,
      tiles: document.querySelectorAll('.card-tile').length,
    };
  `);

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await loginAs(d);
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('input.search-input')), 20000);
    const box = await d.findElement(By.css('input.search-input'));
    await box.click();
    await box.sendKeys(CARD);
    await sleep(4000);

    await d.executeScript(
      `[...document.querySelectorAll('.card-tile')]
        .find(e => (e.getAttribute('title') || '') === arguments[0]).click();`,
      CARD,
    );
    await sleep(2500);
    console.log('1. card open        :', JSON.stringify(await state(d)));
    console.log('   tabs             :', (await d.getAllWindowHandles()).length);

    // Click the keyword the way a person does.
    await d.executeScript(
      `document.querySelector('.modal-oracle a.kw-link').click();`,
    );
    await sleep(2500);

    const handles = await d.getAllWindowHandles();
    console.log('2. after keyword tap: tabs =', handles.length);
    await d.switchTo().window(handles[handles.length - 1]);
    console.log('   on this tab      :', JSON.stringify(await state(d)));

    // The page's own back control — the only one visible in a fresh tab.
    // Dismiss the sheet and confirm the card is still exactly where it was.
    const closed = await d.executeScript(
      `const b = document.querySelector('.kws-close'); if (b) { b.click(); return true; } return false;`,
    );
    await sleep(1200);
    console.log('3. after closing    :', closed ? JSON.stringify(await state(d)) : 'no sheet to close');
  } finally {
    await d.quit();
  }
})();
