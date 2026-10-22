const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {By,until}=require('selenium-webdriver');
const {buildDriver}=require('./helpers/driver');const devices=require('./devices');const {baseUrl}=require('./config');
const runtime='C:/Users/John/OneDrive/Documents/ChatGPT/Compleat/feature-port/runtime.log';
async function open(driver,url){await driver.get(baseUrl+url);await driver.wait(until.elementLocated(By.css('.intro-skip')),20000);await driver.findElement(By.css('.intro-skip')).click();await driver.wait(async()=>!(await driver.findElements(By.css('.brand-intro'))).length,5000);}
(async()=>{
  const out=path.join(__dirname,'screenshots/account');fs.mkdirSync(out,{recursive:true});
  for(const device of devices.filter(d=>['iphone-se','desktop'].includes(d.id) && (!process.env.PORT_DEVICE || d.id === process.env.PORT_DEVICE))){
    const driver=await buildDriver({device,dpr:1});const username='porttest_'+Date.now();const email=username+'@example.test';const password='PortTest!'+Date.now();
    try{
      await open(driver,'/register');
      for(const [name,value]of Object.entries({username,email,password}))await driver.findElement(By.css(`[formcontrolname="${name}"]`)).sendKeys(value);
      await driver.findElement(By.css('form button[type="submit"], form button')).click();
      await driver.wait(async()=>driver.executeScript('return !!localStorage.getItem("auth_token")'),15000);
      const refresh=await driver.executeAsyncScript(`const done=arguments[0]; fetch('/api/auth/refresh',{method:'POST',credentials:'include'}).then(async r=>{const b=await r.json();if(r.ok){localStorage.setItem('auth_token',b.token);localStorage.setItem('auth_username',b.username);}done(r.status);}).catch(()=>done(0));`);
      assert.equal(refresh,200,'Secure HttpOnly refresh cookie should rotate through the dev proxy');
      assert(!(await driver.executeScript('return document.cookie')).includes('compleat_refresh'));
      await open(driver,'/account/security');await driver.wait(until.elementLocated(By.id('verification-code')),15000);
      const log=fs.readFileSync(runtime,'utf8');const marker=log.lastIndexOf('Development email to '+email);assert(marker>=0,'Development email must be delivered to the test mailbox');
      const code=log.slice(marker,marker+800).match(/Your Compleat code is ([0-9]{6})/)[1];
      await driver.findElement(By.id('verification-code')).sendKeys(code);await driver.findElement(By.css('form button')).click();
      await driver.wait(async()=>!(await driver.findElements(By.id('verification-code'))).length,10000);
      const dimensions=await driver.executeScript('return {width:innerWidth,scroll:document.documentElement.scrollWidth}');assert.equal(dimensions.width,dimensions.scroll);
      assert((await driver.findElement(By.css('.account-security')).getText()).includes('This device'));
      fs.writeFileSync(path.join(out,device.id+'-security.png'),await driver.takeScreenshot(),'base64');
      await driver.findElement(By.id('delete-password')).sendKeys(password);await driver.findElement(By.id('delete-confirmation')).sendKeys(username);
      await driver.executeScript('document.querySelector(".account-danger button").scrollIntoView({block:"center"})');
      await driver.findElement(By.css('.account-danger button')).click();await driver.wait(until.urlContains('/login'),10000);
      await open(driver,'/recover-account');await driver.findElement(By.id('recovery-email')).sendKeys(email);await driver.findElement(By.css('form button')).click();
      await driver.wait(until.elementLocated(By.id('reset-code')),10000);assert((await driver.findElement(By.css('.account-notice')).getText()).includes('If that address has an account'));
      fs.writeFileSync(path.join(out,device.id+'-recovery.png'),await driver.takeScreenshot(),'base64');
      console.log(device.id+': registration, refresh cookie, verification, account controls, deletion and recovery passed');
    }finally{await driver.quit();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
