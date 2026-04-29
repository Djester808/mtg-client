const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class LobbyPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.lobbyForm    = By.css('.lobby-form');
    this.player1Input = By.css('input[formControlName="player1Name"]');
    this.player2Input = By.css('input[formControlName="player2Name"]');
    this.deckOptions  = By.css('.deck-option');
    this.startBtn     = By.css('.start-btn');
    this.errorMsg     = By.css('.error-msg');
  }

  async navigate() {
    await super.navigate('/lobby');
  }

  async fillPlayerNames(player1, player2) {
    // Use type() which dispatches an input event after clearing so Angular's
    // reactive form validators pick up the empty/new value correctly.
    await this.type(this.player1Input, player1);
    await this.type(this.player2Input, player2);
  }

  async selectDeckPreset(index) {
    const opts = await this.driver.findElements(this.deckOptions);
    if (index >= opts.length) throw new Error(`No deck option at index ${index}`);
    await this.driver.executeScript('arguments[0].click()', opts[index]);
    await this.driver.sleep(200);
  }

  async clickStart() {
    await this.driver.executeScript(
      'arguments[0].click()',
      await this.driver.findElement(this.startBtn)
    );
  }

  async isStartEnabled() {
    const btn = await this.driver.findElement(this.startBtn);
    const disabled = await btn.getAttribute('disabled');
    return disabled === null;
  }
}

module.exports = LobbyPage;
