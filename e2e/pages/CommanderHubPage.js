const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class CommanderHubPage extends BasePage {
  constructor(driver) {
    super(driver);

    // Header
    this.pageTitle    = By.css('.cl-title');
    this.pageSubtitle = By.css('.cl-subtitle');

    // Filter bar
    this.filterBar      = By.css('.cl-filters');
    this.searchInput    = By.css('.clf-search');
    this.colorButtons   = By.css('.clf-color-btn');
    this.dateGroup      = By.css('.clf-date-group');
    this.dateBtns       = By.css('.clf-date-btn');
    this.clearBtn       = By.css('.clf-clear');
    this.resultCount    = By.css('.clf-result-count');

    // Grid
    this.commanderGrid  = By.css('.commander-grid');
    this.commanderCards = By.css('.commander-card');
    this.commanderNames = By.css('.commander-name');
    this.commanderRanks = By.css('.commander-rank');

    // States
    this.loadingEl  = By.css('.cl-loading');
    this.emptyEl    = By.css('.cl-empty');
  }

  async navigate() {
    await super.navigate('/community/commanders');
  }

  async waitForLoad(timeout = 12000) {
    // Wait for loading to disappear
    await this.driver.wait(async () => {
      const loading = await this.driver.findElements(this.loadingEl);
      return loading.length === 0;
    }, timeout, 'Commander hub did not finish loading');
  }

  async getCommanderCount() {
    const cards = await this.driver.findElements(this.commanderCards);
    return cards.length;
  }

  async getCommanderNames() {
    const els = await this.driver.findElements(this.commanderNames);
    return Promise.all(els.map(e => e.getText()));
  }

  async getResultCountText() {
    return this.getText(this.resultCount, 3000);
  }

  async search(query) {
    const input = await this.waitForVisible(this.searchInput, 5000);
    await this.driver.executeScript(`
      const el = arguments[0]; el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, input);
    await this.driver.sleep(200);
    await input.sendKeys(query);
    // Trigger ngModel change
    await this.driver.executeScript(`
      arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
    `, input);
    await this.driver.sleep(300);
  }

  async clearSearch() {
    const input = await this.waitForVisible(this.searchInput, 5000);
    await this.driver.executeScript(`
      const el = arguments[0]; el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, input);
    await this.driver.sleep(300);
  }

  /** Click the color button for the given letter (W, U, B, R, G, C). */
  async toggleColor(letter) {
    const btns = await this.driver.findElements(this.colorButtons);
    for (const btn of btns) {
      const title = await btn.getAttribute('title');
      if (title && title.toUpperCase().includes(letter.toUpperCase())) {
        await this.driver.executeScript('arguments[0].click()', btn);
        await this.driver.sleep(300);
        return;
      }
    }
    throw new Error(`Color button for "${letter}" not found`);
  }

  /** Click the date preset button with the given label (All, 3M, 6M, 1Y, 2Y).
   *  Comparison is case-insensitive to handle CSS text-transform: uppercase. */
  async setDatePreset(label) {
    const btns = await this.driver.findElements(this.dateBtns);
    for (const btn of btns) {
      const text = await btn.getText();
      if (text.trim().toUpperCase() === label.toUpperCase()) {
        await this.driver.executeScript('arguments[0].click()', btn);
        await this.waitForLoad(10000);
        return;
      }
    }
    throw new Error(`Date preset button "${label}" not found`);
  }

  /** Returns the label of the active date preset, normalised to upper-case. */
  async getActiveDatePreset() {
    const btns = await this.driver.findElements(this.dateBtns);
    for (const btn of btns) {
      const cls = await btn.getAttribute('class');
      if (cls && cls.includes('is-active')) {
        const text = await btn.getText();
        return text.trim().toUpperCase();
      }
    }
    return null;
  }

  async clearFilters() {
    const hasClear = await this.isPresent(this.clearBtn, 2000);
    if (hasClear) {
      await this.click(this.clearBtn);
      await this.waitForLoad(10000);
    }
  }

  async clickFirstCommander() {
    const cards = await this.driver.findElements(this.commanderCards);
    if (cards.length === 0) throw new Error('No commander cards to click');
    await this.driver.executeScript('arguments[0].click()', cards[0]);
  }

  async isColorActive(letter) {
    const btns = await this.driver.findElements(this.colorButtons);
    for (const btn of btns) {
      const title = await btn.getAttribute('title');
      if (title && title.toUpperCase().includes(letter.toUpperCase())) {
        const cls = await btn.getAttribute('class');
        return cls && cls.includes('is-active');
      }
    }
    return false;
  }
}

module.exports = CommanderHubPage;
