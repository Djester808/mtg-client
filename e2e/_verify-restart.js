// Does a real game, played by two real accounts over the real hub, survive killing the API?
//
// A one-off, and deliberately not part of any gate: it needs the API stopped and started between
// its two phases, which no test runner can do to the process it is talking to. The in-process
// tests (GameStoreTests, GameSessionTests) prove the store and the replay; this proves the thing
// a player would notice, which is that the game is still there afterwards.
//
//   node _verify-restart.js setup     -> plays a game, writes a snapshot, prints the game id
//   <restart the API>
//   node _verify-restart.js verify    -> reads the game back and compares, then plays on
//
// Everything goes through http://localhost:4200, because the dev server proxies /api and /hubs
// to the API over TLS — the same path a browser takes, and no self-signed certificate to argue
// with.

const fs = require('fs');
const path = require('path');
const signalR = require('@microsoft/signalr');

const BASE = 'http://localhost:4200';
const SNAPSHOT = path.join(__dirname, '.restart-snapshot.json');

// Fixed, so a rerun reuses the same two accounts instead of filling the database with players.
const PLAYERS = [
  {
    username: 'restart-check-a',
    email: 'restart-check-a@example.invalid',
    password: 'restart-check-a-pw',
  },
  {
    username: 'restart-check-b',
    email: 'restart-check-b@example.invalid',
    password: 'restart-check-b-pw',
  },
];

// Vanilla creatures and basic lands: the engine plays these with no card definition at all, so
// the deck passes the legality gate without depending on the size of the implemented pool.
const DECKLIST = ['8 Forest', '12 Grizzly Bears'].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fails loudly rather than hanging: a promise that never settles is the worst kind of report. */
function within(ms, what, promise) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out: ' + what)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function api(token, method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : null;
}

/** Registers the player, or signs in if a previous run already made them. */
async function signIn(player) {
  try {
    return (await api(null, 'POST', '/api/auth/register', {...(player), acceptedTerms:true})).token;
  } catch (err) {
    if (!String(err.message).includes('409')) throw err;
    const loggedIn = await api(null, 'POST', '/api/auth/login', {
      username: player.username,
      password: player.password,
    });
    return loggedIn.token;
  }
}

/** The player id the server will act as, read from the token it issued. */
function userIdFromToken(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  return (
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
    payload.nameid ??
    payload.sub
  );
}

async function deckFor(token, name) {
  const decks = await api(token, 'GET', '/api/games/decks');
  const existing = decks.find((d) => d.name === name);
  if (existing) return existing.id;

  const imported = await api(token, 'POST', '/api/decks/import', { name, text: DECKLIST });
  return imported.deck.id;
}

/** A live hub connection for one player, recording the views the server pushes. */
async function connect(token, label) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(BASE + '/hubs/game', { accessTokenFactory: () => token })
    .build();

  const seen = { view: null, refusals: [] };
  connection.on('State', (view) => {
    seen.view = view;
  });
  connection.on('Refused', (why) => {
    seen.refusals.push(why);
  });
  connection.on('Log', () => {});
  connection.onclose((err) => {
    if (err) console.log('  [' + label + '] connection closed: ' + err.message);
  });

  await within(20000, label + ' connecting to the hub', connection.start());
  console.log('  [' + label + '] connected');
  return { connection, seen, label };
}

/** Answers whatever the game is waiting on, from whichever seat it is asking. */
async function answerChoices(gameId, players, rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    await sleep(150);
    const view = players[0].seen.view;
    if (!view || !view.choice) return;

    const asking = players.find((p) => p.playerId === view.choice.playerId);
    if (!asking) {
      console.log('  nobody here is being asked: ' + view.choice.prompt);
      return;
    }

    // Options are only sent to the player being asked, so they are read from that seat.
    const options = (asking.seen.view.choice && asking.seen.view.choice.options) || [];
    const picks = options.length > 0 ? [options[0].id] : ['keep'];
    await within(
      10000,
      asking.label + ' answering',
      asking.connection.invoke('Choose', gameId, picks),
    );
  }
}

async function joinAll(gameId, tokens) {
  const players = [];
  for (let i = 0; i < tokens.length; i++) {
    const p = await connect(tokens[i], PLAYERS[i].username);
    await within(15000, p.label + ' joining', p.connection.invoke('Join', gameId));
    await sleep(400);
    if (!p.seen.view) throw new Error(p.label + ' joined but was never sent a view');
    p.playerId = p.seen.view.viewer;
    players.push(p);
    console.log('  [' + p.label + '] joined as ' + p.playerId);
  }
  return players;
}

/**
 * Both players try to pass, and whichever does not hold priority is refused.
 *
 * That is what the board itself does: the view does not say who holds priority, so the client
 * sends the intent and the server is the one that knows.
 */
