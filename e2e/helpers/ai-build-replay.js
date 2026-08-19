// Replays a recorded AI deck build into the running client, with no AI calls.
//
// Why this exists: the builder's two server calls are the most expensive in the app —
// Opus 5, three calls per journey, ~3 minutes, and because the model reasons adaptively it
// bills close to the whole token ceiling every time, whether the answer comes back usable
// or not. Driving the *client* through a live build to check a tab strip or a phone layout
// costs real money for an answer the client alone decides.
//
// So the server's own bytes are recorded once and replayed here. Everything downstream of
// the network runs for real: the SSE framing in utils/sse.ts, the service, the component's
// stage/plan/final handling, the review tabs, the card modal.
//
// `provideHttpClient(withFetch())` means every HttpClient call goes through window.fetch,
// so one stub covers the suggestions POST and the build stream alike. It is installed with
// Page.addScriptToEvaluateOnNewDocument rather than executeScript, because Angular's fetch
// backend captures its reference during bootstrap — a stub installed after load is simply
// not the function the app ends up calling.

const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

const suggestions = () => fs.readFileSync(path.join(FIXTURES, 'ai-build-suggestions.json'), 'utf8');
const stream = () => fs.readFileSync(path.join(FIXTURES, 'ai-build-stream.sse'), 'utf8');

/**
 * The page-side stub. Serialised into the browser, so it can only use what is in scope
 * there — the two fixtures are injected as literals by `arm`.
 */
const STUB = `
(function () {
  if (window.__aiReplayArmed) return;
  window.__aiReplayArmed = true;

  const real = window.fetch.bind(window);
  const enc = new TextEncoder();
  window.__aiReplayHits = [];

  window.fetch = function (input, init) {
    const url = String(typeof input === 'string' ? input : (input && input.url) || '');
    window.__aiReplayHits.push(url);

    if (url.includes('commander-suggestions')) {
      return Promise.resolve(new Response(window.__aiReplay.suggestions, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    if (url.includes('ai-build/plan/stream')) {
      // Chunked rather than handed over whole, so the client's SSE framing does real
      // work: frame boundaries land mid-buffer exactly as they do against the server,
      // which is the case that broke it before (a trailing frame that never flushed).
      const bytes = enc.encode(window.__aiReplay.stream);
      const body = new ReadableStream({
        start(c) {
          let i = 0;
          const pump = () => {
            if (i >= bytes.length) { c.close(); return; }
            c.enqueue(bytes.slice(i, i + window.__aiReplay.chunk));
            i += window.__aiReplay.chunk;
            setTimeout(pump, window.__aiReplay.delay);
          };
          pump();
        },
      });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    }

    return real(input, init);
  };
})();
`;

/**
 * Installs the replay on a driver, for every document it loads from here on.
 *
 * Idempotent per driver: addScriptToEvaluateOnNewDocument accumulates, and a second copy
 * would wrap the first stub instead of the real fetch.
 *
 * @param {object} driver           Selenium driver (Chromium — this uses CDP).
 * @param {object} [opts]
 * @param {number} [opts.chunk]     Bytes per stream chunk.
 * @param {number} [opts.delay]     Milliseconds between chunks. The whole replay takes
 *                                  roughly (bytes / chunk) * delay, so the defaults put a
 *                                  ~70KB build at about a fifth of a second.
 */
async function armAiBuildReplay(driver, opts = {}) {
  if (driver.__aiReplayArmed) return;
  driver.__aiReplayArmed = true;

  const data =
    'window.__aiReplay = ' +
    JSON.stringify({
      suggestions: suggestions(),
      stream: stream(),
      chunk: opts.chunk ?? 4096,
      delay: opts.delay ?? 12,
    }) +
    ';\n';

  await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: data + STUB,
  });
}

/**
 * Re-paces the replay on the page that is already loaded.
 *
 * The stub reads chunk/delay at fetch time, so this takes effect for the next build on
 * this page and is forgotten on navigation. Needed because the default pacing finishes a
 * 70KB stream in about a fifth of a second — right for a review-state capture, far too
 * fast to ever photograph the progress bar, which is the part of this screen that has been
 * wrong the most often.
 */
async function paceAiBuildReplay(driver, { chunk = 2048, delay = 260 } = {}) {
  await driver.executeScript(
    'window.__aiReplay.chunk = arguments[0]; window.__aiReplay.delay = arguments[1];',
    chunk,
    delay,
  );
}

/** How many commanders the suggestions fixture offers. */
const fixtureCommanderCount = () => JSON.parse(suggestions()).commanders.length;

/** How many cards the recorded plan contains. */
function fixturePlanCardCount() {
  for (const frame of stream().split('\n\n')) {
    if (!frame.startsWith('event: plan')) continue;
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    return JSON.parse(line.slice(6)).cards.length;
  }
  return 0;
}

module.exports = {
  armAiBuildReplay,
  paceAiBuildReplay,
  fixtureCommanderCount,
  fixturePlanCardCount,
};
