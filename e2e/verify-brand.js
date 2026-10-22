const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
const devices = require('./devices');

async function run() {
  const out = path.join(__dirname, 'screenshots/brand');
  fs.mkdirSync(out, { recursive: true });
  const report = [];
  for (const device of [devices.find(d => d.id === 'iphone-se'), devices.find(d => d.id === 'desktop')]) {
    assert(device, 'The capture device must exist');
    const driver = await buildDriver({ device, dpr: 1 });
    try {
      await driver.get(baseUrl + '/login');
      await driver.wait(until.elementLocated(By.css('.brand-intro')), 20000);
      await driver.wait(async () => driver.executeScript('return document.querySelector(".intro-video")?.readyState >= 2'), 10000);
      const intro = await driver.executeScript(`
        const video = document.querySelector('.intro-video');
        const button = document.querySelector('.intro-skip').getBoundingClientRect();
        return { title: document.title, videoPlaying: !video.paused, muted: video.muted,
          ready: video.readyState, time: video.currentTime,
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          skipHeight: button.height, inert: document.querySelector('.app-shell').inert };
      `);
      assert.equal(intro.title, 'Compleat');
      assert.equal(intro.muted, true);
      assert.equal(intro.inert, true);
      assert(intro.skipHeight >= 44);
      assert.equal(intro.width, intro.scrollWidth);
      fs.writeFileSync(path.join(out, `${device.id}-intro.png`), await driver.takeScreenshot(), 'base64');
      await driver.wait(async () => !(await driver.findElements(By.css('.brand-intro'))).length, 12000);
      for (const route of ['/login', '/register', '/', '/tools']) {
        if (route !== '/login') {
          await driver.executeScript(`const link = document.createElement('a'); link.href = arguments[0]; document.body.appendChild(link); link.click(); link.remove();`, baseUrl + route);
          await driver.wait(until.elementLocated(By.css('.intro-skip')), 10000);
          await driver.findElement(By.css('.intro-skip')).click();
          await driver.wait(async () => !(await driver.findElements(By.css('.brand-intro'))).length, 5000);
        }
        const metrics = await driver.executeScript(`
          const style = getComputedStyle(document.documentElement);
          const images = [...document.querySelectorAll('.compleat-brand img, .compleat-auth-logo')];
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            accent: style.getPropertyValue('--accent').trim(), background: style.getPropertyValue('--bg-void').trim(),
            imagesLoaded: images.length > 0 && images.every(i => i.complete && i.naturalWidth > 0),
            oldName: document.body.innerText.includes('MTG Engine'), inert: document.querySelector('.app-shell').inert };
        `);
        assert.equal(metrics.width, metrics.scrollWidth, route + ' overflows');
        assert.equal(metrics.accent, '#b800e0');
        assert.equal(metrics.background, '#0a0a0b');
        assert.equal(metrics.imagesLoaded, true);
        assert.equal(metrics.oldName, false);
        assert.equal(metrics.inert, false);
        fs.writeFileSync(path.join(out, `${device.id}-${route.replaceAll('/', '') || 'home'}.png`), await driver.takeScreenshot(), 'base64');
        report.push({device: device.id, route, ...metrics});
      }
      // Reduced motion must not start the video, and the original poster must remain.
      await driver.sendDevToolsCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await driver.get(baseUrl + '/login');
      await driver.wait(until.elementLocated(By.css('.brand-intro')), 15000);
      assert.equal((await driver.findElements(By.css('.intro-video'))).length, 0);
      assert.equal((await driver.findElements(By.css('.intro-poster'))).length, 1);
      report.push({device:device.id, intro, reducedMotion:true});
    } finally { await driver.quit(); }
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log('Compleat branding verified at phone and desktop sizes; captures in e2e/screenshots/brand.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
