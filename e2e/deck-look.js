const fs = require('fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const SP = 'C:/Users/John/AppData/Local/Temp/claude/c--Users-John-Documents-Projects-MtgEngine/095bc0e9-833f-481d-af17-e47b81af0cb2/scratchpad';
const deckId = JSON.parse(fs.readFileSync(`${SP}/imp-res.json`, 'utf8')).deck.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const o = new chrome.Options();
  o.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,900','--ignore-certificate-errors');
  const d = await new Builder().forBrowser('chrome').setChromeOptions(o).build();
  try {
    await d.get('http://localhost:4200/login'); await sleep(2500);
    await d.executeScript(`
      const ins=[...document.querySelectorAll('input')];
      const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
      set(ins.find(i=>i.type!=='password'),'claudelook1'); set(ins.find(i=>i.type==='password'),'Passw0rd!23');
      [...document.querySelectorAll('button')].find(b=>/sign in/i.test(b.innerText)).click();`);
    await sleep(4000);
    await d.get(`http://localhost:4200/deck/${deckId}`);
    await sleep(7000);
    fs.writeFileSync(`${SP}/deck-top.png`, await d.takeScreenshot(), 'base64');
    const ov = await d.executeScript(`const b=document.querySelector('.filter-bar');const z=document.querySelector('.filter-bar .zoom-group');const rb=b.getBoundingClientRect();const rz=z?z.getBoundingClientRect():null;return {barW:Math.round(rb.width), barScrollW:Math.round(b.scrollWidth), overflows:b.scrollWidth>b.clientWidth+1, zoomRight: rz?Math.round(rz.right):null, winW:innerWidth, wrap:getComputedStyle(b).flexWrap};`);
    console.log('OVERFLOW:', JSON.stringify(ov));
    const br = await d.executeScript(`const b=document.querySelector('.board-row');const r=b.getBoundingClientRect();return {h:Math.round(r.height), top:Math.round(r.top)};`);
    console.log('BOARDROW:', JSON.stringify(br));
    const tools = await d.executeScript(`const br=document.querySelector('.board-row');const t=document.querySelectorAll('.board-row .tool-btn, .board-row .add-btn');const adds=document.querySelectorAll('.add-btn, .fbar-add-btn');return {boardRow: !!br, toolsInRow: t.length, toolText:[...t].map(x=>x.innerText.trim()), addButtonsOnPage: adds.length};`);
    console.log('TOOLS:', JSON.stringify(tools));
    const r = await d.executeScript(`
      const bar=document.querySelector('.filter-bar');
      if(!bar) return {err:'no .filter-bar'};
      const chain=[];
      for(let el=bar.parentElement; el && el!==document.documentElement; el=el.parentElement){
        const s=getComputedStyle(el);
        chain.push({cls:(el.className||'').toString().slice(0,34),oy:s.overflowY,
          scrolls:el.scrollHeight>el.clientHeight+2,top:Math.round(el.getBoundingClientRect().top),
          padTop:s.paddingTop});
      }
      const before=Math.round(bar.getBoundingClientRect().top);
      let scrolled=null,sTop=null;
      for(let el=bar.parentElement; el; el=el.parentElement){
        const s=getComputedStyle(el);
        if(el.scrollHeight>el.clientHeight+2 && (s.overflowY==='auto'||s.overflowY==='scroll')){
          el.scrollTop=600; scrolled=(el.className||'').toString().slice(0,34); sTop=Math.round(el.getBoundingClientRect().top); break;}
      }
      return {parentOfBar:(bar.parentElement.className||'').toString().slice(0,34),barTopBefore:before,scrolledEl:scrolled,scrollerTop:sTop,chain:chain.slice(0,4)};`);
    await sleep(1200);
    const after = await d.executeScript(`const b=document.querySelector('.filter-bar');return {barTopAfter:Math.round(b.getBoundingClientRect().top)};`);
    fs.writeFileSync(`${SP}/deck-sticky.png`, await d.takeScreenshot(), 'base64');
    console.log('BEFORE:', JSON.stringify(r));
    console.log('AFTER :', JSON.stringify(after));
  } catch(e){ console.log('ERR', e.message); } finally { await d.quit(); }
})();
