const { By } = require('selenium-webdriver');
const LoginPage = require('../pages/LoginPage');
const { username, password } = require('../config');

async function loginAs(driver, user = username, pass = password) {
  const loginPage = new LoginPage(driver);
  await loginPage.navigate();
  // The original Compleat intro deliberately makes the page inert until skipped.
  const skips=await driver.findElements(By.css('.intro-skip'));
  if(skips.length)await skips[0].click();
  await driver.wait(async()=>!(await driver.findElements(By.css('.brand-intro'))).length,12000);
  await loginPage.login(user, pass);
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return !url.includes('/login');
  }, 8000, 'Timed out waiting for redirect after login');
}

module.exports = { loginAs };
