const { until } = require('selenium-webdriver');
const { baseUrl } = require('../config');

class BasePage {
  constructor(driver) {
    this.driver = driver;
  }

  async navigate(path) {
    await this.driver.get(baseUrl + path);
  }

  async waitForElement(locator, timeout = 5000) {
    return this.driver.wait(until.elementLocated(locator), timeout);
  }

  async waitForVisible(locator, timeout = 5000) {
    const el = await this.waitForElement(locator, timeout);
    await this.driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }

  async click(locator) {
    const el = await this.waitForVisible(locator);
    await el.click();
  }

  async type(locator, text) {
    const el = await this.waitForVisible(locator);
    // Dispatch a real input event with empty value so Angular's reactive form
    // emits '' through valueChanges.  resetPanel() uses setValue('',{emitEvent:false})
    // which leaves the last query in distinctUntilChanged; without this reset the
    // debounced pipeline only sees the final "Sol Ring" value again and blocks it.
    // Sleep > debounce period (350ms) so the empty-string value clears through
    // distinctUntilChanged before the actual text is typed.
    await this.driver.executeScript(`
      const e = arguments[0]; e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    `, el);
    await this.driver.sleep(400);
    await el.sendKeys(text);
  }

  async getText(locator, timeout = 5000) {
    const el = await this.waitForVisible(locator, timeout);
    return el.getText();
  }

  async getCurrentUrl() {
    return this.driver.getCurrentUrl();
  }

  async isPresent(locator, timeout = 2000) {
    try {
      await this.driver.wait(until.elementLocated(locator), timeout);
      return true;
    } catch {
      return false;
    }
  }

  async waitForUrlToContain(substring, timeout = 5000) {
    await this.driver.wait(async () => {
      const url = await this.driver.getCurrentUrl();
      return url.includes(substring);
    }, timeout, `Timed out waiting for URL to contain "${substring}"`);
  }

  async waitForUrlNotToContain(substring, timeout = 5000) {
    await this.driver.wait(async () => {
      const url = await this.driver.getCurrentUrl();
      return !url.includes(substring);
    }, timeout, `Timed out waiting for URL to stop containing "${substring}"`);
  }
}

module.exports = BasePage;
