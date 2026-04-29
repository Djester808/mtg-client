require('dotenv').config();

module.exports = {
  baseUrl: process.env.BASE_URL || 'http://localhost:4200',
  username: process.env.E2E_USERNAME || '',
  password: process.env.E2E_PASSWORD || '',
  headless: process.env.HEADLESS !== 'false',
};
