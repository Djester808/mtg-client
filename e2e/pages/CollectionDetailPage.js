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
    this.setSelect     = By.css('.set-select');
    this.qtyBadge      = By.css('.qty-badge');
    this.searchInput   = By.css('.search-input');
    this.resultRow     = By.css('.result-row');
    this.addResultBtn  = By.css('.add-result-btn');
    this.legend        = By.css('.legend');
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

    // Handle multi-print set selection if needed
    const firstRow = await this.driver.findElement(By.css('.result-row'));
    const selects = await firstRow.findElements(By.css('.result-set-select'));
    if (selects.length > 0) {
      await this.driver.executeScript('arguments[0].focus()', selects[0]);
      await this.driver.wait(async () => {
        try {
          const singles = await firstRow.findElements(By.css('.result-set-single'));
          if (singles.length > 0) return true;
          const sels = await firstRow.findElements(By.css('.result-set-select'));
          if (!sels.length) return false;
          const opts = await sels[0].findElements(By.css('option:not([disabled])'));
          return opts.length > 0;
        } catch { return false; }
      }, 10000, 'Print options did not load');

      await this.driver.executeScript(`
        try {
          const panelEl = document.querySelector('app-card-search-panel');
          const comp = ng.getComponent(panelEl);
          const card = comp.results[0];
          const prints = comp.printingsCache.get(card.oracleId);
          if (prints && prints.length) {
            comp.onSetChange(card.oracleId, prints[0].scryfallId);
            ng.applyChanges(panelEl);
          }
        } catch(e) {}
      `);
      await this.driver.sleep(150);
    }

    const addBtns = await this.driver.findElements(this.addResultBtn);
    if (addBtns.length === 0) throw new Error('No add-result-btn');
    await this.driver.executeScript('arguments[0].click()', addBtns[0]);
    await this.waitForElement(this.qtyBadge, 8000);
    await this.closeAddPanel();
  }

  async openCardModal(index = 0) {
    const arts = await this.driver.findElements(By.css('.card-art'));
    if (arts.length <= index) throw new Error(`No card art at index ${index}`);
    await arts[index].click();
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

module.exports = CollectionDetailPage;
