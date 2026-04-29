const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class LoginPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.usernameInput = By.id('username');
    this.passwordInput = By.id('password');
    this.submitBtn = By.css('.submit-btn');
    this.errorMsg = By.css('.auth-error');
  }

  async navigate() {
    await super.navigate('/login');
  }

  async login(username, password) {
    await this.type(this.usernameInput, username);
    await this.type(this.passwordInput, password);
    await this.click(this.submitBtn);
  }

  async getError() {
    return this.getText(this.errorMsg);
  }

  async isErrorVisible() {
    return this.isPresent(this.errorMsg, 3000);
  }
}

module.exports = LoginPage;
