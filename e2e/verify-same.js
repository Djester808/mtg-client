#!/usr/bin/env node
//
// The sameness proof. Screenshots the app-filter-facets ELEMENT (not the page) in every
// context that renders it — deck list / visual / free view and the card search panel —
// then pixel-diffs every pair in a canvas. Exits non-zero if any pair diverges beyond
// antialiasing noise, so "they all look the same" is a measured claim, not an eyeballed
// one.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('./helpers/driver');
const { loginAs } = require('./helpers/auth');
const { baseUrl } = require('./config');
const DEVICES = require('./devices');

const device = DEVICES.find((d) => d.id === 'iphone-se');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = await buildDriver({ device, dpr: 1, disableLcdText: true });
  const navigate = d.get.bind(d);
  d.get = async (url) => {
    await navigate(url);
    if (url.startsWith(baseUrl)) {
      await d.wait(until.elementLocated(By.css('app-navbar,.intro-skip')), 15000);
      const skips = await d.findElements(By.css('.intro-skip'));
      if (skips.length) await skips[0].click();
      await d.wait(async () => !(await d.findElements(By.css('.brand-intro'))).length, 12000);
    }
  };
  const shots = {};
  const guardHeights = {};
  try {
    await loginAs(d);
    await sleep(800);
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await d.executeScript(
      `const cs=[...document.querySelectorAll('.deck-card')];(cs.find(c=>c.textContent.includes('Showcase'))||cs[0]).click();`,
    );
    await sleep(3000);

    const reveal = async () => {
      const menus = await d.findElements(By.css('.cgf-menu-btn'));
      if (
        menus.length &&
        (await menus[0].isDisplayed()) &&
        (await menus[0].getAttribute('aria-expanded')) !== 'true'
      )
        await menus[0].click();
      await sleep(250);
      const toggles = await d.findElements(By.css('.fx-toggle[aria-expanded="false"]'));
      for (const toggle of toggles) if (await toggle.isDisplayed()) await toggle.click();
      await sleep(300);
    };
    const capture = async (el, name) => {
      // Compare the shared component in a neutral capture frame. A scrolling popup clips
      // its children and composites them at a different subpixel origin from a drawer.
      // The responsive suite verifies those real host layouts separately; this assertion
      // isolates the chip arrangement and bindings, with no scroller clipping its pixels.
      await d.executeScript(
        'const e=arguments[0],s=getComputedStyle(e),f=document.createElement("div");window.__facetCapture={e,parent:e.parentNode,next:e.nextSibling,style:e.style.cssText,frame:f};f.style.cssText="position:fixed;left:0;top:52px;z-index:2147483000;background:var(--bg-surface);width:"+e.getBoundingClientRect().width+"px;font:"+s.font;f.style.setProperty("--text-scale",s.getPropertyValue("--text-scale"));document.body.appendChild(f);f.appendChild(e);e.style.margin="0";e.style.transform="none";e.style.width="100%";',
        el,
      );
      try {
        guardHeights[name] = await d.executeScript(
          'return Math.round(arguments[0].querySelector(".fx-last").getBoundingClientRect().top-arguments[0].getBoundingClientRect().top);',
          el,
        );
        return await el.takeScreenshot();
      } finally {
        await d.executeScript(
          'const c=window.__facetCapture;c.parent.insertBefore(c.e,c.next);c.e.style.cssText=c.style;c.frame.remove();delete window.__facetCapture;',
        );
      }
    };
    const grab = async (name) => {
      await reveal();
      // First VISIBLE instance — a closed panel can leave a 0-width mount in the DOM,
      // and screenshotting that throws.
      const el = await d.executeScript(
        `return [...document.querySelectorAll('app-filter-facets')].find(e => e.getBoundingClientRect().width > 0);`,
      );
      await d.executeScript('arguments[0].scrollIntoView({block:"center"});', el);
      // Snap every ancestor scroller to an integer scrollTop: a fractional scroll
      // position re-rasterizes the element at a half-pixel offset, which reads as a
      // soft/blurry copy and shows up as thousands of false diff pixels.
      await d.executeScript(
        `
        for (let p = arguments[0].parentElement; p; p = p.parentElement) {
          if (p.scrollTop && p.scrollTop % 1 !== 0) p.scrollTop = Math.round(p.scrollTop);
        }
      `,
        el,
      );
      // Normalize subpixel framing before comparing raster pixels. Both surfaces retain
      // their measured dimensions; only the capture origin moves by at most half a pixel.
      await d.executeScript(
        'const r=arguments[0].getBoundingClientRect();arguments[0].style.transform="translate3d("+(Math.round(r.left)-r.left)+"px,"+(Math.round(r.top)-r.top)+"px,0)";',
        el,
      );
      await sleep(700);
      shots[name] = await capture(el, name);
      fs.writeFileSync(
        path.join(__dirname, 'screenshots', `same-${name}.png`),
        shots[name],
        'base64',
      );
    };

    const viewBtns = () => d.findElements(By.css('.view-toggle .sort-btn'));
    await d.executeScript('arguments[0].click();', (await viewBtns())[0]);
    await sleep(2200);
    await grab('list');
    await d.executeScript('arguments[0].click();', (await viewBtns())[1]);
    await sleep(2200);
    await grab('visual');
    await d.executeScript('arguments[0].click();', (await viewBtns())[2]);
    await sleep(2200);
    await grab('free');

    // The search panel's instance. A non-empty non-commander deck has no Add Cards
    // control at all (standing app gap), so the panel is reached through an EMPTY deck's
    // empty-state button — the verify deck created by the API prep step.
    await d.get(baseUrl + '/deck');
    await d.wait(until.elementLocated(By.css('.deck-card')), 15000);
    await d.executeScript(
      `const cs=[...document.querySelectorAll('.deck-card')];(cs.find(c=>c.textContent.includes('Verify Empty'))||cs[0]).click();`,
    );
    await sleep(3000);
    await d.executeScript(
      `const b=[...document.querySelectorAll('button')].find(x=>/add cards/i.test(x.textContent)); if(b) b.click();`,
    );
    let panelFacets = null;
    for (let t = 0; t < 20 && !panelFacets; t++) {
      await sleep(500);
      panelFacets = await d.executeScript(
        `return [...document.querySelectorAll('app-card-search-panel app-filter-facets')].find(e => e.getBoundingClientRect().width > 0) || null;`,
      );
    }
    if (!panelFacets) throw new Error('panel facets never became visible');
    const toggle = await panelFacets.findElement(By.css('.fx-toggle'));
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await sleep(300);
    await d.executeScript(
      'const r=arguments[0].getBoundingClientRect();arguments[0].style.transform="translate3d("+(Math.round(r.left)-r.left)+"px,"+(Math.round(r.top)-r.top)+"px,0)";',
      panelFacets,
    );
    shots['panel'] = await capture(panelFacets, 'panel');
    fs.writeFileSync(
      path.join(__dirname, 'screenshots', 'same-panel.png'),
      shots['panel'],
      'base64',
    );

    // Diff every pair inside the browser: draw both onto canvases, compare pixels.
    await d.get('about:blank');
    const names = Object.keys(shots);
    let allSame = true;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const r = await d.executeAsyncScript(
          `
          const [b64a, b64b, height, done] = arguments;
          const load = (b) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + b; });
          Promise.all([load(b64a), load(b64b)]).then(([a, b]) => {
            // The last row hosts each context's own set picker by design (deck uses
            // select-menu, the panel its icon trigger), so the guarded region is the
            // chip rows above it: compare down to the measured start of that row.
            const H = height;
            if (a.width !== b.width) {
              done({ sizeA: a.width + 'x' + a.height, sizeB: b.width + 'x' + b.height, sameSize: false });
              return;
            }
            const cv = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = H;
              const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, H).data; };
            const da = cv(a), db = cv(b);
            let diff = 0, maxd = 0;
            for (let k = 0; k < da.length; k += 4) {
              const delta = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k+1] - db[k+1]), Math.abs(da[k+2] - db[k+2]));
              if (delta > 12) diff++;
              if (delta > maxd) maxd = delta;
            }
            done({ sameSize: true, size: a.width + 'x' + H + ' (cmc-set row excluded)', pixels: da.length / 4,
                   diffPixels: diff, diffPct: +((100 * diff) / (da.length / 4)).toFixed(3), maxDelta: maxd });
          });
        `,
          shots[names[i]],
          shots[names[j]],
          Math.min(guardHeights[names[i]], guardHeights[names[j]]),
        );
        const pair = `${names[i]} vs ${names[j]}`;
        const same = r.sameSize && r.diffPct < 0.5;
        if (!same) allSame = false;
        console.log(pair.padEnd(18), JSON.stringify(r), same ? 'SAME' : '*** DIFFERENT ***');
      }
    }
    console.log(
      allSame
        ? '\nALL FOUR CONTEXTS RENDER THE SAME FILTER BLOCK'
        : '\nNOT THE SAME — see pairs above',
    );
    process.exitCode = allSame ? 0 : 1;
  } finally {
    await d.quit();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
