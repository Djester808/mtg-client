#!/usr/bin/env node
//
// One-off: drive the life counter end to end against a running API and say what happened.
//
//   node _verify-life-counter.js
//
// Underscore-prefixed on purpose — this is not coverage (see CLAUDE.md); the registered
// states in shoot-states.js are. It exists because the capture harness photographs layouts
// and cannot tell you whether tapping a panel moves a number, whether commander damage
// takes the life with it, or whether a filed game reaches the database.

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
}

/** The life total showing on the nth panel. */
async function lifeAt(d, n) {
  return d.executeScript(
    `return Number(document.querySelectorAll('.life')[arguments[0]].textContent.trim());`,
    n,
  );
}

async function signInToApp(d) {
  await d.get(baseUrl + '/login');
  await d.wait(until.elementLocated(By.id('username')), 15000);
  await d.findElement(By.id('username')).sendKeys(username);
  await d.findElement(By.id('password')).sendKeys(password);
  await d.findElement(By.css('.submit-btn')).click();
  await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
  await sleep(600);
}

async function dealTable(d, count) {
  await d.get(baseUrl + '/tools/life-counter');
  await d.executeScript(
    // Only the counter's own keys. `localStorage.clear()` also takes `auth_token`, which
    // signs the browser out — and the state after this one then captures a logged-out screen
    // with nothing on it to say why.
    "Object.keys(localStorage).filter((k) => k.startsWith('mtg.life-counter'))" +
      '.forEach((k) => localStorage.removeItem(k));',
  );
  await d.get(baseUrl + '/tools/life-counter');
  await d.wait(until.elementLocated(By.css('.setup')), 20000);
  await sleep(300);
  await d.executeScript(
    `
    const groups = [...document.querySelectorAll('.setup-group')];
    const byText = (g, t) => [...g.querySelectorAll('.pick')].find((b) => b.textContent.trim() === t);
    byText(groups[0], String(arguments[0])).click();
    byText(groups[1], '40').click();
  `,
    count,
  );
  await sleep(200);
  await d.executeScript(`document.querySelector('.setup-actions .primary-btn').click();`);
  await d.wait(until.elementLocated(By.css('.lc-grid')), 10000);
  await sleep(500);
}

/** A real pointer press on one half of a panel, at its centre. */
async function tapHalf(d, panelIndex, half) {
  const zone = await d.executeScript(
    `
    const panel = document.querySelectorAll('app-player-panel')[arguments[0]];
    const el = panel.querySelector(arguments[1] === 'up' ? '.tap-up' : '.tap-down');
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  `,
    panelIndex,
    half,
  );

  // Through the actions API rather than a synthetic event, so this exercises the same
  // pointerdown/pointerup path a finger produces.
  await d.actions({ async: true }).move({ x: zone.x, y: zone.y }).press().release().perform();
}

async function readMyRecord(d) {
  return d.executeAsyncScript(`
    var done = arguments[arguments.length - 1];
    var token = localStorage.getItem('auth_token');
    fetch('/api/matches/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : { error: r.status }; })
      .then(done)
      .catch(function (e) { done({ error: String(e) }); });
  `);
}

