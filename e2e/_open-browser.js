// Opens a real, visible Chrome, signs in, and parks on the deck page with the Add Cards
// panel and the Set menu open — the exact control from the bug report. Left running so the
// window stays; close the window or Ctrl-C to end it.
//
//   HEADLESS=false node _open-browser.js [--deck="Chief of the Wild"]
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deckName = (process.argv.find((a) => a.startsWith('--deck=')) || '--deck=Chief of the Wild')
  .split('=')
  .slice(1)
  .join('=');
const HOLD_MINUTES = Number(process.env.HOLD || 60);

(async () => {
  const d = await buildDriver({ device: { os: 'desktop', width: 1500, height: 950 }, dpr: 1 });
  await loginAs(d);
  await sleep(1200);
  await d.get(baseUrl + '/deck');
  await d.wait(until.elementLocated(By.css('.deck-card')), 20000);
  await sleep(1000);
  await d.executeScript(
    `const cards = Array.from(document.querySelectorAll('.deck-card'));
     (cards.find(c => c.textContent.includes(arguments[0])) || cards[0]).click();`,
    deckName,
  );
  await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 25000);
  await sleep(3000);
  await d.executeScript(`
    const b = Array.from(document.querySelectorAll('button')).find(x => /add cards/i.test(x.textContent||''));
    if (b) b.click();`);
  await sleep(2200);
  await d.executeScript(`
    const t = document.querySelector('app-card-search-panel .set-trigger');
    if (t) t.click();`);
  await sleep(600);
  console.log(`Browser open on "${deckName}" with the Set menu showing.`);
  console.log('Try: scroll the set list · pick a set · click SUGGEST for the empty state.');
  console.log(`Holding for ${HOLD_MINUTES} min — close the window when you are done.`);
  // Hold the session so the window stays up; exits when the window goes away.
  const until_ = Date.now() + HOLD_MINUTES * 60_000;
  while (Date.now() < until_) {
    await sleep(5000);
    try {
      await d.getCurrentUrl();
    } catch {
      break;
    }
  }
  await d.quit().catch(() => {});
})();
