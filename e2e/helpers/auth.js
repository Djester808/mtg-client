const LoginPage = require('../pages/LoginPage');
const { username, password } = require('../config');

async function loginAs(driver, user = username, pass = password) {
  const loginPage = new LoginPage(driver);
  await loginPage.navigate();
  await loginPage.login(user, pass);
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return !url.includes('/login');
  }, 8000, 'Timed out waiting for redirect after login');
}

module.exports = { loginAs };
