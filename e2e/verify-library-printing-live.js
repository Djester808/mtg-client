const assert = require('assert/strict');
const { LibraryTable } = require('./helpers/library-table');
const { api } = require('./helpers/board-driver');
(async () => {
  const table = new LibraryTable('Selected printing live', '60 Mountain', 'library-printing');
  const selected = [];
  try {
    await table.start(async (token, deckId, seat) => {
      const deck = await api(token, 'GET', '/api/decks/' + deckId);
      assert.equal(deck.cards.length, 1);
      const row = deck.cards[0];
      const printings = await api(token, 'GET', '/api/cards/' + row.oracleId + '/printings');
      const distinct = [...new Map(printings.filter(p => p.imageUriNormal).map(p => [p.imageUriNormal, p])).values()];
      assert(distinct.length >= 2);
      selected[seat] = distinct[seat];
      await api(token, 'PUT', `/api/collections/${deckId}/cards/${row.id}`, {
        quantity: seat === 0 ? 60 : 0, quantityFoil: seat === 1 ? 60 : 0,
        quantityEtched: 0, scryfallId: selected[seat].scryfallId,
      });
    });
    for (let i = 0; i < 2; i++) {
      const snapshot = await api(table.tokens[i], 'GET', '/api/games/' + table.gameId);
      for (const card of snapshot.view.hand) {
        assert.equal(card.printingId, selected[i].scryfallId);
        assert.equal(snapshot.artwork[card.artworkKey].imageUri, selected[i].imageUriNormal);
      }
      assert(!JSON.stringify(snapshot).includes(selected[1-i].scryfallId), 'Opponent hand printing is private');
      await table.drivers[i].navigate().refresh();
      await table.dismiss(table.drivers[i]);
      await table.drivers[i].wait(async () => (await table.drivers[i].executeScript(
        'return [...document.images].some(i => i.src === arguments[0] && i.complete && i.naturalWidth > 0)', selected[i].imageUriNormal)), 15000);
    }
    const played = new Set();
    for (let n = 0; n < 120 && played.size < 2; n++) {
      const v = table.views[0], i = table.seat(v.activePlayer.value);
      if (!played.has(i) && v.step === 'PrecombatMain' && v.priorityHolder?.value === v.activePlayer.value) {
        await table.command(i, { kind: 'playLand', card: table.views[i].hand[0].id.value });
        played.add(i);
      } else await table.advance();
    }
    assert.equal(played.size, 2);
    for (let i = 0; i < 2; i++) {
      const snapshot = await api(table.tokens[i], 'GET', '/api/games/' + table.gameId);
      assert.equal(snapshot.view.battlefield.length, 2);
      for (const card of snapshot.view.battlefield) {
        const printing = selected.find(p => p.scryfallId === card.printingId);
        assert(printing);
        assert.equal(snapshot.artwork[card.artworkKey].imageUri, printing.imageUriNormal);
      }
      for (const printing of selected) await table.drivers[i].wait(async () => table.drivers[i].executeScript(
        'return [...document.images].some(i => i.src === arguments[0] && i.complete && i.naturalWidth > 0)', printing.imageUriNormal), 15000);
    }
    await table.shot(0, 'desktop');
    for (const [name, width, height] of [['portrait',375,667],['landscape',667,375]]) {
      await table.drivers[0].sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:true});
      assert(await table.drivers[0].executeScript('return document.documentElement.scrollWidth <= innerWidth'));
      await table.shot(0, name);
    }
    console.log('PASS: selected printings, private hands, refresh, public movement, rendered art and phone captures', selected.map(p => p.scryfallId));
  } finally { await table.close(); }
})().catch(e => {console.error(e.stack);process.exitCode=1;});
