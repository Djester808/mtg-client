const { By } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { loginAs } = require('../helpers/auth');
const BasePage = require('../pages/BasePage');

jest.setTimeout(60000);

describe('Navbar — Links, Auth State, Account Menu, Logout', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    await loginAs(driver);
    page = new BasePage(driver);
    await page.navigate('/');
  });

  afterAll(async () => {
    await driver.quit();
  });

  // ── Logo ───────────────────────────────────────────────────────────────────────

  test('logo is present', async () => {
    const logo = await page.isPresent(By.css('.nav-logo'), 2000);
    expect(logo).toBe(true);
  });

  test('logo links to /', async () => {
    const logo = await driver.findElement(By.css('.nav-logo'));
    const href = await logo.getAttribute('href');
    expect(href).toMatch(/\/$/);
  });

  // ── Nav links ──────────────────────────────────────────────────────────────────

  test('all five primary nav links are present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    expect(links.length).toBeGreaterThanOrEqual(5);
  });

  test('Home nav link is present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('home'))).toBe(true);
  });

  test('Rules KB nav link is present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('kb') || t.includes('rules'))).toBe(true);
  });

  test('Collection nav link is present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('collection'))).toBe(true);
  });

  test('Decks nav link is present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('deck'))).toBe(true);
  });

  test('Play nav link is present', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('play'))).toBe(true);
  });

  // ── Logged-in auth state ───────────────────────────────────────────────────────

  test('account button is visible when logged in', async () => {
    const btn = await page.isPresent(By.css('.account-btn'), 2000);
    expect(btn).toBe(true);
  });

  test('account button displays the username', async () => {
    const name = await driver.findElement(By.css('.account-name'));
    const text = await name.getText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('"Sign In" link is not present when logged in', async () => {
    // "Sign In" only appears in .account-menu when logged out
    const allLinks = await driver.findElements(By.css('.account-menu .nav-link'));
    const texts = await Promise.all(allLinks.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t === 'sign in')).toBe(false);
  });

  // ── Account dropdown ───────────────────────────────────────────────────────────

  test('clicking account button opens the dropdown', async () => {
    const btn = await driver.findElement(By.css('.account-btn'));
    await btn.click();
    await driver.sleep(200);
    const open = await page.isPresent(By.css('.account-dropdown'), 2000);
    expect(open).toBe(true);
  });

  test('dropdown contains a Sign Out button', async () => {
    const items = await driver.findElements(By.css('.account-dropdown .dropdown-item'));
    const texts = await Promise.all(items.map(i => i.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('sign out') || t.includes('logout'))).toBe(true);
  });

  // ── Active link ────────────────────────────────────────────────────────────────

  test('Home link has the active class when on /', async () => {
    // Close dropdown by navigating fresh
    await page.navigate('/');
    await driver.sleep(200);
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    let homeActive = false;
    for (const link of links) {
      const text = (await link.getText()).toLowerCase();
      if (text.includes('home')) {
        const cls = await link.getAttribute('class');
        homeActive = cls.includes('active');
        break;
      }
    }
    expect(homeActive).toBe(true);
  });

  test('clicking a nav link navigates to its route', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    let collLink = null;
    for (const link of links) {
      const text = (await link.getText()).toLowerCase();
      if (text.includes('collection')) { collLink = link; break; }
    }
    if (!collLink) return;
    await collLink.click();
    await page.waitForUrlToContain('/collection', 5000);
    const url = await page.getCurrentUrl();
    expect(url).toContain('/collection');
  });

  test('Collection link has active class when on /collection', async () => {
    const links = await driver.findElements(By.css('.nav-links .nav-link'));
    let collActive = false;
    for (const link of links) {
      const text = (await link.getText()).toLowerCase();
      if (text.includes('collection')) {
        const cls = await link.getAttribute('class');
        collActive = cls.includes('active');
        break;
      }
    }
    expect(collActive).toBe(true);
  });

  // ── Logout ─────────────────────────────────────────────────────────────────────

  test('clicking Sign Out redirects to /login', async () => {
    await page.navigate('/');
    await driver.sleep(200);
    const btn = await driver.findElement(By.css('.account-btn'));
    await btn.click();
    await driver.sleep(300);
    const signOut = await driver.findElement(By.css('.account-dropdown .dropdown-item.danger'));
    await driver.executeScript('arguments[0].click()', signOut);
    await page.waitForUrlToContain('/login', 8000);
    const url = await page.getCurrentUrl();
    expect(url).toContain('/login');
  });

  // ── Logged-out auth state (after logout) ───────────────────────────────────────

  test('"Sign In" link is visible after logout', async () => {
    const links = await driver.findElements(By.css('.account-menu .nav-link'));
    const texts = await Promise.all(links.map(l => l.getText()));
    expect(texts.map(t => t.toLowerCase()).some(t => t.includes('sign in'))).toBe(true);
  });

  test('"Create Account" link is visible after logout', async () => {
    const btn = await page.isPresent(By.css('.nav-btn'), 2000);
    expect(btn).toBe(true);
  });

  test('account button is absent after logout', async () => {
    const present = await page.isPresent(By.css('.account-btn'), 1000);
    expect(present).toBe(false);
  });

  test('accessing a protected route after logout redirects to /login', async () => {
    await page.navigate('/deck');
    await page.waitForUrlToContain('/login', 5000);
    const url = await page.getCurrentUrl();
    expect(url).toContain('/login');
  });
});
