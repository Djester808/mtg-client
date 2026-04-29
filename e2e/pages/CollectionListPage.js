const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class CollectionListPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.listContent = By.css('.list-content');
    this.collectionGrid = By.css('.collection-grid');
    this.emptyState = By.css('.empty-state');
    this.collectionCards = By.css('.collection-card');
    this.createBtn = By.css('.create-btn');
    this.backBtn = By.css('.back-btn');
    this.modal = By.css('.modal');
    this.cancelBtn = By.css('.cancel-btn');
  }

  async navigate() {
    await super.navigate('/collection');
  }

  async getCollectionCards() {
    return this.driver.findElements(this.collectionCards);
  }

  async openCreateModal() {
    await this.click(this.createBtn);
    await this.waitForVisible(this.modal);
  }

  async closeModal() {
    await this.click(this.cancelBtn);
  }
}

module.exports = CollectionListPage;
