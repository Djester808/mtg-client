const { By } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');
const { buildDriver } = require('../helpers/driver');
const BasePage = require('../pages/BasePage');
jest.setTimeout(30000);
describe('Knowledge base live reference', () => {
  let driver, page;
  const visibleText = async (selector) => driver.findElement(By.css(selector)).getText();
  beforeAll(async () => {
    driver = await buildDriver();
    page = new BasePage(driver);
    await page.navigate('/kb');
    await page.waitForVisible(By.css('.kb-tabs'));
  });
  afterAll(async () => {
    await driver?.quit();
  });
  test('starts with the rules index and an explicit empty selection', async () => {
    expect((await driver.findElements(By.css('.sidebar-item'))).length).toBeGreaterThan(0);
    expect(await visibleText('.detail-empty')).toContain('Choose an entry');
  });
  test('selecting a rule group renders its actual rules', async () => {
    await driver.findElement(By.css('.sidebar-item')).click();
    await page.waitForVisible(By.css('.detail-card app-rule-block'));
    expect((await visibleText('.detail-title')).length).toBeGreaterThan(3);
    expect((await visibleText('.detail-card app-rule-block')).length).toBeGreaterThan(20);
  });
  test('server search returns deathtouch and clearing restores the index', async () => {
    const initial = (await driver.findElements(By.css('.sidebar-item'))).length;
    await page.type(By.css('.si-input'), 'deathtouch');
    await driver.wait(
      async () => (await driver.findElements(By.css('.sidebar-item.hit'))).length > 0,
      10000,
    );
    expect((await visibleText('.kb-sidebar')).toLowerCase()).toContain('deathtouch');
    await driver.findElement(By.css('.si-clear')).click();
    await driver.wait(
      async () => (await driver.findElements(By.css('.sidebar-item'))).length === initial,
      10000,
    );
  });
  test('a search with no matches shows its actual empty result', async () => {
    await page.type(By.css('.si-input'), 'zzz_no_match_xyz');
    await driver.wait(async () => (await visibleText('.kb-sidebar')).includes('No matches'), 10000);
    expect((await driver.findElements(By.css('.sidebar-item.hit'))).length).toBe(0);
    await driver.findElement(By.css('.si-clear')).click();
    await page.waitForVisible(By.css('.kb-tabs'));
  });
  test('glossary Load more appends a distinct page', async () => {
    await driver.findElement(By.xpath('//button[normalize-space()="Glossary"]')).click();
    await page.waitForVisible(By.css('.kb-more'));
    const before = (await driver.findElements(By.css('.sidebar-item'))).length;
    await driver.findElement(By.css('.kb-more')).click();
    await driver.wait(
      async () => (await driver.findElements(By.css('.sidebar-item'))).length > before,
      10000,
    );
    const names = await Promise.all(
      (await driver.findElements(By.css('.sidebar-item'))).map((e) => e.getText()),
    );
    expect(new Set(names).size).toBe(names.length);
  });
  test('same-route keyword navigation replaces the selected entry', async () => {
    await page.navigate('/kb?kw=Flying');
    await driver.wait(async () => (await visibleText('.detail-title')).includes('Flying'), 10000);
    await driver.executeScript(
      "history.pushState({}, '', '/kb?kw=Trample'); window.dispatchEvent(new PopStateEvent('popstate'));",
    );
    await driver.wait(async () => (await visibleText('.detail-title')).includes('Trample'), 10000);
  });
  test('selected rules are usable on desktop and mobile', async () => {
    const output = path.join(__dirname, '../screenshots/client-audit-kb');
    fs.mkdirSync(output, { recursive: true });
    for (const [width, height, name] of [
      [1440, 900, 'desktop'],
      [375, 667, 'mobile'],
    ]) {
      await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 900,
      });
      await driver.sleep(300);
      expect(
        await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth'),
      ).toBe(true);
      expect(await visibleText('.detail-title')).toContain('Trample');
      fs.writeFileSync(path.join(output, name + '.png'), await driver.takeScreenshot(), 'base64');
    }
  });
});
