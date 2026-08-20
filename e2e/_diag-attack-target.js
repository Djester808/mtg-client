// Does the board let a creature be aimed at a planeswalker, and does the badge fit at 375?
//
// A one-off: the registered state in shoot-states.js is the coverage, this is the loop used to
// get there. It reports why the board did not render as readily as it reports the layout,
// because on this machine the first three attempts died in the route guard rather than in CSS.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armGameReplay } = require('./helpers/game-replay');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await armGameReplay(d, { currentStep: 'DeclareAttackers' });
    await d.get(baseUrl + '/play/11111111-2222-3333-4444-555555555555');
    await sleep(2500);

    const landed = await d.executeScript(`return {
      url: location.href,
      token: !!localStorage.getItem('auth_token'),
      board: !!document.querySelector('.gb-root'),
      hits: (window.__gameReplayHits || []).slice(0, 12),
    };`);
    console.log('landed:', JSON.stringify(landed, null, 2));

    if (!landed.board) {
      console.log('No board. Stopping here rather than measuring an empty page.');
      return;
    }

    await d.wait(until.elementLocated(By.css('.gb-actions button')), 20000);
    await sleep(800);

    // Two taps on one of the viewer's untapped creatures: player, then planeswalker.
    const mine = await d.findElements(
      By.css(
        '.gb-field-half:last-child .gb-permanent:not(.is-tapped):not(.is-sick):has(.gb-permanent-stats)',
      ),
    );
    console.log('tappable creatures:', mine.length);
    if (mine.length > 0) {
      await mine[0].click();
      await sleep(300);
      const afterOne = await d.executeScript(
        `return (document.querySelector('.gb-permanent-note') || {}).textContent || null;`,
      );
      console.log('after one tap:', JSON.stringify(afterOne && afterOne.trim()));

      await mine[0].click();
      await sleep(300);
    }

    const measured = await d.executeScript(`
      const notes = Array.from(document.querySelectorAll('.gb-permanent-note'))
        .map((n) => (n.textContent || '').trim());
      const overflowing = Array.from(document.querySelectorAll('.gb-permanent'))
        .filter((c) => c.scrollWidth > c.clientWidth + 1)
        .map((c) => c.querySelector('.gb-permanent-name').textContent.trim());
      const hint = document.querySelector('.gb-hint');
      return {
        notes,
        hint: hint ? hint.textContent.trim() : null,
        overflowingCards: overflowing,
        documentOverflows: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        attackButton: (
          Array.from(document.querySelectorAll('.gb-btn-primary')).find((b) =>
            /attack/i.test(b.textContent || ''),
          ) || {}
        ).textContent,
      };
    `);
    console.log('measured:', JSON.stringify(measured, null, 2));

    const shot = await d.takeScreenshot();
    require('fs').writeFileSync('e2e/screenshots/_diag-attack-target.png', shot, 'base64');
    console.log('shot: e2e/screenshots/_diag-attack-target.png');
  } finally {
    await d.quit();
  }
})();
