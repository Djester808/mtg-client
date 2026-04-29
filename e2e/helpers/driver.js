const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { headless } = require('../config');

async function buildDriver() {
  const options = new chrome.Options();
  if (headless) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900');
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

module.exports = { buildDriver };
