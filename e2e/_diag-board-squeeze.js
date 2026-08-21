// Does the battlefield overlap itself when a tall prompt squeezes it?
//
// The combat capture caught the two halves of the battlefield printing over each other while a
// damage-division prompt was open. This measures it rather than reading it off a picture: it
// arms the board with a choice tall enough to take the space, then compares each half's box
// against the content inside it.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armGameReplay } = require('./helpers/game-replay');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIVISION = {
  id: 'divide:1',
  playerId: 'aaaaaaaa-0000-0000-0000-000000000001',
  kind: 'DivideCombatDamage',
  prompt:
    "Divide Goblin Piker's 2 damage among the 2 creatures blocking it. Pick a creature once " +
    'per point; a creature can only take more than lethal once the others have lethal.',
  minPicks: 2,
  maxPicks: 2,
  isOrdering: false,
  isDivision: true,
  totalToDivide: 2,
  options: [
    { id: 'b1', label: 'Grizzly Bears' },
    { id: 'b2', label: 'Grizzly Bears' },
  ],
};

const measure = (d) =>
  d.executeScript(`
    const halves = [...document.querySelectorAll('.gb-field-half')];
    const field = document.querySelector('.gb-field');
    return {
      field: field ? Math.round(field.getBoundingClientRect().height) : null,
      fieldScrolls: field ? field.scrollHeight > field.clientHeight + 1 : null,
      halves: halves.map((h) => {
        const box = h.getBoundingClientRect();
        const rows = h.querySelector('.gb-permanents');
        return {
          height: Math.round(box.height),
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          contentHeight: Math.round(h.scrollHeight),
          overflowsOwnBox: h.scrollHeight > Math.ceil(box.height) + 1,
          rowsBottom: rows ? Math.round(rows.getBoundingClientRect().bottom) : null,
        };
      }),
    };
  `);

(async () => {
  for (const withChoice of [false, true]) {
    const d = await buildDriver({ device, dpr: 1 });
    try {
      await armGameReplay(d, {
        currentStep: 'CombatDamage',
        ...(withChoice ? { choice: DIVISION } : {}),
      });
      await d.get(baseUrl + '/play/11111111-2222-3333-4444-555555555555');
      await d.wait(until.elementLocated(By.css('.gb-root')), 25000);
      await sleep(2200);

      const m = await measure(d);
      console.log(withChoice ? '--- with a division prompt ---' : '--- no prompt ---');
      console.log('  field ' + m.field + 'px, scrolls: ' + m.fieldScrolls);
      m.halves.forEach((h, i) => {
        console.log(
          '  half ' +
            i +
            ': box ' +
            h.height +
            'px (' +
            h.top +
            '-' +
            h.bottom +
            '), content ' +
            h.contentHeight +
            'px, spills: ' +
            h.overflowsOwnBox +
            ', rows end at ' +
            h.rowsBottom,
        );
      });

      // The halves are stacked, so the first one's content running past the second one's top is
      // the overlap the capture showed.
      if (m.halves.length === 2 && m.halves[0].rowsBottom > m.halves[1].top + 1) {
        console.log(
          '  OVERLAP: the top half prints ' +
            (m.halves[0].rowsBottom - m.halves[1].top) +
            'px into the bottom half',
        );
      }

      require('fs').writeFileSync(
        'e2e/screenshots/_diag-squeeze-' + (withChoice ? 'prompt' : 'plain') + '.png',
        await d.takeScreenshot(),
        'base64',
      );
    } finally {
      await d.quit();
    }
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
