// Verifies the reworked knowledge base against the running app, at 375 x 667.
//
// Two claims need looking at, not reasoning about:
//   1. The KB browses the real Comprehensive Rules — keywords, glossary, search — and
//      shows no implementation status anywhere.
//   2. A card's rules text still links its keywords, including ones the old sixteen-name
//      list did not have, and the link lands on the right entry.
const { By, until } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl, username, password } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERFLOW = `
  return {
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    overflows: document.documentElement.scrollWidth > window.innerWidth,
  };
`;

// Resolved from the script, not the cwd: config.js loads e2e/.env through dotenv, which
// reads it relative to the working directory, so this has to be run from e2e/.
const SHOTS = path.join(__dirname, '..', 'screenshots');

const shot = async (d, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), await d.takeScreenshot(), 'base64');
};

const tapText = async (d, selector, text) => {
  const found = await d.executeScript(
    `const el = [...document.querySelectorAll(arguments[0])]
       .find(e => e.textContent.trim().toLowerCase().includes(arguments[1].toLowerCase()));
     if (el) { el.click(); return el.textContent.trim().slice(0, 60); }
     return null;`,
    selector,
    text,
  );
  await sleep(900);
  return found;
};

(async () => {
  const d = await buildDriver({ device, dpr: 1 });
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures++;
  };

  try {
    // ---- 1. Keywords tab -------------------------------------------------
    await d.get(baseUrl + '/kb');
    await d.wait(until.elementLocated(By.css('.kb-sidebar')), 15000);
    await sleep(1500);

    await tapText(d, '.kb-tabs button', 'keywords');
    const kwCounts = await d.executeScript(`
      const labels = [...document.querySelectorAll('.group-label')].map(e => e.textContent.trim());
      return { labels, items: document.querySelectorAll('.sidebar-item').length };
    `);
    console.log('keyword categories:', JSON.stringify(kwCounts.labels));
    check('all three keyword kinds are listed', kwCounts.labels.length === 3, kwCounts.labels.join(' / '));
    check('far more than the old sixteen keywords', kwCounts.items > 300, `${kwCounts.items} entries`);
    await shot(d, '_kbr-keywords');

    // ---- 2. A keyword the old list never had -----------------------------
    await d.get(baseUrl + '/kb?kw=Cascade');
    await d.wait(until.elementLocated(By.css('.detail-card')), 15000);
    await sleep(1200);
    const cascade = await d.executeScript(`
      const card = document.querySelector('.detail-card');
      return {
        title: document.querySelector('.detail-title')?.textContent.trim(),
        eyebrow: document.querySelector('.detail-eyebrow')?.textContent.trim(),
        ref: document.querySelector('.rule-ref')?.textContent.trim(),
        rules: document.querySelectorAll('.detail-card .rule-line').length,
        text: card ? card.textContent : '',
      };
    `);
    check('?kw= opens the keyword', cascade.title === 'Cascade', `${cascade.eyebrow} · ${cascade.ref}`);
    check('the defining rules are shown', cascade.rules > 1, `${cascade.rules} rule lines`);
    check(
      'no implementation status on the page',
      !/implemented|\bstub\b|not yet enforced|Phase 1/i.test(cascade.text),
    );
    await shot(d, '_kbr-keyword-cascade');

    // ---- 3. Search -------------------------------------------------------
    await d.get(baseUrl + '/kb');
    await d.wait(until.elementLocated(By.css('.kb-sidebar input')), 15000);
    await sleep(1200);
    const box = await d.findElement(By.css('.kb-sidebar input'));
    await box.click();
    await box.sendKeys('summoning sickness');
    await sleep(1800);
    const search = await d.executeScript(`
      const hits = [...document.querySelectorAll('.sidebar-item.hit')];
      return {
        count: hits.length,
        kinds: [...new Set(hits.map(h => h.querySelector('.hit-kind')?.textContent.trim()))],
        first: hits[0]?.textContent.trim().slice(0, 70),
      };
    `);
    check('search returns hits from the rules', search.count > 0, `${search.count} hits: ${search.first}`);
    console.log('hit kinds:', JSON.stringify(search.kinds));
    await shot(d, '_kbr-search');

    const over = await d.executeScript(OVERFLOW);
    check('nothing overflows the document at 375px', !over.overflows, `doc ${over.docW} vs vw ${over.vw}`);

    // ---- 4. Glossary -----------------------------------------------------
    await d.get(baseUrl + '/kb');
    await d.wait(until.elementLocated(By.css('.kb-tabs')), 15000);
    await sleep(1200);
    await tapText(d, '.kb-tabs button', 'glossary');
    await sleep(1200);
    const glossary = await d.executeScript(
      `return { items: document.querySelectorAll('.sidebar-item').length,
                more: document.querySelector('.kb-more')?.textContent.trim() };`,
    );
    check('the glossary loads', glossary.items > 10, `${glossary.items} terms · ${glossary.more}`);
    await shot(d, '_kbr-glossary');

    // ---- 5. Keyword links in a card's rules text -------------------------
    // Card search is behind authGuard, so the modal is only reachable signed in.
    if (!username || !password) {
      console.log('SKIP  card keyword links — no E2E_USERNAME / E2E_PASSWORD in e2e/.env');
      failures++;
      return;
    }
    await loginAs(d);
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('input.search-input')), 15000);
    const cardSearch = await d.findElement(By.css('input.search-input'));
    await cardSearch.click();
    // Bloodbraid Elf carries one keyword the old sixteen-name list had (Haste) and one it
    // did not (Cascade), so a single card answers both halves of the claim.
    const CARD = 'Bloodbraid Elf';
    await cardSearch.sendKeys(CARD);
    await sleep(4000);

    // Tiles are image-only; the name lives in the title attribute.
    const tile = await d.executeScript(
      `const t = [...document.querySelectorAll('.card-tile')]
         .find(e => (e.getAttribute('title') || '').toLowerCase() === arguments[0].toLowerCase());
       if (t) { t.click(); return t.getAttribute('title'); }
       return null;`,
      CARD,
    );
    check('the card opened', tile !== null, String(tile));
    await sleep(2500);

    const links = await d.executeScript(`
      const scope = document.querySelector('.modal-oracle, .card-modal') || document.body;
      const anchors = [...scope.querySelectorAll('a.kw-link')];
      return {
        count: anchors.length,
        terms: anchors.map(a => a.textContent.trim()),
        hrefs: anchors.map(a => a.getAttribute('href')),
        oracle: (document.querySelector('.modal-oracle')?.textContent || '').slice(0, 120),
      };
    `);
    console.log('card text:', links.oracle);
    console.log('linked terms:', JSON.stringify(links.terms), JSON.stringify(links.hrefs));
    check('card rules text carries keyword links', links.count > 0, `${links.count} links`);
    check(
      'a keyword the old list already had still links',
      links.terms.some((t) => /haste/i.test(t)),
    );
    check(
      'a keyword the old list never had now links',
      links.terms.some((t) => /cascade/i.test(t)),
    );
    await shot(d, '_kbr-card-links');

    if (links.hrefs.length) {
      const href = links.hrefs[0];
      await d.get(baseUrl + href);
      await d.wait(until.elementLocated(By.css('.detail-card')), 15000);
      await sleep(1200);
      const landed = await d.executeScript(
        `return document.querySelector('.detail-title')?.textContent.trim();`,
      );
      const expected = decodeURIComponent(href.split('kw=')[1] || '');
      check('the link lands on that keyword', landed === expected, `${href} → "${landed}"`);
      await shot(d, '_kbr-link-target');
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    failures++;
  } finally {
    await d.quit();
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
