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
