const { By, until, Key } = require('selenium-webdriver');
const { buildDriver } = require('../helpers/driver');
const { armGameReplay } = require('../helpers/game-replay');
const { roomyFixture } = require('../fixtures/ability-board');
const { baseUrl } = require('../config');
jest.setTimeout(60000);
describe('Roomy multiplayer board', () => {
  let driver;
  beforeAll(async () => {
    driver = await buildDriver();
    await driver.manage().window().setRect({width:1280,height:900});
    await armGameReplay(driver, roomyFixture(4));
    await driver.get(baseUrl + '/game/roomy-regression');
    await driver.wait(until.elementLocated(By.css('.self-table .zone-pile')), 20000);
    const skips = await driver.findElements(By.css('.intro-skip'));
    if (skips.length) await skips[0].click();
    await driver.wait(async () => !(await driver.findElements(By.css('.brand-intro'))).length, 12000);
  });
  afterAll(async () => { if (driver) await driver.quit(); });
  test('focus shows one opponent and the three-seat rail', async () => {
    expect((await driver.findElements(By.css('.opponent-plate'))).length).toBe(3);
    expect((await driver.findElements(By.css('.opponent-boards app-table-seat'))).length).toBe(1);
  });
  test('table mode shows every opponent without document overflow', async () => {
    await driver.findElement(By.xpath("//button[normalize-space()='Table']")).click();
    await driver.wait(async () => (await driver.findElements(By.css('.opponent-boards app-table-seat'))).length === 3, 5000);
    expect(await driver.executeScript('return document.documentElement.scrollWidth === innerWidth')).toBe(true);
  });
  test('library exposes its count without exposing hidden cards', async () => {
    await driver.findElement(By.css('.self-table [data-zone="library"]')).click();
    const dialog = await driver.wait(until.elementLocated(By.css('app-zone-viewer dialog[open]')), 5000);
    expect(await dialog.getText()).toMatch(/Library/i);
    expect((await dialog.findElements(By.css('.zone-card'))).length).toBe(0);
    await driver.actions().sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => (await driver.findElements(By.css('app-zone-viewer dialog[open]'))).length === 0, 5000);
    expect(await driver.executeScript('return document.activeElement?.dataset.zone')).toBe('library');
  });
  test('hand and phase track use the current controls', async () => {
    expect((await driver.findElements(By.css('app-hand .hand-card-wrapper'))).length).toBeGreaterThan(0);
    expect(await driver.findElement(By.css('.current-step')).getText()).not.toBe('');
  });
});
