const assert = require('assert/strict');
const { By } = require('selenium-webdriver');
const { LibraryTable } = require('./helpers/library-table');
(async () => {
  const t = new LibraryTable('Library mulligan shortcuts', '60 Plains', 'library-mulligan-shortcuts');
  try {
    await t.start(undefined, false);
    let p=t.views[0].pending;
    assert.equal(p.kind,'mulligan');
    const i=t.seat(p.player.value), d=t.drivers[i];
    await d.wait(async()=> (await d.findElements(By.css('app-choice-controls [aria-keyshortcuts="3"]'))).length>0,15000);
    const before=t.revisions[i];
    await d.executeScript('document.body.focus();document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
    await d.executeAsyncScript('const done=arguments[arguments.length-1];setTimeout(done,300);');
    assert.equal(t.revisions[i],before,'Enter must not decide the opening hand');
    await t.shot(i,'before');
    await d.actions().sendKeys('3').perform();
    await t.wait(()=>t.views[0].pending?.id.value!==p.id.value);
    let usedKeep=false, bottomed=false;
    for(let n=0;n<12 && t.views[0].pending;n++) {
      p=t.views[0].pending;const seat=t.seat(p.player.value), own=t.views[seat].pending;
      if(p.kind==='mulligan') {
        await t.drivers[seat].wait(async()=> (await t.drivers[seat].findElements(By.css('app-choice-controls [aria-keyshortcuts="4"]'))).length>0,15000);
        await t.drivers[seat].actions().sendKeys('4').perform();usedKeep=true;
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
    console.log('PASS: Enter does not choose; 3 mulligans; 4 keeps; one bottomed card and both players complete opening hands');
  } catch(e) {for(let i=0;i<t.drivers.length;i++)await t.shot(i,'failure-'+i).catch(()=>{});throw e;}
  finally {await t.close();}
})().catch(e=>{console.error(e);process.exit(1);});