async function passRound(gameId, players) {
  for (const p of players) {
    await within(10000, p.label + ' passing', p.connection.invoke('PassPriority', gameId));
  }
}

async function setup() {
  const tokens = await Promise.all(PLAYERS.map(signIn));
  console.log('signed in as both players');

  const deckIds = [];
  for (let i = 0; i < tokens.length; i++) {
    deckIds.push(await deckFor(tokens[i], 'Restart Check ' + (i === 0 ? 'A' : 'B')));
  }
  console.log('decks: ' + deckIds.join(', '));

  // An invitation names its opponent, so B is identified before A sends it. The id comes out of
  // B's own token rather than a lookup endpoint: this script stands in for two people who
  // already know who they are playing.
  const invite = await api(tokens[0], 'POST', '/api/games/invites', {
    deckId: deckIds[0],
    opponentUserId: userIdFromToken(tokens[1]),
    startingLife: 20,
  });
  console.log('invite: ' + invite.id);

  const started = await api(tokens[1], 'POST', '/api/games/invites/' + invite.id + '/accept', {
    deckId: deckIds[1],
  });
  const gameId = started.gameId;
  console.log('game: ' + gameId);

  const players = await joinAll(gameId, tokens);

  await answerChoices(gameId, players);
  console.log('opening choices answered; step is ' + players[0].seen.view.currentStep);

  // A few real actions, so the stored log is a game in progress rather than a fresh one.
  for (let i = 0; i < 6; i++) {
    await sleep(150);
    if (players[0].seen.view.choice) {
      await answerChoices(gameId, players, 4);
      continue;
    }
    await passRound(gameId, players);
  }

  await sleep(500);
  const view = await api(tokens[0], 'GET', '/api/games/' + gameId);
  const log = await api(tokens[0], 'GET', '/api/games/' + gameId + '/log');

  fs.writeFileSync(SNAPSHOT, JSON.stringify({ gameId, tokens, view, log }, null, 2));

  console.log(
    'turn ' + view.turnNumber + ', step ' + view.currentStep + ', ' + log.length + ' log lines',
  );
  console.log('snapshot written. Restart the API, then run: node _verify-restart.js verify');

  await Promise.all(players.map((p) => p.connection.stop()));
}

function differences(before, after) {
  const out = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const a = JSON.stringify(before ? before[key] : undefined);
    const b = JSON.stringify(after ? after[key] : undefined);
    if (a !== b) {
      out.push(
        'view.' +
          key +
          '\n      before ' +
          String(a).slice(0, 160) +
          '\n      after  ' +
          String(b).slice(0, 160),
      );
    }
  }
  return out;
}

async function verify() {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const gameId = snap.gameId;
  const tokens = snap.tokens;

  // Straight to the REST seed: this is a cold server that has never heard of this game, so
  // answering at all means it went to the database and replayed the log.
  const view = await api(tokens[0], 'GET', '/api/games/' + gameId);
  const log = await api(tokens[0], 'GET', '/api/games/' + gameId + '/log');

  console.log(
    'before: turn ' +
      snap.view.turnNumber +
      ' ' +
      snap.view.currentStep +
      ', ' +
      snap.log.length +
      ' log lines',
  );
  console.log(
    'after:  turn ' + view.turnNumber + ' ' + view.currentStep + ', ' + log.length + ' log lines',
  );

  const diffs = differences(snap.view, view);
  if (diffs.length > 0) {
    console.log('\nTHE RESUMED GAME IS NOT THE GAME THAT WAS STORED:');
    diffs.forEach((d) => console.log('  ' + d));
    process.exitCode = 1;
    return;
  }
  console.log('the resumed view is identical, field for field');

  const sameLog = JSON.stringify(snap.log) === JSON.stringify(log);
  console.log('the log is ' + (sameLog ? 'identical' : 'DIFFERENT') + ' line for line');
  if (!sameLog) process.exitCode = 1;

  // And it is still a game, not a photograph of one.
  const players = await joinAll(gameId, tokens);
  const before = log.length;

  if (view.choice) {
    await answerChoices(gameId, players, 6);
  } else {
    await passRound(gameId, players);
  }
  await sleep(500);

  const after = await api(tokens[0], 'GET', '/api/games/' + gameId + '/log');
  console.log('played on after the restart: ' + before + ' -> ' + after.length + ' log lines');

  if (after.length <= before) {
    console.log('THE RESUMED GAME DID NOT ACCEPT AN ACTION');
    process.exitCode = 1;
  }

  await Promise.all(players.map((p) => p.connection.stop()));
}

const mode = process.argv[2];
(mode === 'verify' ? verify() : setup()).catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
