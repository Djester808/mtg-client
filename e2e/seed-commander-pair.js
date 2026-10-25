const { api, signIn } = require('./helpers/board-driver');
const { username, password } = require('./config');
(async () => {
  const token = await signIn({username, password});
  const name = 'Commander pair preview';
  const existing = (await api(token, 'GET', '/api/decks')).find(deck => deck.name === name);
  const deck = existing ? await api(token, 'GET', '/api/decks/' + existing.id)
    : (await api(token, 'POST', '/api/decks/import', {name, format:'commander', text:'1 Thrasios, Triton Hero\n1 Tymna the Weaver\n98 Wastes'})).deck;
  const first = deck.cards.find(card => card.cardDetails?.name === 'Thrasios, Triton Hero');
  const second = deck.cards.find(card => card.cardDetails?.name === 'Tymna the Weaver');
  if (!first || !second) throw new Error('Preview deck did not import both commanders');
  await api(token, 'PUT', '/api/decks/' + deck.id, {name, format:'commander', commanderOracleId:first.oracleId, secondaryCommanderOracleId:second.oracleId});
  console.log('Prepared dedicated commander pair preview deck');
})().catch(error => {console.error(error.message); process.exitCode=1;});
