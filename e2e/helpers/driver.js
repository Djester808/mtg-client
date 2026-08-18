const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { headless } = require('../config');

/**
 * Build a Chrome driver.
 *
 * @param {object} [opts]
 * @param {object} [opts.device] A profile from ../devices.js. Omit for the desktop
 *   window the existing suite has always used — the parameter is additive on purpose so
 *   every current test keeps its exact behaviour.
 * @param {number} [opts.dpr] Overrides the profile's device pixel ratio. Only affects
 *   screenshot resolution, never layout, so it is safe to drop to 1 for smaller files.
 */
async function buildDriver({ device, dpr } = {}) {
  const options = new chrome.Options();
  if (headless) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage');

  if (device && device.os !== 'desktop') {
    options.setMobileEmulation({
      deviceMetrics: {
        width: device.width,
        height: device.height,
        pixelRatio: dpr ?? device.dpr,
        // Without this the page gets a mouse pointer and `(hover: hover)` matches, which
        // would hide exactly the touch-target problems we are looking for.
        touch: true,
      },
      userAgent: device.ua,
    });
    // The window still has to be big enough to hold the emulated viewport, or Chrome
    // clips the screenshot to the window rather than to the device.
    options.addArguments(`--window-size=${device.width},${device.height + 120}`);
  } else {
    const w = device ? device.width : 1280;
    const h = device ? device.height : 900;
    options.addArguments(`--window-size=${w},${h}`);
  }

  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

module.exports = { buildDriver };
