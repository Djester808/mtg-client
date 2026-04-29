const { buildDriver } = require('../helpers/driver');
const RegisterPage = require('../pages/RegisterPage');

jest.setTimeout(30000);

describe('Register Page', () => {
  let driver;
  let page;

  beforeAll(async () => {
    driver = await buildDriver();
    page = new RegisterPage(driver);
  });

  afterAll(async () => {
    await driver.quit();
  });

  beforeEach(async () => {
    await page.navigate();
    await page.waitForVisible(page.authForm);
  });

  test('page loads at /register', async () => {
    const url = await page.getCurrentUrl();
    expect(url).toContain('/register');
  });

  test('form contains username, email, and password fields', async () => {
    const hasUser = await page.isPresent(page.usernameInput, 2000);
    const hasEmail = await page.isPresent(page.emailInput, 2000);
    const hasPass = await page.isPresent(page.passwordInput, 2000);
    expect(hasUser).toBe(true);
    expect(hasEmail).toBe(true);
    expect(hasPass).toBe(true);
  });

  test('submit button is disabled when form is empty', async () => {
    const btn = await driver.findElement(page.submitBtn);
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).not.toBeNull();
  });

  test('submit button is disabled with invalid email', async () => {
    await page.fillForm('validuser', 'notanemail', 'password123');
    const btn = await driver.findElement(page.submitBtn);
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).not.toBeNull();
  });

  test('submit button is disabled with short username (< 3 chars)', async () => {
    await page.fillForm('ab', 'test@example.com', 'password123');
    const btn = await driver.findElement(page.submitBtn);
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).not.toBeNull();
  });

  test('submit button is disabled with short password (< 6 chars)', async () => {
    await page.fillForm('validuser', 'test@example.com', '12345');
    const btn = await driver.findElement(page.submitBtn);
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).not.toBeNull();
  });

  test('submit button becomes enabled with valid form data', async () => {
    await page.fillForm('validuser', 'test@example.com', 'password123');
    const btn = await driver.findElement(page.submitBtn);
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).toBeNull();
  });

  test('submitting valid form either creates account or shows an error', async () => {
    await page.fillForm('selenium_conflict_' + Date.now(), 'conflict@example.com', 'password123');
    await page.submit();
    // Wait up to 8s for either navigation away from /register or an error message
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      if (!url.includes('/register')) return true;
      const errors = await driver.findElements(page.authError);
      return errors.length > 0;
    }, 8000, 'Neither navigated nor error appeared after submit');

    const url = await driver.getCurrentUrl();
    if (url.includes('/register')) {
      // Stayed on page — must have shown an error
      const errorVisible = await page.isPresent(page.authError, 1000);
      expect(errorVisible).toBe(true);
    }
    // If navigated away, registration succeeded — that's also valid
  });

  test('"Sign in" link navigates to /login', async () => {
    await page.click(page.authLink);
    await page.waitForUrlToContain('/login', 5000);
    const url = await page.getCurrentUrl();
    expect(url).toContain('/login');
  });
});
