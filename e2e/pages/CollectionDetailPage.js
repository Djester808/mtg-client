const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class CollectionDetailPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.backBtn       = By.css('.back-btn');
    this.headerName    = By.css('.header-name');
    this.headerCount   = By.css('.header-count');
    this.addBtn        = By.css('.add-btn');
    this.filterInput   = By.css('.filter-input');
    this.zoomIn        = By.css('.zoom-btn[title="Zoom in"]');
    this.zoomOut       = By.css('.zoom-btn[title="Zoom out"]');
    this.zoomLabel     = By.css('.zoom-label');
    this.cardTiles     = By.css('.card-tile');
    this.cardWraps     = By.css('.card-wrap');
    this.ctrlInc       = By.css('.ctrl-btn.ctrl-inc');
    this.ctrlDec       = By.css('.ctrl-btn.ctrl-dec');
    this.setSelect     = By.css('.set-select-menu .asm-btn, .set-single-label');
    this.qtyBadge      = By.css('.qty-pill');
    this.searchInput   = By.css('.search-input');
    this.resultRow     = By.css('.result-row');
    this.addResultBtn  = By.css('.add-result-btn');

    this.emptyState    = By.css('.empty-state');
    this.cardModal     = By.css('.card-modal');
    this.modalCloseBtn = By.css('.modal-close-btn');
    this.deckQtyBadge  = By.css('.deck-qty-badge');
  }

  async waitForCards(timeoutMs = 8000) {
    await this.waitForElement(this.cardTiles, timeoutMs);
  }

  async getCardCount() {
    const tiles = await this.driver.findElements(this.cardTiles);
    return tiles.length;
  }

  async openAddPanel() {
    const btn = await this.driver.findElement(this.addBtn);
    const cls = await btn.getAttribute('class');
    if (!cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', btn);
    }
    await this.waitForElement(this.searchInput, 3000);
  }

  async closeAddPanel() {
    const btn = await this.driver.findElement(this.addBtn);
    const cls = await btn.getAttribute('class');
    if (cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', btn);
    }
  }

  async searchAndAddCard(query) {
    await this.openAddPanel();
    await this.type(this.searchInput, query);
    await this.driver.wait(async () => {
      const rows = await this.driver.findElements(this.resultRow);
      return rows.length > 0;
    }, 15000, `No results for "${query}"`);

    // Add an unpinned card; the collection supports choosing a printing later.
    const row = await this.driver.wait(async () => {
      for (const candidate of await this.driver.findElements(this.resultRow)) {
        if ((await candidate.findElement(By.css('.result-name')).getText()).trim() === query) return candidate;
      }
      return false;
    }, 15000, `No exact result for "${query}"`);
    const addBtns = await row.findElements(this.addResultBtn);
    if (addBtns.length === 0) throw new Error('No add-result-btn');
    await this.driver.executeScript('arguments[0].click()', addBtns[0]);
    await this.waitForElement(this.qtyBadge, 8000);
    await this.closeAddPanel();
  }

  async openCardModal(index = 0) {
    const arts = await this.driver.findElements(By.css('.ct-art'));
    if (arts.length <= index) throw new Error(`No card art at index ${index}`);
    await this.driver.actions({ async: true }).doubleClick(arts[index]).perform();
    await this.waitForElement(this.cardModal, 5000);
  }

  async showGridControls() {
    const label = await this.driver.findElement(this.zoomLabel);
    if (!(await label.isDisplayed())) {
      await this.driver.findElement(By.css('.grid-filters .cgf-menu-btn')).click();
      await this.waitForVisible(this.zoomLabel);
    }
  }

  async hideGridControls() {
    const toggle = await this.driver.findElement(By.css('.grid-filters .cgf-menu-btn'));
    if (await toggle.isDisplayed() && await toggle.getAttribute('aria-expanded') === 'true')
      await toggle.click();
  }

  async ownedDetails() {
    const tab = await this.driver.findElement(By.xpath('//button[contains(@class,"modal-info-tab") and normalize-space()="Owned details"]'));
    await tab.click();
    return this.waitForVisible(By.css('.modal-notes-input'));
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

module.exports = CollectionDetailPage;
