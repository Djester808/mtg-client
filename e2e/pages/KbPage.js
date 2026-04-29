const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class KbPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.backBtn       = By.css('.back-btn');
    this.searchInput   = By.css('.search-input');
    this.searchClear   = By.css('.search-clear');
    this.sidebarItems  = By.css('.sidebar-item');
    this.itemBadge     = By.css('.item-badge');
    this.kbDetail      = By.css('.kb-detail');
    this.detailCard    = By.css('.detail-card');
    this.detailTitle   = By.css('.detail-title');
    this.detailDesc    = By.css('.detail-desc');
    this.stepRows      = By.css('.step-row');
    this.detailEmpty   = By.css('.detail-empty');
    this.noResults     = By.css('.no-results');
    this.groupLabels   = By.css('.group-label');
  }

  // Override to use JS click — the decorative bg-grid overlay intercepts
  // ChromeDriver's synthetic click even with pointer-events:none on the grid.
  async click(locator) {
    const el = await this.waitForVisible(locator);
    await this.driver.executeScript('arguments[0].click()', el);
  }

  async navigate() {
    await super.navigate('/kb');
  }

  async waitForContent() {
    await this.waitForVisible(this.kbDetail, 8000);
    await this.waitForElement(this.sidebarItems, 8000);
  }

  async clickFirstItem() {
    const items = await this.driver.findElements(this.sidebarItems);
    if (items.length === 0) throw new Error('No sidebar items');
    await this.driver.executeScript('arguments[0].click()', items[0]);
    await this.driver.sleep(300);
  }

  async getSidebarItems() {
    return this.driver.findElements(this.sidebarItems);
  }

  async searchFor(query) {
    const el = await this.waitForVisible(this.searchInput);
    await el.clear();
    await el.sendKeys(query);
    await this.driver.sleep(300);
  }

  async clearSearch() {
    const el = await this.waitForVisible(this.searchClear);
    await this.driver.executeScript('arguments[0].click()', el);
    await this.driver.sleep(200);
  }
}

module.exports = KbPage;
