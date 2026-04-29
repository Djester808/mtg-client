const { By, until } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class DeckListPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.listContent = By.css('.list-content');
    this.deckGrid = By.css('.deck-grid');
    this.emptyState = By.css('.empty-state');
    this.deckCards = By.css('.deck-card');
    this.createBtn = By.css('.create-btn');
    this.backBtn = By.css('.back-btn');
    this.modal = By.css('.modal-overlay');
    this.cancelBtn = By.css('.cancel-btn');
  }

  async navigate() {
    await super.navigate('/deck');
  }

  async getDeckCards() {
    return this.driver.findElements(this.deckCards);
  }

  async openCreateModal() {
    await this.click(this.createBtn);
    await this.waitForVisible(this.modal);
  }

  async closeModal() {
    await this.click(this.cancelBtn);
    await this.waitForUrlNotToContain('/deck/new', 1000).catch(() => {});
  }

  async clickFirstDeck() {
    const cards = await this.getDeckCards();
    if (cards.length === 0) throw new Error('No decks on the deck list page');
    await cards[0].click();
  }

  async createCommanderDeck(name) {
    await this.openCreateModal();
    // Wait for form content to be fully rendered before interacting
    const formatPicker = await this.waitForVisible(By.css('.format-picker'), 5000);
    await this.type(By.css('.modal .form-input'), name);
    // Commander is the last format-opt in the picker — click it via JS to bypass any overlay
    const commanderBtn = await this.driver.findElement(By.css('.format-picker .format-opt:last-child'));
    await this.driver.executeScript('arguments[0].click()', commanderBtn);
    // Wait for Angular to apply is-active
    await this.driver.wait(async () => {
      const cls = await commanderBtn.getAttribute('class');
      return cls.includes('is-active');
    }, 3000, 'Commander format button did not activate');
    await this.click(By.css('.modal .submit-btn'));

    // Modal closes immediately; wait for the new deck card to appear then click it
    await this.driver.wait(until.elementLocated(By.css('.deck-card')), 8000, 'Deck card did not appear after creation');
    const cards = await this.driver.findElements(By.css('.deck-card'));
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.deck-name'));
      if (nameEls.length === 0) continue;
      const text = await nameEls[0].getText();
      if (text.trim() === name) {
        await card.click();
        await this.waitForUrlToContain('/deck/', 5000);
        return;
      }
    }
    throw new Error(`Could not find deck "${name}" in list after creation`);
  }

  async deleteDeckByName(name) {
    await this.navigate();
    await this.waitForVisible(this.listContent);
    const cards = await this.driver.findElements(this.deckCards);
    for (const card of cards) {
      const nameEls = await card.findElements(By.css('.deck-name'));
      if (nameEls.length === 0) continue;
      const text = await nameEls[0].getText();
      if (text.trim() === name) {
        const menuBtn = await card.findElement(By.css('.menu-btn'));
        await menuBtn.click();
        await this.driver.wait(until.elementLocated(By.css('.menu-item-danger')), 3000);
        await this.click(By.css('.menu-item-danger'));
        return true;
      }
    }
    return false;
  }
}

module.exports = DeckListPage;
