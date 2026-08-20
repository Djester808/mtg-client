// Opens a visible browser and walks the AI builder, then leaves it open to click around.
//   HEADLESS=false node _demo.js
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armAiBuildReplay, paceAiBuildReplay } = require('./helpers/ai-build-replay');
const { baseUrl, username, password } = require('./config');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log('  ' + m);

(async () => {
  const d = await buildDriver();
  await d.manage().window().setRect({ width: 1400, height: 950 });

  // The build itself is replayed from a recorded response so this costs nothing and does
  // not sit for two and a half minutes. Everything downstream of the network is real.
  await armAiBuildReplay(d);

  await d.get(baseUrl + '/login');
  await d.wait(until.elementLocated(By.id('username')), 20000);
  await d.findElement(By.id('username')).sendKeys(username);
  await d.findElement(By.id('password')).sendKeys(password);
  await d.findElement(By.css('.submit-btn')).click();
  await d.wait(async () => !(await d.getCurrentUrl()).includes('/login'), 15000);
  say('signed in');

  await d.get(baseUrl + '/deck/build');
  await d.wait(until.elementLocated(By.css('.ab-textarea')), 25000);
  await sleep(1200);

  // Typed a character at a time so it reads like a person using it.
  for (const ch of 'wolf tribal') {
    await d.findElement(By.css('.ab-textarea')).sendKeys(ch);
    await sleep(70);
  }
  say('brief typed — this is the text that now reaches the build');
  await sleep(1500);

  await d.executeScript("document.querySelector('.ab-go').click();");
  await d.wait(until.elementLocated(By.css('.ab-cmd')), 25000);
  say('shortlist');
  await sleep(2500);

  await paceAiBuildReplay(d, { chunk: 3000, delay: 90 });
  await d.executeScript("document.querySelector('.ab-cmd .ab-btn-primary').click();");
  say('building — the tile zooms in and the bar counts cards as they are named');
  await d.wait(until.elementLocated(By.css('.ab-row-btn')), 60000);
  await sleep(2000);

  await d.executeScript("document.querySelector('.ab-review-tabs').scrollIntoView({block:'center'});");
  say('review — three tabs, duplicates stacked, assessment collapsed');
  await sleep(2500);

  await d.executeScript("document.querySelectorAll('.ab-review-tab')[1].click();");
  await sleep(2000);
  await d.executeScript("document.querySelector('.ab-row-btn').click();");
  await d.wait(until.elementLocated(By.css('.card-modal')), 15000);
  say('a row opens the real card modal');
  await sleep(3000);
  await d.executeScript("const b=document.querySelector('.modal-close-btn'); if(b) b.click();");
  await sleep(1200);

  await d.executeScript(
    "const t=document.querySelector('.ab-assess-toggle'); if(t){ t.scrollIntoView({block:'center'}); t.click(); }");
  say('assessment expanded — the findings that were behind the pill');
  await sleep(4000);

  // Now the refine panel, on a deck that already exists.
  await d.get(baseUrl + '/deck/f212e621-78ff-4952-8032-31fbd221199d');
  await d.wait(until.elementLocated(By.css('.groups-area')), 30000);
  await sleep(2000);
  await d.executeScript(
    "const b=Array.from(document.querySelectorAll('.tool-btn')).filter(x=>/refine/i.test(x.textContent))[0]; if(b) b.click();");
  await sleep(1800);
  await d.executeScript(
    "const b=Array.from(document.querySelectorAll('.rf-btn')).filter(x=>/suggest/i.test(x.textContent))[0]; if(b) b.click();");
  say('refine — proposals you approve one at a time, nothing written yet');
  await sleep(3000);

  console.log('\n  Browser is yours. It stays open for 15 minutes.');
  await sleep(15 * 60 * 1000);
  await d.quit();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
