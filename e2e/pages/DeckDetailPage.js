const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class DeckDetailPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.backBtn        = By.css('.back-btn');
    this.filterInput    = By.css('.filter-input');
    this.sortSelect     = By.css('.sort-select');
    this.addCardsBtn    = By.css('.add-btn');
    this.statsBtn       = By.css('.stats-btn');
    this.manaBtn        = By.css('.mana-btn');
    this.manaPanelHeader = By.css('.mana-header');
    this.sidePanel      = By.css('.side-panel');
    this.cardRows       = By.css('.card-row');
    this.headerCount    = By.css('.header-count');
    this.cpSearchBtn    = By.css('.cp-search-btn');
    this.searchInput    = By.css('.search-input');
    this.resultRow      = By.css('.result-row');
    this.addResultBtn   = By.css('.add-result-btn');
    this.validationBar  = By.css('.validation-bar');
    this.cpCheck        = By.css('.cp-check');
    this.qtyDec         = By.css('.qty-btn.qty-dec');
    this.qtyInc         = By.css('.qty-btn.qty-inc');
    this.listViewBtn    = By.css('.sort-btn[title="List view"]');
    this.visualViewBtn  = By.css('.sort-btn[title="Visual view"]');
    this.freeViewBtn    = By.css('.sort-btn[title="Free arrange"]');
    this.visualCards    = By.css('.visual-card');
    this.freeCols       = By.css('.free-col');
    this.freeCards      = By.css('.free-card');
    this.freeSaveBtn    = By.css('.free-save-btn');
    this.freeResetBtn   = By.css('.free-reset-btn');
    this.addColBtn      = By.css('.add-col-btn');
    this.textDensityBtn = By.css('.density-btn[title="Text list"]');
    this.filterBar      = By.css('.filter-bar');
    this.cpGameChanger  = By.css('.cp-check.info-gc');
    this.cpBracket      = By.css('.cp-bracket');
    this.ctrlDec        = By.css('.ctrl-btn.ctrl-dec');
    this.ctrlInc        = By.css('.ctrl-btn.ctrl-inc');
    this.listTextRows   = By.css('.card-row.list-row');
  }

  async clickBack() {
    await this.click(this.backBtn);
  }

  async filterCards(query) {
    await this.type(this.filterInput, query);
  }

  async getFilterValue() {
    const el = await this.driver.findElement(this.filterInput);
    return el.getAttribute('value');
  }

  async toggleStats() {
    await this.click(this.statsBtn);
  }

  async openManaSuggestPanel() {
    await this.closeManaSuggestPanel(); // ensure closed before opening fresh
    const el = await this.driver.findElement(this.manaBtn);
    await this.driver.executeScript('arguments[0].click()', el);
    await this.waitForVisible(this.manaPanelHeader, 3000);
    // Wait one extra tick for the async pipe to bind deck data to the component
    await this.driver.sleep(300);
  }

  async closeManaSuggestPanel() {
    const open = await this.isPresent(this.manaPanelHeader, 800);
    if (!open) return;
    const closeBtn = await this.driver.findElement(By.css('.mana-close'));
    await this.driver.executeScript('arguments[0].click()', closeBtn);
    await this.driver.wait(async () => {
      return !(await this.isPresent(this.manaPanelHeader, 300));
    }, 3000, 'Mana panel did not close');
  }

  async getManaSuggestAnalysis() {
    return this.driver.executeScript(`
      try {
        const el = document.querySelector('app-mana-suggest-panel');
        if (!el) return null;
        const comp = ng.getComponent(el);
        if (!comp) return null;
        return JSON.parse(JSON.stringify(comp.analysis));
      } catch(e) { return 'error:' + e.message; }
    `);
  }

  async getDetailPanelState() {
    return this.driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        if (!el) return null;
        const comp = ng.getComponent(el);
        if (!comp) return null;
        return {
          showManaSuggestPanel: comp.showManaSuggestPanel,
          showSearchPanel:      comp.showSearchPanel,
          showSuggestionsPanel: comp.showSuggestionsPanel,
        };
      } catch(e) { return null; }
    `);
  }

  async isSidePanelOpen() {
    return this.isPresent(By.css('.side-panel.is-open'), 1000);
  }

  async getCardRows() {
    return this.driver.findElements(this.cardRows);
  }

  async openCommanderSearch() {
    await this.click(this.statsBtn);
    await this.waitForVisible(By.css('.side-panel.is-open'));
    // When no commander is set, click the portrait placeholder; otherwise use the Change button
    const hasChangeBtn = await this.isPresent(this.cpSearchBtn, 1000);
    if (hasChangeBtn) {
      await this.driver.executeScript('arguments[0].click()', await this.driver.findElement(this.cpSearchBtn));
    } else {
      await this.driver.executeScript('arguments[0].click()', await this.driver.findElement(By.css('.cp-portrait.no-art')));
    }
    await this.waitForVisible(this.searchInput, 5000);
  }

  async searchCard(query, timeoutMs = 15000) {
    await this.type(this.searchInput, query);
    await this.driver.wait(async () => {
      const rows = await this.driver.findElements(this.resultRow);
      return rows.length > 0;
    }, timeoutMs, `No search results for "${query}"`);
  }

  /** Dismisses the "Unsaved Layout" modal (appears when leaving free mode with dirty layout). */
  async _dismissUnsavedLayoutModal() {
    try {
      await this.driver.wait(async () => {
        const modals = await this.driver.findElements(By.css('.unsaved-modal'));
        return modals.length > 0;
      }, 800);
      const discardBtn = await this.driver.findElement(By.css('.unsaved-btn.is-discard'));
      await discardBtn.click();
      await this.driver.sleep(300);
    } catch {} // No modal — that's fine
  }

  async switchToListView() {
    const el = await this.driver.findElement(this.listViewBtn);
    const cls = await el.getAttribute('class');
    if (cls.includes('is-active')) return;
    await this.driver.executeScript('arguments[0].click()', el);
    await this._dismissUnsavedLayoutModal();
    await this.driver.wait(async () => {
      const btn = await this.driver.findElement(this.listViewBtn);
      const c = await btn.getAttribute('class');
      return c.includes('is-active');
    }, 3000, 'List view did not activate');
  }

  async openAddCardsPanel() {
    const el = await this.driver.findElement(this.addCardsBtn);
    const cls = await el.getAttribute('class');
    if (!cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', el);
    }
    await this.driver.wait(async () => {
      const btn = await this.driver.findElement(this.addCardsBtn);
      const c = await btn.getAttribute('class');
      return c.includes('is-active');
    }, 3000, 'Add cards panel did not open');
  }

  async addFirstResult() {
    const firstRow = await this.driver.findElement(By.css('.result-row'));

    // For multi-print cards a set must be selected before Add works
    const initialSelects = await firstRow.findElements(By.css('.result-set-select'));
    if (initialSelects.length > 0) {
      // Focus triggers onSelectFocus → begins printings API load
      await this.driver.executeScript('arguments[0].focus()', initialSelects[0]);

      // Wait for printings to settle: either a single-print span appears
      // or the multi-print select contains real (non-disabled) options.
      // Angular replaces the loading <select> with a new DOM element once data
      // arrives, so we always re-query inside the loop rather than holding the
      // stale initialSelects[0] reference.
      await this.driver.wait(async () => {
        try {
          const singles = await firstRow.findElements(By.css('.result-set-single'));
          if (singles.length > 0) return true;
          const sels = await firstRow.findElements(By.css('.result-set-select'));
          if (sels.length === 0) return false;
          const opts = await sels[0].findElements(By.css('option:not([disabled])'));
          return opts.length > 0;
        } catch (e) { return false; }
      }, 10000, 'Print options did not load for first result');

      // Use Angular's debug API to call onSetChange directly — more reliable than
      // simulating a DOM change event whose zone interaction can be unpredictable.
      const selected = await this.driver.executeScript(`
        try {
          if (typeof ng === 'undefined') return 'ng-undefined';
          const panelEl = document.querySelector('app-card-search-panel');
          if (!panelEl) return 'no-panel-el';
          const comp = ng.getComponent(panelEl);
          if (!comp) return 'no-comp';
          const card = comp.results && comp.results[0];
          if (!card) return 'no-card:len=' + (comp.results ? comp.results.length : 'undefined');
          const prints = comp.printingsCache.get(card.oracleId);
          if (!prints || prints.length === 0) return 'no-prints:oracle=' + card.oracleId;
          comp.onSetChange(card.oracleId, prints[0].scryfallId);
          ng.applyChanges(panelEl);
          return 'ok:' + prints[0].scryfallId;
        } catch(e) { return 'error:' + e.message; }
      `);
      if (typeof selected !== 'string' || !selected.startsWith('ok:')) {
        throw new Error('addFirstResult select-print failed: ' + selected);
      }
      await this.driver.sleep(150);
    }

    const addBtns = await this.driver.findElements(this.addResultBtn);
    if (addBtns.length === 0) throw new Error('No add-result-btn found');
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', addBtns[0]);
    await this.driver.executeScript('arguments[0].click()', addBtns[0]);
  }

  async waitForDeckQtyBadge(timeoutMs = 8000) {
    await this.waitForVisible(By.css('.deck-qty-badge'), timeoutMs);
  }

  async closeSearchPanel() {
    const el = await this.driver.findElement(this.addCardsBtn);
    const cls = await el.getAttribute('class');
    if (cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', el);
    }
  }

  async waitForCheckAtIndex(index, cssClass, timeoutMs = 8000) {
    await this.driver.wait(async () => {
      const checks = await this.driver.findElements(this.cpCheck);
      if (checks.length <= index) return false;
      const classes = await checks[index].getAttribute('class');
      return classes.includes(cssClass);
    }, timeoutMs, `cp-check[${index}] never got class "${cssClass}"`);
  }

  async getCheckClasses() {
    const checks = await this.driver.findElements(this.cpCheck);
    return Promise.all(checks.map(c => c.getAttribute('class')));
  }

  // ── View mode switching ──────────────────────────────────────────────────

  async switchToVisualView() {
    const el = await this.driver.findElement(this.visualViewBtn);
    const cls = await el.getAttribute('class');
    if (cls.includes('is-active')) return;
    await this.driver.executeScript('arguments[0].click()', el);
    await this._dismissUnsavedLayoutModal();
    await this.driver.wait(async () => {
      const btn = await this.driver.findElement(this.visualViewBtn);
      const c = await btn.getAttribute('class');
      return c.includes('is-active');
    }, 3000, 'Visual view did not activate');
  }

  async switchToFreeView() {
    const el = await this.driver.findElement(this.freeViewBtn);
    const cls = await el.getAttribute('class');
    if (cls.includes('is-active')) return;
    await this.driver.executeScript('arguments[0].click()', el);
    await this._dismissUnsavedLayoutModal();
    await this.driver.wait(async () => {
      const btn = await this.driver.findElement(this.freeViewBtn);
      const c = await btn.getAttribute('class');
      return c.includes('is-active');
    }, 3000, 'Free view did not activate');
    await this.waitForElement(By.css('.free-toolbar'), 3000);
  }

  // ── Header count ─────────────────────────────────────────────────────────

  async getDeckHeaderCount() {
    const text = await this.getText(this.headerCount);
    const match = text.match(/(\d+)\s*\//);
    return match ? parseInt(match[1], 10) : -1;
  }

  // ── Element collections ───────────────────────────────────────────────────

  async getVisualCards() {
    return this.driver.findElements(this.visualCards);
  }

  async getFreeCols() {
    return this.driver.findElements(this.freeCols);
  }

  async getFreeCards() {
    return this.driver.findElements(this.freeCards);
  }

  // ── Text density toggle ────────────────────────────────────────────────────

  async enableTextStyle() {
    const btns = await this.driver.findElements(this.textDensityBtn);
    if (btns.length === 0) throw new Error('Text density button not found');
    const cls = await btns[0].getAttribute('class');
    if (!cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', btns[0]);
      await this.driver.sleep(300);
    }
  }

  async disableTextStyle() {
    const btns = await this.driver.findElements(By.css('.density-btn[title="Thumbnail"]'));
    if (btns.length === 0) return;
    const cls = await btns[0].getAttribute('class');
    if (!cls.includes('is-active')) {
      await this.driver.executeScript('arguments[0].click()', btns[0]);
      await this.driver.sleep(300);
    }
  }

  // ── Free-mode column management ────────────────────────────────────────────

  async addFreeColumn() {
    const btn = await this.waitForVisible(this.addColBtn);
    await btn.click();
    await this.driver.sleep(300);
  }

  /** Returns [{id, label, count}] for each free column via ng.getComponent. */
  async getFreeColumnInfo() {
    return this.driver.executeScript(`
      try {
        const el = document.querySelector('app-deck-detail');
        if (!el) return null;
        const comp = ng.getComponent(el);
        if (!comp) return null;
        return comp.freeColumns.map(c => ({ id: c.id, label: c.label, count: c.cardIds.length }));
      } catch(e) { return 'error:' + e.message; }
    `);
  }

  // ── Free-mode drag helpers (via ng.getComponent) ───────────────────────────

  /**
   * Moves one card from fromCol[fromCardIdx] to toCol.
   * dropAtEnd=true appends to target; false prepends.
   */
  async dragFreeCardByNg(fromColIdx, fromCardIdx, toColIdx, dropAtEnd = true) {
    const result = await this.driver.executeScript(`
      try {
        const fromColIdx   = arguments[0];
        const fromCardIdx  = arguments[1];
        const toColIdx     = arguments[2];
        const dropAtEnd    = arguments[3];

        const el = document.querySelector('app-deck-detail');
        if (!el) return 'no-el';
        const comp = ng.getComponent(el);
        if (!comp) return 'no-comp';

        const cols = comp.freeColumns;
        if (!cols || !cols.length) return 'no-cols';
        if (fromColIdx >= cols.length) return 'invalid-from:' + fromColIdx + '/' + cols.length;
        if (toColIdx   >= cols.length) return 'invalid-to:'   + toColIdx   + '/' + cols.length;

        const fromCol = cols[fromColIdx];
        const toCol   = cols[toColIdx];
        if (!fromCol.cardIds || fromCardIdx >= fromCol.cardIds.length)
          return 'no-card:idx=' + fromCardIdx + ',len=' + (fromCol.cardIds ? fromCol.cardIds.length : 0);

        const cardId = fromCol.cardIds[fromCardIdx];

        comp.dragSourceColId     = fromCol.id;
        comp.dragSrcRenderedIdx  = fromCardIdx;
        comp.dragCardId          = cardId;
        comp.isDraggingMultiCards = false;
        comp.multiDragCards      = [];
        comp.dragOverColId       = toCol.id;
        comp.dragOverIndex       = dropAtEnd ? toCol.cardIds.length : 0;

        const mockEvent = { preventDefault() {}, stopPropagation() {} };
        comp.onColDrop(toCol.id, mockEvent);
        ng.applyChanges(el);
        return 'ok';
      } catch(e) { return 'error:' + e.message; }
    `, fromColIdx, fromCardIdx, toColIdx, dropAtEnd);

    if (typeof result !== 'string' || !result.startsWith('ok'))
      throw new Error('dragFreeCardByNg failed: ' + result);
  }

  /**
   * Simulates rubber-band multi-select: picks fromCardIndices from fromCol
   * and drops them all onto toCol.
   */
  async multiDragFreeCardsByNg(fromColIdx, fromCardIndices, toColIdx) {
    const result = await this.driver.executeScript(`
      try {
        const fromColIdx      = arguments[0];
        const fromCardIndices = arguments[1];
        const toColIdx        = arguments[2];

        const el = document.querySelector('app-deck-detail');
        if (!el) return 'no-el';
        const comp = ng.getComponent(el);
        if (!comp) return 'no-comp';

        const cols = comp.freeColumns;
        if (!cols || !cols.length) return 'no-cols';

        const fromCol = cols[fromColIdx];
        const toCol   = cols[toColIdx];

        const multiDragCards = [];
        comp.selectedCardSlots = new Map();
        for (const idx of fromCardIndices) {
          if (idx < fromCol.cardIds.length) {
            const cardId = fromCol.cardIds[idx];
            comp.selectedCardSlots.set(fromCol.id + '/' + idx, cardId);
            multiDragCards.push({ colId: fromCol.id, cardId, renderedIdx: idx });
          }
        }
        if (multiDragCards.length === 0) return 'no-valid-cards';

        comp.isDraggingMultiCards = true;
        comp.multiDragCards       = multiDragCards;
        comp.dragCardId           = multiDragCards[0].cardId;
        comp.dragSourceColId      = fromCol.id;
        comp.dragSrcRenderedIdx   = multiDragCards[0].renderedIdx;
        comp.dragOverColId        = toCol.id;
        comp.dragOverIndex        = toCol.cardIds.length;

        const mockEvent = { preventDefault() {}, stopPropagation() {} };
        comp.onColDrop(toCol.id, mockEvent);
        ng.applyChanges(el);
        return 'ok';
      } catch(e) { return 'error:' + e.message; }
    `, fromColIdx, fromCardIndices, toColIdx);

    if (typeof result !== 'string' || !result.startsWith('ok'))
      throw new Error('multiDragFreeCardsByNg failed: ' + result);
  }

  /** Increment a card's qty in free mode (first .ctrl-inc button). */
  async freeModeIncrement() {
    const btns = await this.driver.findElements(this.ctrlInc);
    if (btns.length === 0) throw new Error('No ctrl-inc button found');
    await this.driver.executeScript('arguments[0].click()', btns[0]);
  }

  /** Decrement a card's qty in free mode (first .ctrl-dec button). */
  async freeModeDecrement() {
    const btns = await this.driver.findElements(this.ctrlDec);
    if (btns.length === 0) throw new Error('No ctrl-dec button found');
    await this.driver.executeScript('arguments[0].click()', btns[0]);
  }
}

module.exports = DeckDetailPage;