(async () => {
  if (!username || !password) {
    console.error('No credentials in e2e/.env — this script needs a real account.');
    process.exit(2);
  }

  const device = DEVICES.find((x) => x.id === 'iphone-se');
  const d = await buildDriver(device, 1);

  try {
    console.log('\n=== Life counter, end to end (375x667) ===\n');

    await signInToApp(d);
    const before = await readMyRecord(d);
    console.log(`  (record before: played ${before.played}, wins ${before.wins})`);

    // ---- Tapping ------------------------------------------------------------------
    await dealTable(d, 2);

    const startLife = await lifeAt(d, 0);
    check('table deals at 40', startLife === 40, `life ${startLife}`);

    // Seat 0 is the flipped one at 2 players, so this also proves the rotated tap zone
    // still maps the way the player sitting there expects.
    await tapHalf(d, 0, 'down');
    await sleep(150);
    const afterDown = await lifeAt(d, 0);
    check('a tap on the left half takes 1 life', afterDown === 39, `life ${afterDown}`);

    const chip = await d.executeScript(
      `const el = document.querySelector('.delta-pending'); return el && el.textContent.trim();`,
    );
    check('the change shows as a delta', chip === '−1', `chip ${JSON.stringify(chip)}`);

    await tapHalf(d, 0, 'down');
    await tapHalf(d, 0, 'down');
    await sleep(150);
    const gathered = await d.executeScript(
      `const el = document.querySelector('.delta-pending'); return el && el.textContent.trim();`,
    );
    check('quick taps gather into one running total', gathered === '−3', `chip ${gathered}`);

    await sleep(1400);
    const flew = await d.executeScript(
      `return !!document.querySelector('.delta-flying') || !document.querySelector('.delta');`,
    );
    check('the total commits once the tapping stops', flew === true);

    await tapHalf(d, 0, 'up');
    await sleep(150);
    const afterUp = await lifeAt(d, 0);
    check('the right half gives life back', afterUp === 38, `life ${afterUp}`);

    // ---- Commander damage takes the life with it ------------------------------------
    await d.executeScript(`document.querySelectorAll('.seat-menu')[0].click();`);
    await d.wait(until.elementLocated(By.css('.sheet')), 10000);
    await d.executeScript(
      `[...document.querySelectorAll('.sheet-tab')].find((b) => b.textContent.trim() === 'Commander').click();`,
    );
    await sleep(400);

    for (let i = 0; i < 6; i++) {
      await d.executeScript(`document.querySelector('.sheet-body .row .step-up').click();`);
      await sleep(60);
    }
    const tally = await d.executeScript(
      `return Number(document.querySelector('.sheet-body .row .step-value').textContent.trim());`,
    );
    await d.executeScript(`document.querySelector('.sheet-close').click();`);
    await sleep(400);

    const afterCmd = await lifeAt(d, 0);
    check('commander damage tallies', tally === 6, `tally ${tally}`);
    check(
      'commander damage also comes off the life total (CR 903.10a)',
      afterCmd === 32,
      `life ${afterCmd} (expected 38 - 6)`,
    );

    // ---- Card art as a backdrop ------------------------------------------------------------
    await d.executeScript(`document.querySelectorAll('.seat-menu')[0].click();`);
    await d.wait(until.elementLocated(By.css('.sheet')), 10000);
    await d.executeScript(
      `[...document.querySelectorAll('.sheet-tab')].find((b) => b.textContent.trim() === 'Seat').click();`,
    );
    await sleep(300);
    await d.executeScript(
      `[...document.querySelectorAll('.link-btn')].find((b) => /picture/i.test(b.textContent)).click();`,
    );
    await d.wait(until.elementLocated(By.css('.picker')), 10000);
    await sleep(300);

    const hasSearch = await d.executeScript(`return !!document.querySelector('app-search-input');`);
    check('a signed-in table can search card art', hasSearch === true);

    await d.findElement(By.css('app-search-input input')).sendKeys('Ashaya');
    await d.wait(until.elementLocated(By.css('.art-tile')), 20000);
    await sleep(400);

    const tileCount = await d.executeScript(
      `return document.querySelectorAll('.art-tile').length;`,
    );
    check('the search returns art to choose from', tileCount > 0, `${tileCount} tiles`);

    await d.executeScript(`document.querySelector('.art-tile').click();`);
    await sleep(600);

    const backdropLabel = await d.executeScript(
      `const el = document.querySelector('.art-text .row-note'); return el && el.textContent.trim();`,
    );
    check(
      'the chosen card becomes the seat backdrop',
      !!backdropLabel && !/Nothing behind/.test(backdropLabel),
      backdropLabel,
    );

    await d.executeScript(`document.querySelector('.sheet-close').click();`);
    await sleep(500);

    const panelArt = await d.executeScript(
      `const el = document.querySelector('app-player-panel .panel-art');
       return el && getComputedStyle(el).backgroundImage;`,
    );
    check(
      'the panel actually paints it',
      !!panelArt && panelArt !== 'none' && panelArt.indexOf('url(') === 0,
      panelArt && panelArt.slice(0, 60),
    );

    // ---- Signing a seat in ------------------------------------------------------------
    await d.executeScript(`document.querySelectorAll('.seat-menu')[0].click();`);
    await d.wait(until.elementLocated(By.css('.sheet')), 10000);
    await d.executeScript(
      `[...document.querySelectorAll('.sheet-tab')].find((b) => b.textContent.trim() === 'Seat').click();`,
    );
    await sleep(300);
    await d.executeScript(
      `[...document.querySelectorAll('.link-btn')].find((b) => /Sign in at this seat/.test(b.textContent)).click();`,
    );
    await sleep(300);
    await d.findElement(By.css('input[name="username"]')).sendKeys(username);
    await d.findElement(By.css('input[name="password"]')).sendKeys(password);
    await d.executeScript(`document.querySelector('.signin-form .primary-btn').click();`);
    await sleep(1500);

    const seatName = await d.executeScript(
      `const el = document.querySelector('.signin-block .row-name'); return el && el.textContent.trim();`,
    );
    check('the seat signs in on its own', /^Signed in as /.test(seatName || ''), seatName);

    await sleep(900);
    const shownRecord = await d.executeScript(
      `const cells = [...document.querySelectorAll('.record-cell')];
       return cells.map((c) => c.querySelector('dt').textContent.trim() + '=' +
                               c.querySelector('dd').textContent.trim()).join(' ');`,
    );
    check(
      'the seat is shown its own win/loss record',
      /Played=\d+/.test(shownRecord || '') && /Won=\d+/.test(shownRecord || ''),
      shownRecord,
    );

    await d.executeScript(`document.querySelector('.sheet-close').click();`);
    await sleep(400);

    // ---- Ending it and filing it ---------------------------------------------------------
    await d.executeScript(`
      const sheet = document.querySelector('.sheet');
      if (sheet) document.querySelector('.sheet-close').click();
    `);
    await d.executeScript(`document.querySelectorAll('.seat-menu')[1].click();`);
    await d.wait(until.elementLocated(By.css('.sheet')), 10000);
    await d.executeScript(
      `[...document.querySelectorAll('.sheet-tab')].find((b) => b.textContent.trim() === 'Seat').click();`,
    );
    await sleep(300);
    await d.executeScript(
      `[...document.querySelectorAll('.out-actions .ghost-btn')].find((b) => /Conceded/.test(b.textContent)).click();`,
    );
    await sleep(300);
    await d.executeScript(`document.querySelector('.sheet-close').click();`);
    await sleep(500);

    const resultText = await d.executeScript(
      `const el = document.querySelector('.lc-result'); return el && el.textContent.replace(/\\s+/g, ' ').trim();`,
    );
    check('the game ends and names the winner', /wins\./.test(resultText || ''), resultText);

    const hasRecordBtn = await d.executeScript(
      `return !![...document.querySelectorAll('.lc-result button')].find((b) => /Record result/.test(b.textContent));`,
    );
    check('it offers to file the game', hasRecordBtn === true);

    await d.executeScript(
      `[...document.querySelectorAll('.lc-result button')].find((b) => /Record result/.test(b.textContent)).click();`,
    );
    await sleep(2500);

    const toast = await d.executeScript(
      `const el = document.querySelector('app-toast-container'); return el && el.textContent.replace(/\\s+/g, ' ').trim();`,
    );
    check('the server credits the signed-in seat', /Recorded for /.test(toast || ''), toast);

    const after = await readMyRecord(d);
    check(
      'the record moves by exactly one win',
      after.played === before.played + 1 && after.wins === before.wins + 1,
      `played ${before.played}->${after.played}, wins ${before.wins}->${after.wins}`,
    );

    const latest = after.recent && after.recent[0];
    check(
      'the filed game carries the opponent and the outcome',
      !!latest && latest.won === true && latest.seatCount === 2,
      latest && JSON.stringify(latest),
    );

    const gone = await d.executeScript(
      `return !![...document.querySelectorAll('.lc-result')].find((e) => /Recorded\\./.test(e.textContent));`,
    );
    check('it will not file the same game twice', gone === true);

    await d
      .takeScreenshot()
      .then((png) =>
        require('fs').writeFileSync(
          require('path').join(__dirname, 'screenshots', 'iphone-se', '_verify-life-counter.png'),
          png,
          'base64',
        ),
      );
  } finally {
    await d.quit();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
