// Live local smoke: creates a two-player table using dedicated test accounts.
const fs = require('fs');
const assert = require('assert/strict');
const signalR = require('@microsoft/signalr');
const { By, until } = require('selenium-webdriver');
const { api, signIn, userIdFromToken } = require('./helpers/board-driver');
const { buildDriver } = require('./helpers/driver');
const { baseUrl } = require('./config');
(async () => {
  const players = ['a','b'].map(x => ({username:'roomy_smoke_'+x,password:'RoomySmoke-test-2026!'}));
  const tokens=[], decks=[], hubs=[], drivers=[];
  let gameId;
  try {
    for (const player of players) {
      const token = await signIn(player); tokens.push(token);
      const list = await api(token,'GET','/api/games/lobbies/decks');
      const deck = list.find(d => d.name === 'Roomy smoke');
      decks.push(deck?.id ?? (await api(token,'POST','/api/decks/import',{name:'Roomy smoke',text:'40 Mountain\n20 Goblin Piker',format:'casual'})).deck.id);
    }
    let table = await api(tokens[0],'POST','/api/games/lobbies',{deckId:decks[0],capacity:2,format:'casual',startingLife:20,allowHonourSystem:true,invitees:[userIdFromToken(tokens[1])]});
    table = await api(tokens[1],'POST','/api/games/lobbies/'+table.id+'/deck',{deckId:decks[1],revision:table.revision});
    gameId = (await api(tokens[0],'POST','/api/games/lobbies/'+table.id+'/start',{revision:table.revision})).gameId;
    console.log('Created live table',gameId);
    const views=[null,null], refused=[];
    for (let i=0;i<2;i++) {
      const hub = new signalR.HubConnectionBuilder().withUrl(baseUrl+'/hubs/game',{accessTokenFactory:()=>tokens[i]}).configureLogging(signalR.LogLevel.Error).build();
      hubs.push(hub);
      hub.on('ViewUpdated',v=>views[i]=v);
      hub.on('Refused',r=>refused.push(r));
      hub.on('Log',()=>{});
      await hub.start(); await hub.invoke('Join',gameId);
      const driver=await buildDriver(); drivers.push(driver);
      await driver.get(baseUrl+'/login');
      await driver.executeScript('localStorage.setItem("auth_token",arguments[0]);localStorage.setItem("auth_username",arguments[1]);',tokens[i],players[i].username);
      await driver.get(baseUrl+'/game/'+gameId);
      await driver.wait(until.elementLocated(By.css('.self-table .life')),20000);
      const skip=await driver.findElements(By.css('.intro-skip'));
      if(skip.length)await skip[0].click();
      await driver.wait(async()=>!(await driver.findElements(By.css('.brand-intro'))).length,12000);
    }
    assert(views.every(v=>v.players.length===2),'Both seats receive live views');
    assert.notEqual(views[0].viewer.value,views[1].viewer.value);
    assert(views.every(v=>v.hand.length===7),'Each seat sees its opening hand');
    await drivers[0].findElement(By.css('[aria-label="Gain 1 life"]')).click();
    await drivers[0].wait(()=>views.every(v=>v.players.find(p=>p.id.value===views[0].viewer.value).life===21),10000);
    assert.equal(await drivers[0].findElement(By.css('.self-table .life')).getText(),'21');
    await drivers[1].wait(async()=>await drivers[1].findElement(By.css('.opponent-boards .life')).getText()==='21',10000);
    console.log('PASS: private opening hands, both live boards, life update synchronized across seats');
    // Drive the active seat through the actual Pass button and observe the hub update.
    const priority = views.findIndex(v=>v.viewer.value === v.priorityHolder?.value);
    if(priority>=0) {
      const before=JSON.stringify(views[0]);
      await drivers[priority].findElement(By.css('.action-btn.pass')).click();
      await drivers[0].wait(()=>JSON.stringify(views[0])!==before,10000);
      console.log('PASS: browser Pass action updates both live seats');
    }
    assert.deepEqual(refused,[],'No command refusals');
    fs.writeFileSync('e2e/screenshots/cleanup-live.png',await drivers[0].takeScreenshot(),'base64');
    console.log('Live smoke passed');
  } finally {
    // End only the test game created by this run.
    if(gameId && hubs[0]?.state===signalR.HubConnectionState.Connected) await hubs[0].invoke('Command',gameId,{kind:'concede'}).catch(()=>{});
    for(const driver of drivers)await driver.quit();
    for(const hub of hubs)await hub.stop();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
