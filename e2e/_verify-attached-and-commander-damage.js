// Verifies two engine-to-screen gaps against the REAL wired app (fetch stub + mocked SignalR
// State push -> GameApiService/SignalRService -> GameViewAdapter -> the NgRx store -> the real
// selectors -> GameBoardComponent/PlayerSidebarComponent/CardComponent), not a component spec
// that hand-builds its own state. A one-off: this is the loop used to capture the two screenshots
// handed to the report, not a registered coverage state.
//
//  1. AttachedTo: adds a "Rancor" permanent to the fixture's battlefield, attachedTo the
//     viewer's own Grizzly Bears (p7). Before the fix this rendered as an ordinary loose
//     permanent; after it, Grizzly Bears should carry a small gold badge and Rancor's tooltip
//     should be silent about being attached to anything.
//  2. Commander damage: the stock fixture already has Bob at
//     commanderDamage: { "Tovolar, Dire Overlord": 14 }, which the adapter used to drop before
//     it ever reached PlayerStateDto. The opponent's sidebar should now show that pill.
const fs = require('fs');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { armGameReplay } = require('./helpers/game-replay');
const DEVICES = require('./devices');

const baseUrl = process.env.BASE_URL || 'http://localhost:4201';
const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE_BATTLEFIELD = [
  {
    id: 'p1',
    name: 'Llanowar Elves',
    oracleId: 'o-llanowar',
    controllerId: 'aaaaaaaa-0000-0000-0000-000000000001',
    manaCost: '{G}',
    typeLine: 'Creature — Elf Druid',
    printedPower: 1,
    printedToughness: 1,
    isTapped: true,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    colors: [],
  },
  {
    id: 'p2',
    name: 'Kalonian Hydra',
    oracleId: 'o-hydra',
    controllerId: 'aaaaaaaa-0000-0000-0000-000000000001',
    manaCost: '{2}{G}{G}',
    typeLine: 'Creature — Hydra',
    printedPower: 0,
    printedToughness: 0,
    isTapped: false,
    hasSummoningSickness: true,
    damageMarked: 0,
    counters: { '+1/+1': 4 },
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    colors: [],
  },
  {
    id: 'p7',
    name: 'Grizzly Bears',
    oracleId: 'o-bears',
    controllerId: 'aaaaaaaa-0000-0000-0000-000000000001',
    manaCost: '{1}{G}',
    typeLine: 'Creature — Bear',
    isPlaneswalker: false,
    isCreature: true,
    printedPower: 2,
    printedToughness: 2,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    isLand: false,
    colors: [],
  },
  {
    id: 'p3',
    name: 'Forest',
    oracleId: 'o-forest',
    controllerId: 'aaaaaaaa-0000-0000-0000-000000000001',
    manaCost: null,
    typeLine: 'Basic Land — Forest',
    printedPower: null,
    printedToughness: null,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    isPlaneswalker: false,
    isCreature: false,
    isLand: true,
    colors: [],
  },
  {
    id: 'p4',
    name: 'Wall of Blossoms',
    oracleId: 'o-wall',
    controllerId: 'bbbbbbbb-0000-0000-0000-000000000002',
    manaCost: '{1}{G}',
    typeLine: 'Creature — Plant Wall',
    printedPower: 0,
    printedToughness: 4,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 2,
    counters: null,
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    colors: [],
  },
  {
    id: 'p5',
    name: 'Prodigal Pyromancer',
    oracleId: 'o-pyromancer',
    controllerId: 'bbbbbbbb-0000-0000-0000-000000000002',
    manaCost: '{2}{R}',
    typeLine: 'Creature — Human Wizard',
    printedPower: 1,
    printedToughness: 1,
    isTapped: true,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    colors: [],
  },
  {
    id: 'pw1',
    name: 'Chandra, Torch of Defiance',
    oracleId: 'o-chandra',
    controllerId: 'bbbbbbbb-0000-0000-0000-000000000002',
    manaCost: '{2}{R}{R}',
    typeLine: 'Legendary Planeswalker — Chandra',
    isPlaneswalker: true,
    printedPower: null,
    printedToughness: null,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: { loyalty: 4 },
    isCreature: false,
    isLand: false,
    colors: [],
  },
  // The addition: an Aura attached to Alice's own Grizzly Bears (CR 303.4, 704.5m).
  {
    id: 'rancor1',
    name: 'Rancor',
    oracleId: 'o-rancor',
    controllerId: 'aaaaaaaa-0000-0000-0000-000000000001',
    manaCost: '{G}',
    typeLine: 'Enchantment — Aura',
    oracleText: 'Enchant creature. Enchanted creature gets +2/+0 and has trample.',
    printedPower: null,
    printedToughness: null,
    isTapped: null,
    hasSummoningSickness: null,
    damageMarked: null,
    counters: null,
    isPlaneswalker: false,
    isCreature: false,
    isLand: false,
    colors: ['Green'],
    attachedTo: 'p7',
  },
];

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  try {
    await armGameReplay(d, { battlefield: BASE_BATTLEFIELD });
    // The board's real route is /game/:gameId (app.routes.ts) — /play is the lobby, which takes
    // no id param. A stale diag script elsewhere in this directory still navigates to
    // /play/<id>, which is not a route at all and lands back on the lobby with nothing to
    // measure.
    await d.get(baseUrl + '/game/11111111-2222-3333-4444-555555555555');
    await sleep(2500);

    const landed = await d.executeScript(`return {
      url: location.href,
      token: !!localStorage.getItem('auth_token'),
      sidebarCount: document.querySelectorAll('.sidebar').length,
      battlefieldCount: document.querySelectorAll('.battlefield').length,
      hits: (window.__gameReplayHits || []).slice(0, 12),
    };`);
    console.log('landed:', JSON.stringify(landed, null, 2));

    if (landed.sidebarCount === 0) {
      console.log('No sidebar rendered. Stopping here rather than measuring an empty page.');
      const shot = await d.takeScreenshot();
      fs.writeFileSync('screenshots/_verify-attached-commander-FAILED.png', shot, 'base64');
      return;
    }

    await d.wait(until.elementLocated(By.css('.battlefield')), 20000);
    await sleep(1000);

    const measured = await d.executeScript(`
      // ---- Gap 1: AttachedTo -----------------------------------------------------------
      const cards = Array.from(document.querySelectorAll('app-card .card'));
      const nameOf = (card) => (card.querySelector('.card-name, .card-info .ci-type') || {}).textContent || '';
      const badges = Array.from(document.querySelectorAll('.counter-badge.attached'));
      const badgeInfo = badges.map((b) => ({
        text: b.textContent.trim(),
        title: b.getAttribute('title'),
      }));

      // ---- Gap 2: commander damage ------------------------------------------------------
      const pills = Array.from(document.querySelectorAll('.commander-damage-pill')).map((p) => ({
        name: (p.querySelector('.cd-name') || {}).textContent,
        amount: (p.querySelector('.cd-amount') || {}).textContent,
      }));

      return {
        cardCount: cards.length,
        attachmentBadgeCount: badges.length,
        badgeInfo,
        commanderDamagePills: pills,
        documentOverflows: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    `);
    console.log('measured:', JSON.stringify(measured, null, 2));

    const shot = await d.takeScreenshot();
    fs.writeFileSync('screenshots/_verify-attached-commander.png', shot, 'base64');
    console.log('shot: screenshots/_verify-attached-commander.png');

    // A close crop on the badge itself and on the commander-damage pill — the full-page shot
    // above is too small at 375px to read either clearly.
    const bearCards = await d.findElements(
      By.xpath("//*[contains(@class,'card-name') and contains(text(),'Grizzly Bears')]"),
    );
    console.log('bear name elements found:', bearCards.length);
    if (bearCards.length > 0) {
      const hostCard = await bearCards[0].findElement(
        By.xpath('ancestor::*[contains(concat(" ", normalize-space(@class), " "), " card ")][1]'),
      );
      const rect = await d.executeScript('return arguments[0].getBoundingClientRect();', hostCard);
      console.log('host card rect:', JSON.stringify(rect));

      // The card is 62x87 at native size. Reparent a clone into a plain, unclipped, unscaled
      // container fixed over everything else, sized up with CSS zoom (not transform, which the
      // card's own :hover rule also uses and which the row's overflow clips) — a crop the CSS
      // itself is honest about, not a hand-tuned pixel window.
      await d.executeScript(
        `
        const clone = arguments[0].cloneNode(true);
        const box = document.createElement('div');
        box.id = '__verify_box';
        box.style.cssText = 'position:fixed;top:0;left:0;background:#0a0a0f;padding:20px;zoom:5;z-index:99999;';
        box.appendChild(clone);
        document.body.appendChild(box);
      `,
        hostCard,
      );
      await sleep(300);
      const cardShot = await d.takeScreenshot();
      fs.writeFileSync('screenshots/_verify-attached-card-crop.png', cardShot, 'base64');
      console.log('crop: screenshots/_verify-attached-card-crop.png');
    }

    const pillEl = await d.findElements(By.css('.commander-damage-row'));
    if (pillEl.length > 0) {
      const pillShot = await pillEl[0].takeScreenshot();
      fs.writeFileSync('screenshots/_verify-commander-damage-crop.png', pillShot, 'base64');
      console.log('crop: screenshots/_verify-commander-damage-crop.png');
    }
  } finally {
    await d.quit();
  }
})();
