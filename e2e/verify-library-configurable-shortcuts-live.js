const assert = require('assert/strict');
const { By, Key } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
(async () => {
  const t = new LibraryTable('Library mulligan shortcuts', '60 Plains', 'library-configurable-shortcuts');
  try {
    await t.start(undefined, false);
    let p=t.views[0].pending;
    assert.equal(p.kind,'mulligan');
    const i=t.seat(p.player.value), d=t.drivers[i];
    await d.wait(async()=> (await d.findElements(By.css('app-choice-controls [aria-keyshortcuts="3"]'))).length>0,15000);
    const gameUrl=await d.getCurrentUrl();
    await d.get('http://localhost:4200/settings'); await t.dismiss(d);
    await d.findElement(By.id('settings-search')).sendKeys('shortcuts');
    const capture=async(id,key)=>{await d.findElement(By.id('shortcut-'+id)).click();await d.actions().keyDown(Key.SHIFT).sendKeys(key).keyUp(Key.SHIFT).perform();};
    await capture('mulligan','m'); await capture('keep','m');
    assert((await d.findElement(By.css('[role="alert"]')).getText()).includes('already assigned'));
    assert.equal(await d.findElement(By.id('shortcut-keep')).getAttribute('value'),'4');
    await d.findElement(By.xpath('//button[contains(.,"Unbind Keep")]')).click();
    assert.equal(await d.findElement(By.id('shortcut-keep')).getAttribute('value'),'Unassigned');
    await d.findElement(By.xpath('//button[contains(.,"Reset opening-hand shortcuts")]')).click();
    assert.equal(await d.findElement(By.id('shortcut-mulligan')).getAttribute('value'),'3');
    await capture('mulligan','m'); await capture('keep','k');
    await d.navigate().refresh(); await t.dismiss(d);
    await d.findElement(By.id('settings-search')).sendKeys('shortcuts');
    assert.equal(await d.findElement(By.id('shortcut-mulligan')).getAttribute('value'),'Shift+m');
    assert.equal(await d.findElement(By.id('shortcut-keep')).getAttribute('value'),'Shift+k');
    assert(await d.executeScript("return document.querySelector('.settings-results').getBoundingClientRect().width > 500"),'Desktop search results should use the available width');
    await t.shot(i,'settings-desktop');
    await d.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:true});
    assert(await d.executeScript('return document.documentElement.scrollWidth <= innerWidth'));
    await d.findElement(By.id('shortcut-mulligan')).click();
    await t.shot(i,'settings-phone');
    const reset=await d.findElement(By.xpath('//button[contains(.,"Reset opening-hand shortcuts")]'));
    await d.executeScript('arguments[0].scrollIntoView({block:"center"})',reset);
    assert(await d.executeScript('return arguments[0].getBoundingClientRect().height >= 44',reset));
    await t.shot(i,'settings-phone-bottom');
    await d.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
    await d.get(gameUrl);await t.dismiss(d);
    await d.wait(async()=> (await d.findElements(By.css('app-choice-controls [aria-keyshortcuts="Shift+m"]'))).length>0,15000);
    const before=t.revisions[i];
    await d.actions().sendKeys('3').perform();
    await d.sleep(300); assert.equal(t.revisions[i],before,'Previous binding must not act');
    await d.executeScript('document.body.focus();document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
    await d.executeAsyncScript('const done=arguments[arguments.length-1];setTimeout(done,300);');
    assert.equal(t.revisions[i],before,'Enter must not decide the opening hand');
    await t.shot(i,'before');
    await d.actions().keyDown(Key.SHIFT).sendKeys('m').keyUp(Key.SHIFT).perform();
    await t.wait(()=>t.views[0].pending?.id.value!==p.id.value);
    let usedKeep=false, bottomed=false;
    for(let n=0;n<12 && t.views[0].pending;n++) {
      p=t.views[0].pending;const seat=t.seat(p.player.value), own=t.views[seat].pending;
      if(p.kind==='mulligan') {
        await t.drivers[seat].wait(async()=> (await t.drivers[seat].findElements(By.css('app-choice-controls [aria-keyshortcuts="'+(seat===i?'Shift+k':'4')+'"]'))).length>0,15000);
        if(seat===i)await t.drivers[seat].actions().keyDown(Key.SHIFT).sendKeys('k').keyUp(Key.SHIFT).perform();else await t.drivers[seat].actions().sendKeys('4').perform();usedKeep=true;
        const id=p.id.value;await t.wait(()=>t.views[0].pending?.id.value!==id);
      } else if(p.kind==='mulligan-bottom') {
        assert.equal(own.min,1);bottomed=true;
        await t.command(seat,{kind:'answer',choice:p.id.value,answer:own.options.slice(0,own.min).map(o=>o.id)});
      } else throw Error('Unexpected opening prompt '+p.kind);
    }
    assert(usedKeep && bottomed);assert.equal(t.views[0].pending,null);
    assert.equal(t.views[i].hand.length,6);assert.equal(t.views[1-i].hand.length,7);
    assert.equal(t.refused.length,0);t.assertChoicePrivacy();
    await t.shot(i,'kept');
    console.log('PASS: UI remapping, collision, unbind, reset, reload, old-key suppression and modified keys complete two-player opening hands');
  } catch(e) {for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}
  finally {await t.close();}
})().catch(e=>{console.error(e);process.exit(1);});
