const fs = require('fs');
const assert = require('assert/strict');
const signalR = require('@microsoft/signalr');
const { By, until } = require('selenium-webdriver');
const { api, signIn, userIdFromToken } = require('./board-driver');
const { buildDriver } = require('./driver');
const { baseUrl } = require('../config');

/** Shared live seats, legal turn advancement and cleanup for library acceptance tests. */
class LibraryTable {
  constructor(name, deckText, capturePrefix, capacity = 2, format = 'casual') {
    Object.assign(this, { name, deckText, capturePrefix, capacity, format });
    this.tokens=[];this.decks=[];this.hubs=[];this.drivers=[];this.views=[];
    this.revisions=Array(capacity).fill(0);this.refused=[];this.choicePushes=[];
  }
  wait = fn => this.drivers[0].wait(fn,15000);
  seat = id => this.views.findIndex(v=>v.viewer.value===id);
  shot = async(i,name)=>fs.writeFileSync(`e2e/screenshots/${this.capturePrefix}-${name}.png`,await this.drivers[i].takeScreenshot(),'base64');
  dismiss = async d=>{const skips=await d.findElements(By.css('.intro-skip'));if(skips.length)await skips[0].click();await d.wait(async()=>!(await d.findElements(By.css('.brand-intro'))).length,12000);};
  command = async(i,data)=>{const before=[...this.revisions],errors=this.refused.length;await this.hubs[i].invoke('Command',this.gameId,data);await this.wait(()=>this.refused.length>errors||this.revisions.every((r,j)=>r>before[j]));assert.equal(this.refused.length,errors,JSON.stringify(this.refused));};
  advance = async()=>{
    const v=this.views[0];
    if(v.pending?.kind==='discard'){const i=this.seat(v.pending.player.value),p=this.views[i].pending;await this.command(i,{kind:'answer',choice:p.id.value,answer:p.options.slice(0,p.min).map(o=>o.id)});}
    else if(v.priorityHolder)await this.command(this.seat(v.priorityHolder.value),{kind:'pass'});
    else if(v.step==='DeclareAttackers')await this.command(this.seat(v.activePlayer.value),{kind:'attack',attacks:[]});
    else throw Error('No action at '+v.step);
  };
  async start(prepareDeck, keepOpeningHands = true){
    const players=Array.from({length:this.capacity},(_,i)=>String.fromCharCode(97+i)).map(x=>({username:this.capturePrefix.replaceAll('-','_')+'_'+x,password:'LibraryLive-test-2026!'}));
    for(const p of players){const token=await signIn(p);this.tokens.push(token);const all=await api(token,'GET','/api/games/lobbies/decks');let deck=all.find(d=>d.name===this.name);if(!deck)deck=(await api(token,'POST','/api/decks/import',{name:this.name,text:this.deckText,format:this.format})).deck;this.decks.push(deck.id);}
    if(prepareDeck)for(let i=0;i<this.tokens.length;i++)await prepareDeck(this.tokens[i],this.decks[i],i);
    let lobby=await api(this.tokens[0],'POST','/api/games/lobbies',{deckId:this.decks[0],capacity:this.capacity,format:this.format,startingLife:this.format==='commander'?40:20,allowHonourSystem:true,invitees:this.tokens.slice(1).map(userIdFromToken)});
    for(let i=1;i<this.capacity;i++)lobby=await api(this.tokens[i],'POST','/api/games/lobbies/'+lobby.id+'/deck',{deckId:this.decks[i],revision:lobby.revision});
    this.gameId=(await api(this.tokens[0],'POST','/api/games/lobbies/'+lobby.id+'/start',{revision:lobby.revision})).gameId;
    console.log('Table',this.gameId);
    for(let i=0;i<this.capacity;i++){
      const h=new signalR.HubConnectionBuilder().withUrl(baseUrl+'/hubs/game',{accessTokenFactory:()=>this.tokens[i]}).configureLogging(signalR.LogLevel.Error).build();this.hubs.push(h);
      h.on('ViewUpdated',v=>{this.views[i]=v;this.revisions[i]++;});h.on('ChoiceRequested',choice=>{this.choicePushes.push({seat:i,choice,viewChoice:this.views[i]?.pending});});h.on('Refused',r=>{this.refused.push(r);});h.on('Log',()=>{});await h.start();await h.invoke('Join',this.gameId);
      const d=await buildDriver();this.drivers.push(d);await d.get(baseUrl+'/login');await d.executeScript('localStorage.setItem("auth_token",arguments[0]);localStorage.setItem("auth_username",arguments[1]);',this.tokens[i],players[i].username);await d.get(baseUrl+'/game/'+this.gameId);await d.wait(until.elementLocated(By.css('.self-table .life')),20000);await this.dismiss(d);
    }
    while(keepOpeningHands && this.views[0].pending){const p=this.views[0].pending;await this.command(this.seat(p.player.value),{kind:'answer',choice:p.id.value,answer:['keep']});}
  }
  assertChoicePrivacy() {
    assert(this.choicePushes.length > 0, 'Observed direct choice pushes');
    for (const {seat, choice, viewChoice} of this.choicePushes) {
      assert.equal(choice.player.value, this.views[seat].viewer.value);
      assert.deepEqual(choice, viewChoice, 'Direct push matches the viewer-authorized choice');
      assert.equal(choice.context.event ?? null, null);
      assert.equal(choice.context.replacementContinuation ?? null, null);
      assert.equal((choice.context.deferredDraws ?? []).length, 0);
      assert.equal((choice.context.deferredZoneMoves ?? []).length, 0);
      assert.equal(choice.context.zoneMoveSnapshot ?? null, null);
      assert.equal((choice.context.deferredTriggerEvents ?? []).length, 0);
      assert.equal((choice.context.deferredTriggers ?? []).length, 0);
      assert(!Object.keys(choice.context.extra ?? {}).some(key => key.startsWith('remembered:') || key.startsWith(':search-plan:')));
    }
  }
  async close(){
    if(this.gameId)for(const h of this.hubs)if(h.state===signalR.HubConnectionState.Connected)await h.invoke('Command',this.gameId,{kind:'concede'}).catch(()=>{});
    for(const d of this.drivers)await d.quit();for(const h of this.hubs)await h.stop();
  }
}
module.exports={LibraryTable};
