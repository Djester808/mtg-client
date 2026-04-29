const { By, until } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class HomePage extends BasePage {
  constructor(driver) {
    super(driver);
    this.searchInput     = By.css('.search-input');
    this.colorPips       = By.css('.color-pip');
    this.filterPills     = By.css('.filter-pill');
    this.rarityBadges    = By.css('.rarity-badge');
    this.cmcBtns         = By.css('.cmc-btn');
    this.sortBtns        = By.css('.sort-btn');
    this.sortDirBtn      = By.css('.sort-dir-btn');
    this.setTrigger      = By.css('.set-trigger');
    this.setSearchInput  = By.css('.set-search-input');
    this.setOptions      = By.css('.set-option');
    this.clearBtn        = By.css('.clear-btn');
    this.cardTiles       = By.css('.card-tile');
    this.loadMoreBtn     = By.css('.load-more-btn');
    this.searchClear     = By.css('.search-clear');
    this.flagMatchCase   = By.css('.search-flag-btn[title="Match case"]');
    this.flagMatchWord   = By.css('.search-flag-btn[title="Match whole word"]');
    this.flagRegex       = By.css('.search-flag-btn[title="Use regular expression"]');
    this.cardFlipBtn     = By.css('.card-flip-btn');
    this.idleState       = By.css('.search-idle');
    this.resultsCount    = By.css('.results-count');
    this.cardModal       = By.css('.card-modal');
    this.modalCloseBtn   = By.css('.modal-close-btn');
  }

  async navigate() {
    await super.navigate('/');
  }

  async search(query) {
    await this.type(this.searchInput, query);
    await this.driver.wait(async () => {
      const tiles = await this.driver.findElements(this.cardTiles);
      return tiles.length > 0;
    }, 15000, `No results for "${query}"`);
  }

  async getCardTiles() {
    return this.driver.findElements(this.cardTiles);
  }

  async openFirstCard() {
    const tiles = await this.driver.findElements(this.cardTiles);
    if (tiles.length === 0) throw new Error('No card tiles visible');
    await tiles[0].click();
    await this.waitForElement(this.cardModal, 5000);
  }

  async closeModal() {
    const btn = await this.driver.findElement(this.modalCloseBtn);
    await btn.click();
    await this.driver.wait(async () => {
      const modals = await this.driver.findElements(this.cardModal);
      return modals.length === 0;
    }, 3000);
  }
}

module.exports = HomePage;
