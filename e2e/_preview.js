// Throwaway: renders the generated contact sheet and screenshots it, so the layout gets
// looked at rather than assumed. Safe to delete.
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

(async () => {
  const o = new chrome.Options();
  o.addArguments(
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,1500',
    '--allow-file-access-from-files',
  );
  const d = await new Builder().forBrowser('chrome').setChromeOptions(o).build();
  try {
    const file = path.join(__dirname, 'screenshots', 'mobile-audit.html');
    await d.get('file:///' + file.replace(/\\/g, '/'));
    await new Promise((r) => setTimeout(r, 2500));

    fs.writeFileSync('screenshots/_sheet-top.png', await d.takeScreenshot(), 'base64');

    await d.executeScript(`document.querySelectorAll('.route')[0].scrollIntoView();`);
    await new Promise((r) => setTimeout(r, 900));
    fs.writeFileSync('screenshots/_sheet-route.png', await d.takeScreenshot(), 'base64');

    const m = await d.executeScript(`return {
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      h: document.documentElement.scrollHeight,
      bg: getComputedStyle(document.body).backgroundColor,
      imgs: Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).length,
    };`);
    console.log('scrollWidth', m.sw, 'innerWidth', m.iw, '| sideways scroll:', m.sw > m.iw + 1);
    console.log('page height', m.h, '| body bg', m.bg, '| broken images', m.imgs);
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
