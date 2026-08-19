// What is this deck's commander state, and how does the empty-state button actually render?
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device: { os: 'desktop', width: 1500, height: 950 }, dpr: 1 });
  try {
    await loginAs(d);
    await sleep(1200);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 20000);
    await sleep(1000);
    await d.executeScript(`
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      (cards.find(c => c.textContent.includes('Chief of the Wild')) || cards[0]).click();`);
    await d.wait(async () => /\/deck\/[^/]+$/.test(await d.getCurrentUrl()), 25000);
    await sleep(3000);
    const url = await d.getCurrentUrl();
    const id = url.split('/').pop();

    const deck = await d.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      const tok = localStorage.getItem('mtg-token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
      const keys = Object.keys(localStorage);
      fetch('/api/decks/' + arguments[0], { headers: tok ? { Authorization: 'Bearer ' + tok } : {} })
        .then(r => r.json())
        .then(j => done({ keys, id: j.id, name: j.name, format: j.format,
                          commanderOracleId: j.commanderOracleId,
                          cards: (j.cards||[]).length,
                          commanderFlagged: (j.cards||[]).filter(c => c.isCommander).length }))
        .catch(e => done({ error: String(e), keys }));
    `, id);
    console.log('DECK:', JSON.stringify(deck));

    // Commander panel state
    await d.executeScript(`
      const b = Array.from(document.querySelectorAll('.tool-btn')).find(x => /commander/i.test(x.textContent));
      if (b) b.click();`);
    await sleep(1800);
    const panel = await d.executeScript(`
      const q = (s) => document.querySelector(s);
      const ic = (s) => { const e = q(s); return e ? getComputedStyle(e, '::before').content : 'NO ELEMENT'; };
      return {
        emptySlot: !!q('.cp-no-cmdr'),
        removeBtn: !!q('.cp-clear-stale-btn'),
        removeText: (q('.cp-clear-stale-btn')||{}).textContent?.trim() || null,
        cmdrToolIcon: ic('.tool-btn--cmdr i'),
        personPlusIcon: ic('.cp-no-cmdr i'),
      };`);
    console.log('COMMANDER PANEL:', JSON.stringify(panel, null, 1));
    {
      const dir = path.join(__dirname, 'screenshots', 'diag');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'cmdr-panel.png'), await d.takeScreenshot(), 'base64');
    }

    // Suggestions empty-state button
    await d.executeScript(`
      const b = Array.from(document.querySelectorAll('.tool-btn')).find(x => /suggest/i.test(x.textContent));
      if (b) b.click();`);
    await sleep(1800);
    const btn = await d.executeScript(`
      const b = document.querySelector('.sugg-empty-btn');
      if (!b) return { missing: true };
      const i = b.querySelector('i');
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return {
        box: [Math.round(r.width), Math.round(r.height)],
        text: b.textContent.trim(),
        iconClass: i ? i.className : null,
        iconGlyph: i ? getComputedStyle(i, '::before').content : null,
        iconBox: i ? [Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)] : null,
        iconFontFamily: i ? getComputedStyle(i, '::before').fontFamily : null,
        bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, font: cs.fontFamily,
      };`);
    console.log('EMPTY BUTTON:', JSON.stringify(btn, null, 1));
    const dir = path.join(__dirname, 'screenshots', 'diag');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cmdr-state.png'), await d.takeScreenshot(), 'base64');
  } finally {
    await d.quit();
  }
})();
