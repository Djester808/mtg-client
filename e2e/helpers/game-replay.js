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
  //
  // The board's own route belongs in this list, and its absence is why the board had never
  // been captured. The two halves of this file disagreed: the fetch arms below already
  // answered for /game/:id, but the seed above covered only /play — so the board route was
  // bounced to /login by the auth guard before a single arm was reached, and the run reported
  // a page with nothing on it rather than a session that was never seeded.
  var here = location.pathname;
  var onGameRoute =
    here === '/play' ||
    here.indexOf('/play/') === 0 ||
    here === '/lobby' ||
    here.indexOf('/game/') === 0;
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

  // Every arm below answers for a game that is not running. Off a game route none of them mean
  // anything, and one of them — the /api/users arm, left over from when the opponent picker read
  // the public directory — matches the profile page's own request for a user. That handed the
  // profile a list where a profile should be, so it rendered "Joined Invalid Date" with no tabs
  // on it, and the state that opens its comment tab failed on every run since it was written.
  //
  // Checked per call rather than once at document start: this is a single-page app, and the
  // driver walks it from screen to screen without reloading.
  const onAGameRoute = function () {
    const here = window.location.pathname;
    return (
      here === '/play' ||
      here.indexOf('/play/') === 0 ||
      here === '/lobby' ||
      here.indexOf('/game/') === 0
    );
  };
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
    if (!onAGameRoute()) {
      return real(input, init);
    }

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

    // The hub's negotiate call, answered rather than refused.
    //
    // It used to come back 503, which reads as "the board stays usable with the socket down"
    // and is not what happens: SignalRService.connect() catches the failure from start() and
    // dispatches connectionError, whose effect clears the session and routes to '/'. So the
    // board rendered from the REST seed, was photographed by nobody, and was gone within the
    // second — which is the whole of "the board cannot be captured yet" in
    // ui-coverage-allow.json, and it was never the join endpoint that entry blames.
    //
    // Only WebSockets is offered, because window.WebSocket below is the thing answering.
    if (url.indexOf('/hubs/game') !== -1) {
      return Promise.resolve(json(JSON.stringify({
        negotiateVersion: 1,
        connectionId: 'capture-harness-connection',
        connectionToken: 'capture-harness-connection',
        availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
      })));
    }

    return real(input, init);
  };

  // ---- The socket ------------------------------------------------------------------------
  //
  // A hub connection the board can actually complete, so it is not thrown off its own screen
  // before anything has been photographed. It speaks only the four frames that matter: the
  // handshake, a ping, an invocation's completion, and a State push carrying the fixture.
  //
  // Pushing State rather than leaving the REST seed to do all the work is deliberate — it is
  // the path a real game takes on every action, and until now no capture had ever exercised
  // it. Everything the board is asked to do comes back "done" with the same view, which is
  // enough to photograph a state and honest about being a stub: it plays no rules.
  var RS = String.fromCharCode(30); // the record separator SignalR frames on
  var NativeWebSocket = window.WebSocket;

  function ReplaySocket(url) {
    var self = this;
    this.url = url;
    this.readyState = 0;
    this.binaryType = 'arraybuffer';
    this.onopen = this.onclose = this.onerror = this.onmessage = null;
    setTimeout(function () {
      self.readyState = 1;
      if (self.onopen) self.onopen({ target: self });
    }, 0);
  }

  ReplaySocket.CONNECTING = 0;
  ReplaySocket.OPEN = 1;
  ReplaySocket.CLOSING = 2;
  ReplaySocket.CLOSED = 3;
  ReplaySocket.prototype.CONNECTING = 0;
  ReplaySocket.prototype.OPEN = 1;
  ReplaySocket.prototype.CLOSING = 2;
  ReplaySocket.prototype.CLOSED = 3;

  ReplaySocket.prototype._push = function (obj) {
    var self = this;
    setTimeout(function () {
      if (self.readyState === 1 && self.onmessage) {
        self.onmessage({ data: JSON.stringify(obj) + RS });
      }
    }, 0);
  };

  ReplaySocket.prototype.send = function (data) {
    var self = this;
    // What the board sent, so a capture that renders nothing can say which call went wrong.
    window.__gameReplaySent = window.__gameReplaySent || [];

    String(data)
      .split(RS)
      .filter(function (f) { return f.length > 0; })
      .forEach(function (frame) {
        var msg;
        try {
          msg = JSON.parse(frame);
        } catch (e) {
          return;
        }

        // The handshake is the only frame with no type, and it is answered with an empty
        // object: any property on it is an error the client reports and closes on.
        if (msg.type === undefined) {
          setTimeout(function () {
            if (self.onmessage) self.onmessage({ data: '{}' + RS });
          }, 0);
          return;
        }

        if (msg.type === 6) {
          self._push({ type: 6 });
          return;
        }

        if (msg.type === 1) {
          // Arguments and all: the hub binds by position, so what a capture needs to be able to
          // assert is not only that CastSpell was called but what landed in each slot.
          window.__gameReplaySent.push({ target: msg.target, arguments: msg.arguments });
          if (msg.target === 'Join') {
            self._push({ type: 1, target: 'State', arguments: [window.__gameReplayView] });
            self._push({ type: 1, target: 'Log', arguments: [window.__gameReplayLog] });
          }
          if (msg.invocationId) {
            self._push({ type: 3, invocationId: msg.invocationId, result: null });
          }
        }
      });
  };

  ReplaySocket.prototype.close = function () {
    this.readyState = 3;
    if (this.onclose) this.onclose({ wasClean: true, code: 1000, reason: '' });
  };

  // Off a game route the real constructor stands, so nothing else in the app is affected by a
  // stub that outlives the states it was armed for.
  window.WebSocket = function (url, protocols) {
    if (!onAGameRoute() || String(url).indexOf('/hubs/game') === -1) {
      return new NativeWebSocket(url, protocols);
    }
    return new ReplaySocket(url);
  };
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
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
