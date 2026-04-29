const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class RegisterPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.usernameInput = By.css('#username');
    this.emailInput    = By.css('#email');
    this.passwordInput = By.css('#password');
    this.submitBtn     = By.css('.submit-btn');
    this.authError     = By.css('.auth-error');
    this.authLink      = By.css('.auth-link a');
    this.authForm      = By.css('.auth-form');
  }

  async navigate() {
    await super.navigate('/register');
  }

  async fillForm(username, email, password) {
    await this.type(this.usernameInput, username);
    await this.type(this.emailInput, email);
    await this.type(this.passwordInput, password);
  }

  async submit() {
    await this.click(this.submitBtn);
  }
}

module.exports = RegisterPage;
