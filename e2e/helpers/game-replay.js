// Serves a canned game view to the board, with no server and no socket.
//
// The board's live updates come over SignalR, which a capture run cannot stand up: it needs a
// real game, two seated players and a token. But the board also seeds itself from
// GET /api/games/{id} on load — it does that so a refresh is not a blank screen while the
// other player thinks — and that is a plain fetch, which is stubbable.
//
// So the audit measures the board from the REST seed. The socket then fails to connect, which
// is itself worth capturing: the connection indicator is part of the layout and this is the
// only run that ever exercises it.
//
// Installed with Page.addScriptToEvaluateOnNewDocument for the same reason as the AI replay:
// provideHttpClient(withFetch()) captures window.fetch during bootstrap, so a stub installed
// after load is not the function the app ends up calling.

const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

const view = () => fs.readFileSync(path.join(FIXTURES, 'game-view.json'), 'utf8');

const LOG = JSON.stringify([
  'Game started with 2 players; Alice goes first.',
  'Turn 6 began (Alice active).',
  'Upkeep began.',
  'Alice played a land.',
  'Alice cast Giant Growth.',
  'Bob cast Counterspell.',
]);

const STUB = `
(function () {
  // The fixture is refreshed on every arm, and only the fetch override is installed once.
  // Guarding the whole thing meant that on a run capturing several states, the first arm won
  // and every later state was silently measured against the first state's fixture — which is
  // how a board that was supposed to be mid-combat kept capturing a main phase.
  window.__gameReplayView = __VIEW__;
  window.__gameReplayLog = __LOG__;

  // A session, so the route guard lets the board render — and only while the board is on
  // screen.
  //
  // Every byte these states measure comes from the stub below, so requiring a real sign-in first
  // made the whole game section uncapturable on a machine without E2E_USERNAME. The guard reads
  // these two keys and nothing else (store/auth/auth.reducer.ts), so this is the entire login as
  // far as the client is concerned.
  //
  // The confinement to /play is the important half, and it was learned the hard way. This script
  // is installed with Page.addScriptToEvaluateOnNewDocument, which persists for the whole driver,
  // and the driver is shared by every state in a run. A token seeded here therefore outlived the
  // game states: later screens sent it to the real API, got a 401, and the interceptor logged the
  // browser out mid-run — surfacing as an unrelated screen failing to render several states
  // later, with nothing on it to say why.
  //
  // So it is set only on a game route, and taken away again anywhere else. A real session is
  // never touched: the seed only fills an empty slot, and only ever removes its own token.
  // Written without a regex on purpose: this whole script is a template literal, where a
  // backslash escape is eaten before the browser ever sees it, and the pattern it left behind
  // was a syntax error that killed the stub silently.
  var here = location.pathname;
  var onGameRoute = here === '/play' || here.indexOf('/play/') === 0;
  var seeded = 'capture-harness-token';

  if (onGameRoute) {
    if (!localStorage.getItem('auth_token')) {
      localStorage.setItem('auth_token', seeded);
      localStorage.setItem('auth_username', 'Alice');
    }
  } else if (localStorage.getItem('auth_token') === seeded) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
  }

  if (window.__gameReplayArmed) return;
  window.__gameReplayArmed = true;

  const real = window.fetch.bind(window);
  // What the stub was asked for, so a run that renders nothing can say which call went wrong.
  window.__gameReplayHits = [];

  const json = (body) =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    window.__gameReplayHits.push(url);

    // The one call that decides whether the seeded session survives.
    //
    // The navbar asks for the signed-in profile on boot. Against the real API the harness's
    // token is not a session, so it comes back 401, the interceptor treats that as an expired
    // session and dispatches logout, and the route guard bounces the board to /login — which
    // is exactly what happened, and it looks like the board failing to render rather than the
    // session being thrown away underneath it.
    //
    // Answered as small as the navbar reads it (username, display name, avatar), rather than
    // as a whole MyProfile: a fuller fixture here would be a second copy of a DTO this file
    // has no business tracking.
    if (url.indexOf('/api/profile/me') !== -1) {
      return Promise.resolve(json(JSON.stringify({
        profile: { username: 'Alice', displayName: 'Alice', avatarUrl: null },
      })));
    }

    // The lobby. Its own decks and invitations, so the phone audit measures a lobby with
    // something in it rather than the empty state it would otherwise always capture.
    if (url.indexOf('/api/games/decks') !== -1) {
      return Promise.resolve(json(JSON.stringify([
        { id: 'deck-1', name: 'Elves of Llanowar', cardCount: 60 },
        { id: 'deck-2', name: 'Mono-Red Aggro', cardCount: 60 },
      ])));
    }

    if (url.indexOf('/api/games/invites/sent') !== -1) {
      return Promise.resolve(json('[]'));
    }

    if (url.indexOf('/api/games/invites') !== -1) {
      return Promise.resolve(json(JSON.stringify([
        {
          id: 'invite-1',
          fromUserId: 'bbbbbbbb-0000-0000-0000-000000000002',
          fromUserName: 'Bob',
          startingLife: 40,
          createdUtc: '2026-08-20T00:00:00Z',
        },
      ])));
    }

    if (url.indexOf('/api/users') !== -1) {
      return Promise.resolve(json(JSON.stringify([
        { userId: 'bbbbbbbb-0000-0000-0000-000000000002', username: 'Bob' },
        { userId: 'cccccccc-0000-0000-0000-000000000003', username: 'Carol' },
      ])));
    }

    if (/\\/api\\/games\\/[^/]+\\/log$/.test(url)) {
      return Promise.resolve(json(JSON.stringify(window.__gameReplayLog)));
    }

    if (/\\/api\\/games\\/[^/?]+$/.test(url)) {
      return Promise.resolve(json(JSON.stringify(window.__gameReplayView)));
    }

    // The hub's negotiate call. Refused deliberately: there is no socket to give it, and the
    // board is expected to stay usable on the seeded view when the connection is down.
    if (url.indexOf('/hubs/game') !== -1) {
      return Promise.resolve(new Response('{}', { status: 503 }));
    }

    return real(input, init);
  };
})();
`;

/** Installs the stub so it runs before the app bootstraps on the next navigation. */
async function armGameReplay(driver, overrides = {}) {
  const fixture = JSON.parse(view());
  Object.assign(fixture, overrides);
  const script = STUB.replace('__VIEW__', JSON.stringify(fixture)).replace('__LOG__', LOG);
  await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: script });
}

module.exports = { armGameReplay };
