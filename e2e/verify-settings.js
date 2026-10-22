const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {By,until}=require('selenium-webdriver');
const {buildDriver}=require('./helpers/driver'),devices=require('./devices'),{baseUrl}=require('./config');
async function open(d,url){await d.get(baseUrl+url);await d.wait(until.elementLocated(By.css('.intro-skip')),15000);await d.findElement(By.css('.intro-skip')).click();await d.wait(async()=>!(await d.findElements(By.css('.brand-intro'))).length,5000);}
(async()=>{const out=path.join(__dirname,'screenshots/settings');fs.mkdirSync(out,{recursive:true});
for(const device of devices.filter(d=>['iphone-se','desktop'].includes(d.id))){const d=await buildDriver({device,dpr:1});try{
  await open(d,'/settings');await d.wait(until.elementLocated(By.id('settings-search')),10000);
  await d.findElement(By.id('settings-search')).sendKeys('Text size');await d.wait(until.elementLocated(By.id('text-size')),5000);
  const before=await d.executeScript('return parseFloat(getComputedStyle(document.querySelector(".setting-preview")).fontSize)');
  await d.executeScript('const slider=document.querySelector("#text-size");slider.value=160;slider.dispatchEvent(new Event("input",{bubbles:true}));');
  await d.wait(async()=>d.executeScript('return document.documentElement.style.getPropertyValue("--text-scale")==="1.6"'),5000);
  const after=await d.executeScript('return parseFloat(getComputedStyle(document.querySelector(".setting-preview")).fontSize)');assert(Math.abs(after/before-1.6)<0.03);
  assert.equal(await d.executeScript('return document.documentElement.scrollWidth-innerWidth'),0);
  fs.writeFileSync(path.join(out,device.id+'-text160.png'),await d.takeScreenshot(),'base64');
  const search=await d.findElement(By.id('settings-search'));await search.clear();await search.sendKeys('High contrast');
  await d.findElement(By.css('.setting-toggle input')).click();assert(await d.executeScript('return document.documentElement.classList.contains("high-contrast")'));
  await search.clear();await search.sendKeys('Reduce motion');await d.findElement(By.css('.setting-toggle input')).click();assert(await d.executeScript('return document.documentElement.classList.contains("reduce-motion")'));
  await search.clear();await search.sendKeys('Reset accessibility');await d.findElement(By.css('.setting-actions button')).click();
  assert.equal(await d.executeScript('return document.documentElement.style.getPropertyValue("--text-scale")'),'1');
  await d.findElement(By.xpath('//button[contains(text(),"Undo reset")]')).click();assert.equal(await d.executeScript('return document.documentElement.style.getPropertyValue("--text-scale")'),'1.6');
  // Persisted preferences survive a fresh boot, including the intro's still image.
  await open(d,'/settings');assert.equal(await d.executeScript('return document.documentElement.style.getPropertyValue("--text-scale")'),'1.6');
  await d.executeScript('localStorage.setItem("compleat.ui.preferences",JSON.stringify({textSize:100,highContrast:false,reduceMotion:false,startup:"/tools",navigation:"expanded"}))');
  await open(d,'/');await d.wait(until.urlContains('/tools'),10000);
  if(device.id==='desktop'){assert.equal((await d.findElements(By.css('.desktop-rail.is-expanded'))).length,1);assert.equal(await d.executeScript('return document.documentElement.scrollWidth-innerWidth'),0);}
  console.log(device.id+': settings search, 160% text, contrast, reduced motion, reset/undo, persistence and startup passed');
}finally{await d.quit();}}})().catch(e=>{console.error(e);process.exitCode=1;});
