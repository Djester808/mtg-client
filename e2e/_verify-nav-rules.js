// The nav gained a fifth destination, so it is now wider on every page in the app.
// Checks the bar at the widths where it is most likely to break, and the drawer below
// $bp-nav, and confirms the link actually reaches the knowledge base.
const { By, until } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(__dirname, '..', 'screenshots');

// $bp-nav is 900px. The window is ~16px wider than the viewport it yields (scrollbar),
// so these are chosen to land the *inner* width just above the breakpoint, where the
// expanded bar is at its most cramped. Below it the bar is display:none and every
// measurement collapses to zero, which would pass any "fits on one row" check trivially.
const WIDTHS = [1440, 1100, 980, 917];

const PROBE = `
  const bar = document.querySelector('.nav-links');
  const links = [...document.querySelectorAll('.nav-links .nav-link')];
  const boxes = links.map(l => l.getBoundingClientRect());
  const tops = new Set(boxes.map(b => Math.round(b.top)));
  return {
    labels: links.map(l => l.textContent.trim()),
    barShown: !!bar && getComputedStyle(bar).display !== 'none',
    allRendered: boxes.length > 0 && boxes.every(b => b.width > 0 && b.height > 0),
    rows: tops.size,
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    overflows: document.documentElement.scrollWidth > window.innerWidth,
    barScrollsX: bar ? bar.scrollWidth > bar.clientWidth + 1 : null,
  };
`;

(async () => {
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures++;
  };
  fs.mkdirSync(SHOTS, { recursive: true });

  // ---- The bar, at and above $bp-nav ------------------------------------
  for (const width of WIDTHS) {
    const d = await buildDriver({ device: { id: 'w', os: 'desktop', width, height: 900 } });
    try {
      await d.get(baseUrl + '/');
      await d.wait(until.elementLocated(By.css('.nav-links')), 20000);
      await sleep(900);
      const m = await d.executeScript(PROBE);
      check(
        `${width}px (vw ${m.vw}): the expanded bar is what is being measured`,
        m.barShown && m.allRendered,
        `barShown=${m.barShown} allRendered=${m.allRendered}`,
      );
      check(
        `${width}px: five destinations on one row`,
        m.labels.length === 5 && m.rows === 1,
        m.labels.join(' · '),
      );
      check(`${width}px: nothing overflows`, !m.overflows && !m.barScrollsX, `doc ${m.docW} vs vw ${m.vw}`);
      if (width === WIDTHS[WIDTHS.length - 1]) {
        fs.writeFileSync(path.join(SHOTS, '_nav-narrowest-expanded.png'), await d.takeScreenshot(), 'base64');
      }
    } finally {
      await d.quit();
    }
  }

  // ---- The drawer, on a phone -------------------------------------------
  const d = await buildDriver({ device: DEVICES.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await d.get(baseUrl + '/');
    await d.wait(until.elementLocated(By.css('.nav-toggle, .menu-toggle, button')), 20000);
    await sleep(1200);

    await d.executeScript(`
      const t = document.querySelector('.nav-toggle') ||
                [...document.querySelectorAll('button')].find(b => /menu|☰|≡/i.test(b.className + b.textContent));
      if (t) t.click();
    `);
    await sleep(900);

    const drawer = await d.executeScript(`
      const links = [...document.querySelectorAll('.mobile-nav-link')];
      const rules = links.find(l => l.textContent.trim() === 'Rules');
      const r = rules && rules.getBoundingClientRect();
      return {
        labels: links.map(l => l.textContent.trim()),
        rulesHref: rules ? rules.getAttribute('href') : null,
        rulesTap: r ? Math.round(r.height) : null,
        overflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    `);
    check('the drawer lists Rules', drawer.labels.includes('Rules'), drawer.labels.join(' · '));
    check('it points at /kb', drawer.rulesHref === '/kb', String(drawer.rulesHref));
    check('its tap target clears 44px', drawer.rulesTap >= 44, `${drawer.rulesTap}px`);
    check('the drawer does not overflow', !drawer.overflows);
    fs.writeFileSync(path.join(SHOTS, '_nav-drawer.png'), await d.takeScreenshot(), 'base64');

    // Follow it, the way a person would.
    await d.executeScript(
      `[...document.querySelectorAll('.mobile-nav-link')].find(l => l.textContent.trim() === 'Rules').click();`,
    );
    await d.wait(until.elementLocated(By.css('.kb-sidebar')), 20000);
    await sleep(1200);
    const landed = await d.executeScript(
      `return { url: location.pathname, tabs: document.querySelectorAll('.kb-tabs button').length };`,
    );
    check('tapping it opens the knowledge base', landed.url === '/kb' && landed.tabs === 3, JSON.stringify(landed));
    fs.writeFileSync(path.join(SHOTS, '_nav-landed-kb.png'), await d.takeScreenshot(), 'base64');
  } finally {
    await d.quit();
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
