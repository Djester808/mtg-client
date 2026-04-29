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
    await items[0].click();
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
    await this.click(this.searchClear);
    await this.driver.sleep(200);
  }
}

module.exports = KbPage;
