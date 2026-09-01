// Opens a brand-new game on the original board, to find out what it does with the decision the
// engine opens on.
//
//   node _diag-fresh-game.js
//
// Every game starts by asking each player whether to keep their hand (CR 103.4). The rebuilt
// engine puts that on the wire as `view.choice` and waits. The board predates the idea, so this
// exists to see what it actually shows rather than to assume.
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');
const {
  sleep,
  api,
  signIn,
  userIdFromToken,
  deckFor,
  signInThroughTheForm,
} = require('./helpers/board-driver');

const NL = String.fromCharCode(10);
const A = { username: 'restart-check-a', password: 'restart-check-a-pw' };
const B = { username: 'restart-check-b', password: 'restart-check-b-pw' };
const DECK_A = ['40 Mountain', '30 Goblin Piker'].join(NL);
const DECK_B = ['40 Forest', '30 Grizzly Bears'].join(NL);

(async () => {
  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  const deckA = await deckFor(tokenA, 'Played Game Red', DECK_A);
  const deckB = await deckFor(tokenB, 'Played Game Green', DECK_B);

  const invite = await api(tokenA, 'POST', '/api/games/invites', {
    deckId: deckA,
    opponentUserId: userIdFromToken(tokenB),
    startingLife: 20,
  });
  const gameId = (
    await api(tokenB, 'POST', '/api/games/invites/' + invite.id + '/accept', { deckId: deckB })
  ).gameId;

  // Untouched: nobody has answered anything yet.
  const view = await api(tokenA, 'GET', '/api/games/' + gameId);
  console.log('fresh game ' + gameId);
  console.log('  the engine is asking : ' + JSON.stringify(view.choice && view.choice.prompt));
  console.log('  of                   : ' + JSON.stringify(view.choice && view.choice.playerId));
  console.log('  step                 : ' + view.currentStep + ', turn ' + view.turnNumber);

  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.manage().window().setRect({ width: 1600, height: 1100 });
    await signInThroughTheForm(d, { By, until }, A);
    await d.executeScript(
      'localStorage.setItem("mtg_session", JSON.stringify({ gameId: arguments[0], playerToken: "" }));',
      gameId,
    );
    await d.get(baseUrl + '/game/' + gameId);
    await d.wait(until.elementLocated(By.css('.board')), 25000);
    await sleep(3000);

    const onScreen = await d.executeScript(
      [
        'var text = function (s) { var el = document.querySelector(s); return el ? el.textContent.trim().replace(/\\s+/g, " ") : null; };',
        'return {',
        '  status: text(".status-message"),',
        '  buttons: [].slice.call(document.querySelectorAll(".status-actions button")).map(function (b) { return b.textContent.trim(); }),',
        '  handCards: document.querySelectorAll(".hand-card-wrapper").length,',
        '  anythingAboutKeeping: /keep|mulligan/i.test(document.body.innerText),',
        '};',
      ].join(''),
    );
    console.log('  the board shows      : ' + JSON.stringify(onScreen, null, 2).split(NL).join(NL + '  '));

    // And it can be answered, on screen, by pressing what it offers.
    const pressed = await d.executeScript(
      [
        'var keep = [].slice.call(document.querySelectorAll(".status-actions .action-btn.choice"))',
        '  .filter(function (b) { return /keep/i.test(b.textContent); })[0];',
        'if (!keep) return null;',
        'keep.click();',
        'return keep.textContent.trim();',
      ].join(''),
    );
    console.log('  pressed              : ' + JSON.stringify(pressed));
    await sleep(2500);

    const after = await d.executeScript(
      [
        'var text = function (s) { var el = document.querySelector(s); return el ? el.textContent.trim().replace(/\s+/g, " ") : null; };',
        'return {',
        '  status: text(".status-message"),',
        '  buttons: [].slice.call(document.querySelectorAll(".status-actions button")).map(function (b) { return b.textContent.trim(); }),',
        '  turn: text(".turn-badge"),',
        '};',
      ].join(''),
    );
    console.log('  after answering      : ' + JSON.stringify(after, null, 2).split(NL).join(NL + '  '));
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
