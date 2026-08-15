/* Does the filter row move when a filter is applied? Measures its left edge before and
   after, plus the scroll container's inner width — a vanishing scrollbar is the usual
   cause of a whole centred layout sliding sideways. */
const fs = require('fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const SP =
  'C:/Users/John/AppData/Local/Temp/claude/c--Users-John-Documents-Projects-MtgEngine/095bc0e9-833f-481d-af17-e47b81af0cb2/scratchpad';
const col = fs.readFileSync(`${SP}/col.txt`, 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = `
  const ga = document.querySelector('.grid-area');
  const row = document.querySelector('.gf-row--search');
  return {
    rowLeft: Math.round(row.getBoundingClientRect().left),
    innerW: ga.clientWidth,
    scrolls: ga.scrollHeight > ga.clientHeight + 2,
  };`;

(async () => {
  const o = new chrome.Options();
  o.addArguments(
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1400,1000',
    '--ignore-certificate-errors',
  );
  const d = await new Builder().forBrowser('chrome').setChromeOptions(o).build();
  try {
    await d.get('http://localhost:4200/login');
    await sleep(2500);
    await d.executeScript(`
      const ins=[...document.querySelectorAll('input')];
      const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
      set(ins.find(i=>i.type!=='password'),'claudelook1'); set(ins.find(i=>i.type==='password'),'Passw0rd!23');
      [...document.querySelectorAll('button')].find(b=>/sign in/i.test(b.innerText)).click();`);
    await sleep(4000);
    await d.get(`http://localhost:4200/collection/${col}`);
    await sleep(6000);

    const before = await d.executeScript(probe);
    await d.executeScript(
      `[...document.querySelectorAll('.text-chip')].find(b=>/planeswalker/i.test(b.innerText)).click();`,
    );
    await sleep(900);
    const after = await d.executeScript(probe);
    fs.writeFileSync(`${SP}/shift.png`, await d.takeScreenshot(), 'base64');

    console.log('BEFORE:', JSON.stringify(before));
    console.log('AFTER :', JSON.stringify(after));
    console.log('DELTA :', after.rowLeft - before.rowLeft, 'px');
  } catch (e) {
    console.log('ERR', e.message);
  } finally {
    await d.quit();
  }
})();
