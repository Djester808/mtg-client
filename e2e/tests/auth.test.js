const { buildDriver } = require('../helpers/driver');
const LoginPage = require('../pages/LoginPage');
const { username, password } = require('../config');

describe('Auth', () => {
  let driver;
  let loginPage;

  beforeAll(async () => {
    driver = await buildDriver();
    loginPage = new LoginPage(driver);
  });

  afterAll(async () => {
    await driver.quit();
  });

  test('login page renders', async () => {
    await loginPage.navigate();
    const url = await loginPage.getCurrentUrl();
    expect(url).toContain('/login');
    await loginPage.waitForVisible(loginPage.usernameInput);
    await loginPage.waitForVisible(loginPage.passwordInput);
    await loginPage.waitForVisible(loginPage.submitBtn);
  });

  test('shows error on bad credentials', async () => {
    await loginPage.navigate();
    await loginPage.login('notauser@bad.com', 'wrongpassword123');
    const hasError = await loginPage.isErrorVisible();
    expect(hasError).toBe(true);
  });

  test('redirects away from /login on valid credentials', async () => {
    await loginPage.navigate();
    await loginPage.login(username, password);
    await loginPage.waitForUrlNotToContain('/login', 8000);
    const url = await loginPage.getCurrentUrl();
    expect(url).not.toContain('/login');
  });

  test('unauthenticated user is redirected to login from protected route', async () => {
    // Clear session by navigating to login (Angular auth guard should kick in on a fresh nav)
    await driver.manage().deleteAllCookies();
    await loginPage.navigate('/lobby');
    await loginPage.waitForUrlToContain('/login', 5000);
    const url = await loginPage.getCurrentUrl();
    expect(url).toContain('/login');
  });
});
