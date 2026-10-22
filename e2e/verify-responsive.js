const fs = require('fs'),
  path = require('path'),
  https = require('https');
const root = path.resolve(__dirname, '..');
const { By, until } = require(root + '/e2e/node_modules/selenium-webdriver');
const { buildDriver } = require(root + '/e2e/helpers/driver');
const devices = require(root + '/e2e/devices');
const directory = path.join(__dirname, 'screenshots'),
  phase = 'responsive';
let session = null;
async function api(url, method = 'GET', body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'localhost',
        port: 7001,
        path: '/api/' + url,
        method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(session?.token ? { Authorization: 'Bearer ' + session.token } : {}),
        },
      },
      (res) => {
        let value = '';
        res.on('data', (c) => (value += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300)
            return reject(Error(url + ': ' + res.statusCode));
          resolve(value ? JSON.parse(value) : null);
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}
async function setup() {
  if (!session) {
    const name = 'layouttest_' + Date.now();
    session = {
      username: name,
      email: name + '@example.test',
      password: 'LayoutTest!' + Date.now(),
    };
    const auth = await api('auth/register', 'POST', {...(session), acceptedTerms:true});
    session.token = auth.token;
    const commander = await api(
      'cards/by-name?name=' + encodeURIComponent("Atraxa, Praetors' Voice"),
    );
    session.collection = (
      await api('collections', 'POST', {
        name: 'Commander staples, trades, and cards from my latest draft',
        description: 'A realistic collection with several card types, printings, and quantities.',
      })
    ).id;
    session.deck = (
      await api('decks', 'POST', {
        name: 'Atraxa — counters and proliferate, first Commander build',
        format: 'commander',
        commanderOracleId: commander.oracleId,
        coverUri: commander.imageUriArtCrop,
      })
    ).id;
    for (const name of [
      'Sol Ring',
      'Lightning Bolt',
      'Farseek',
      'Counterspell',
      'Cultivate',
      'Swords to Plowshares',
      'Arcane Signet',
      'Command Tower',
      'Forest',
      'Island',
      'Evolving Wilds',
      'Eternal Witness',
      'Questing Beast',
      'Elder Gargaroth',
      'Carnage Tyrant',
    ]) {
      const card = await api('cards/by-name?name=' + encodeURIComponent(name));
      for (const id of [session.collection, session.deck])
        await api('collections/' + id + '/cards', 'POST', {
          oracleId: card.oracleId,
          quantity: name === 'Forest' ? 77 : name === 'Island' ? 10 : 1,
        });
    }
  } else {
    session.token = (
      await api('auth/login', 'POST', { username: session.username, password: session.password })
    ).token;
  }
}
async function open(d, url) {
  await d.get('http://127.0.0.1:4200' + url);
  await d.wait(until.elementLocated(By.css('app-navbar,.intro-skip')), 15000);
  const skips = await d.findElements(By.css('.intro-skip'));
  if (skips.length) await skips[0].click();
  await d.wait(async () => !(await d.findElements(By.css('.brand-intro'))).length, 15000);
}
async function click(d, selector) {
  const el = await d.wait(until.elementLocated(By.css(selector)), 15000);
  await d.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
  await el.click();
}
async function mode(d, title) {
  const menu = await d.findElement(By.css('.cgf-menu-btn'));
  if ((await menu.isDisplayed()) && !(await menu.getAttribute('class')).includes('is-open'))
    await menu.click();
  await click(d, '.view-toggle button[title="' + title + '"]');
  const current = await d.findElements(By.css('.cgf-menu-btn'));
  if (
    current.length &&
    (await current[0].isDisplayed()) &&
    (await current[0].getAttribute('class')).includes('is-open')
  )
    await current[0].click();
}
const states = [
  [
    'deck-free',
    'deck',
    async (d) => {
      await mode(d, 'Free arrange');
    },
  ],
  ['collection-grid', '/collection/' + (session?.collection ?? ''), async () => {}],
  [
    'collection-controls',
    'collection',
    async (d) => {
      const button = await d.findElement(By.css('.cgf-menu-btn'));
      if (await button.isDisplayed()) await click(d, '.cgf-menu-btn');
    },
  ],
  [
    'collection-add',
    'collection',
    async (d) => {
      await click(d, '.header-right .add-btn');
    },
  ],
  [
    'collection-build',
    'collection',
    async (d) => {
      await mode(d, 'Build mode — search fills the area, collection as a side list');
    },
  ],
  [
    'deck-visual',
    'deck',
    async (d) => {
      await mode(d, 'Visual view');
    },
  ],
  [
    'deck-controls',
    'deck',
    async (d) => {
      const button = await d.findElement(By.css('.cgf-menu-btn'));
      if (await button.isDisplayed()) await click(d, '.cgf-menu-btn');
    },
  ],
  [
    'deck-add',
    'deck',
    async (d) => {
      await click(d, '.vbar-add-btn');
    },
  ],
  [
    'deck-build',
    'deck',
    async (d) => {
      await mode(d, 'Build mode — search fills the board, deck as a side list');
    },
  ],
  [
    'deck-stats',
    'deck',
    async (d) => {
      await click(d, 'button[title="Stats"]');
    },
  ],
  ['ai-builder', '/deck/build', async () => {}],
];
const audit = () => {
  const visible = (e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const rect = (e) =>
    e
      ? Object.fromEntries(
          ['x', 'y', 'width', 'height', 'bottom', 'right'].map((k) => [
            k,
            Math.round(e.getBoundingClientRect()[k]),
          ]),
        )
      : null;
  const selectors = [
    '.detail-header',
    '.validation-bar',
    '.grid-area',
    '.groups-area',
    '.grid-filters',
    '.cgf-row',
    '.cgf-left',
    '.cgf-right',
    '.filter-bar',
    '.cgf-clusters.is-open',
    '.results-list',
    '.tool-row',
    '.side-panel.is-open',
    'app-card-search-panel.is-open',
    '.swap-board',
    '.swap-list',
    'app-card-side-list',
    '.ab-page',
  ];
  return {
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth - innerWidth,
    freeColumns: [...document.querySelectorAll('.free-col')].map(rect),
    areas: Object.fromEntries(selectors.map((s) => [s, rect(document.querySelector(s))])),
    controls: [
      ...document.querySelectorAll(
        '.detail-header button,.tool-btn,.cgf-menu-btn,.panel-close-btn',
      ),
    ]
      .filter(visible)
      .map((e) => ({ text: e.textContent.trim(), title: e.title, ...rect(e) })),
    tiles: [...document.querySelectorAll('.visual-card,.card-wrap,.free-card')]
      .slice(0, 8)
      .map(rect),
  };
};
(async () => {
  if (process.argv.includes('--cleanup')) {
    await setup();
    await api('account', 'DELETE', { password: session.password });
    console.log('Disposable layout account removed.');
    return;
  }
  await setup();
  const output = path.join(directory, phase);
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  const profiles = !process.argv.includes('--quick')
    ? [
        ...devices.filter((d) => ['iphone-se', 'ipad-mini', 'desktop'].includes(d.id)),
        { ...devices.find((d) => d.id === 'desktop'), id: 'laptop-1024', width: 1024, height: 900 },
        { ...devices.find((d) => d.id === 'desktop'), id: 'nav-900', width: 900, height: 900 },
        { ...devices.find((d) => d.id === 'iphone-se'), id: 'phone-640', width: 640, height: 800 },
        { ...devices.find((d) => d.id === 'iphone-se'), id: 'landscape', width: 844, height: 390 },
        { ...devices.find((d) => d.id === 'desktop'), id: 'wide-1600', width: 1600, height: 1080 },
      ]
    : devices.filter((d) => ['iphone-se', 'ipad-mini', 'desktop'].includes(d.id));
  const selected = process.argv
    .find((arg) => arg.startsWith('--devices='))
    ?.split('=')[1]
    .split(',');
  for (const profile of profiles.filter((p) => !selected || selected.includes(p.id))) {
    const d = await buildDriver({ device: profile, dpr: 1 });
    try {
      await open(d, '/');
      await d.executeScript(
        'localStorage.setItem("auth_token",arguments[0]);localStorage.setItem("auth_username",arguments[1]);localStorage.removeItem("compleat.ui.preferences")',
        session.token,
        session.username,
      );
      for (const [name, route, prepare] of states) {
        if (
          process.argv.includes('--quick') &&
          ['collection-controls', 'collection-build', 'deck-controls', 'deck-build'].includes(name)
        )
          continue;
        const url =
          name === 'collection-grid'
            ? '/collection/' + session.collection
            : route === 'collection'
              ? '/collection/' + session.collection
              : route === 'deck'
                ? '/deck/' + session.deck
                : route;
        try {
          await d.executeScript(
            'localStorage.removeItem("collection-swap-mode");localStorage.removeItem("deck-swap-mode")',
          );
          await open(d, url);
          await d.wait(
            until.elementLocated(
              By.css(name === 'ai-builder' ? '.ab-card' : '.grid-filters,.filter-bar'),
            ),
            20000,
          );
          await new Promise((r) => setTimeout(r, 800));
          await prepare(d);
          if (name.endsWith('-build')) {
            const input = await d.findElement(
              By.css('app-card-search-panel.is-open .search-input'),
            );
            await input.sendKeys('Sol Ring');
            await d.wait(
              until.elementLocated(
                By.css(
                  'app-card-search-panel.is-open .result-tile,app-card-search-panel.is-open .result-row',
                ),
              ),
              15000,
            );
          }
          await new Promise((r) => setTimeout(r, 500));
          // Preserve the scrolling caused by real clicks, including short landscape pages.
          if (profile.id === 'landscape' && name.endsWith('-build'))
            await d.executeScript(
              'const panel=document.querySelector("app-card-search-panel.is-open");document.querySelector(".app-content").scrollTop+=panel.getBoundingClientRect().top-52;',
            );
          const data = await d.executeScript(audit);
          fs.writeFileSync(
            path.join(output, profile.id + '-' + name + '.png'),
            await d.takeScreenshot(),
            'base64',
          );
          results.push({ device: profile.id, state: name, ...data });
          console.log(profile.id, name, JSON.stringify(data.areas));
        } catch (error) {
          results.push({ device: profile.id, state: name, error: error.message });
          fs.writeFileSync(
            path.join(output, profile.id + '-' + name + '-error.png'),
            await d.takeScreenshot(),
            'base64',
          );
          console.log(profile.id, name, 'FAILED', error.message.split('\n')[0]);
        }
      }
    } finally {
      await d.quit();
    }
  }
  const report = path.join(output, 'report.json');
  let merged = results;
  if (process.argv.some((arg) => arg.startsWith('--devices=')) && fs.existsSync(report)) {
    const measured = new Set(results.map((r) => r.device + ':' + r.state));
    merged = JSON.parse(fs.readFileSync(report))
      .filter((r) => !measured.has(r.device + ':' + r.state))
      .concat(results);
  }
  fs.writeFileSync(report, JSON.stringify(merged, null, 2));
  const failures = [];
  for (const r of results) {
    if (r.state !== 'deck-free' || r.error || r.device === 'iphone-se') continue;
    if (
      r.viewport.width >= 1200 &&
      r.freeColumns.some((col) => col.right > r.areas['.groups-area'].right + 1)
    )
      failures.push(r.device + ': a default free-arrange column is cut off');
    const left = r.areas['.cgf-left'],
      right = r.areas['.cgf-right'];
    if (left?.width > 0 && right?.width > 0 && Math.abs(left.bottom - right.bottom) > 1)
      failures.push(r.device + ': canvas toolbar controls are misaligned');
  }
  for (const r of results) {
    const label = r.device + ' ' + r.state;
    if (r.error) {
      failures.push(label + ': ' + r.error.split('\n')[0]);
      continue;
    }
    if (r.overflow > 1) failures.push(label + ': horizontal page overflow');
    const panel = r.areas['app-card-search-panel.is-open'];
    const results = r.areas['.results-list'];
    if (r.state.endsWith('-build') && (!results || results.height < 60))
      failures.push(label + ': search results are squeezed out');
    if (
      r.state.endsWith('-build') &&
      (!panel || panel.height < 150 || panel.bottom > r.viewport.height + 1)
    )
      failures.push(label + ': search has insufficient visible room');
    if (
      r.state.endsWith('-add') &&
      (!panel || panel.y < 51 || panel.bottom > r.viewport.height + 1)
    )
      failures.push(label + ': search drawer exceeds viewport');
    const menu = r.areas['.cgf-clusters.is-open'];
    if (
      r.state.endsWith('-controls') &&
      menu &&
      (menu.y < 51 || menu.bottom > r.viewport.height + 1)
    )
      failures.push(label + ': controls extend beyond viewport');
  }
  await api('account', 'DELETE', { password: session.password });
  session = null;
  console.log(results.length + ' responsive states checked. Disposable account removed.');
  if (failures.length) throw Error(failures.join('\n'));
})().catch(async (e) => {
  console.error(e);
  if (session?.token)
    await api('account', 'DELETE', { password: session.password }).catch(() => {});
  process.exitCode = 1;
});
