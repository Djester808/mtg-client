// Reproduces a 500 from GET /api/games/{id} and says what the server sent back.
//
//   node _diag-game-500.js <gameId>
const { api, signIn } = require('./helpers/board-driver');

(async () => {
  const gameId = process.argv[2];
  const token = await signIn({ username: 'restart-check-a', password: 'restart-check-a-pw' });

  try {
    const view = await api(token, 'GET', '/api/games/' + gameId);
    console.log('ok: step ' + view.currentStep + ', stack ' + view.stack.length);
  } catch (err) {
    console.log('failed: ' + String(err.message).slice(0, 400));
  }
})().catch((e) => {
  console.error(String(e && e.message ? e.message : e).slice(0, 300));
  process.exitCode = 1;
});
