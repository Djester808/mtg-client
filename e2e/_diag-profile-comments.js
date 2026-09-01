// Why the profile's comment tab never opens for the capture harness.
//
//   node _diag-profile-comments.js
//
// The state has failed on every run for as long as the harness has had it, and the reason has
// been assumed rather than looked at.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl, username } = require('./config');
const DEVICES = require('./devices');
const { sleep, signInThroughTheForm } = require('./helpers/board-driver');

const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };

(async () => {
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await signInThroughTheForm(d, { By, until }, A);
    const who = username || A.username;
    await d.get(baseUrl + '/u/' + who);
    await sleep(2500);

    console.log('profile of: ' + who);
    console.log(
      'before: ' +
        JSON.stringify(
          await d.executeScript(
            [
              'return {',
              '  page: !!document.querySelector(".up-page"),',
              '  tabs: [].slice.call(document.querySelectorAll(".up-tab")).map(function (t) { return t.textContent.trim().replace(/\\s+/g, " "); }),',
              '  panels: [".up-decks", ".up-comments"].map(function (s) { return s + ":" + document.querySelectorAll(s).length; }),',
              '};',
            ].join(''),
          ),
        ),
    );

    const clicked = await d.executeScript(
      [
        'var tab = [].slice.call(document.querySelectorAll(".up-tab"))',
        '  .filter(function (t) { return /comment/i.test(t.textContent); })[0];',
        'if (!tab) return "no comments tab";',
        'tab.click();',
        'return tab.textContent.trim().replace(/\\s+/g, " ");',
      ].join(''),
    );
    console.log('clicked: ' + JSON.stringify(clicked));
    await sleep(2000);

    console.log(
      'after : ' +
        JSON.stringify(
          await d.executeScript(
            [
              'return {',
              '  panels: [".up-decks", ".up-comments", ".up-empty"].map(function (s) { return s + ":" + document.querySelectorAll(s).length; }),',
              '  activeTab: (document.querySelector(".up-tab.active") || {}).textContent,',
              '  bodyHas: document.body.innerText.slice(0, 160),',
              '};',
            ].join(''),
          ),
        ),
    );

    const logs = await d.manage().logs().get('browser');
    for (const entry of logs.slice(-6)) {
      console.log('  console: ' + String(entry.message).slice(0, 180));
    }
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
