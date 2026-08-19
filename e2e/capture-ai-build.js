#!/usr/bin/env node
//
// Records a real AI deck build into fixtures/ai-build-stream.sse.
//
//   node capture-ai-build.js [--commander=<oracleId>] [--deck=<deckId>] [--strategy="wolf tribal"]
//
// This is the one script here that costs money: it runs a genuine build, which is an
// Opus 5 call of about three minutes. Everything else in the harness replays what this
// records. Run it when the plan DTO gains a field, or when the recorded deck is no longer
// representative — not as part of a normal verify.
//
// Talks to the API directly rather than driving the browser, because the browser is the
// thing the fixture exists to test and recording through it would bake its behaviour into
// the evidence.

const fs = require('fs');
const path = require('path');
const https = require('https');

const API = process.env.API_URL || 'https://localhost:7001';
const { username, password } = require('./config');

// The dev API serves a self-signed certificate.
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (method === 'POST' && url.includes('/stream')) {
            // Progress on one line: a three-minute wait with no output looks hung, and
            // this script is run rarely enough that nobody remembers it is slow.
            process.stdout.write(`\r  ${Math.round(data.length / 1024)}KB received…   `);
          }
        });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function arg(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

(async () => {
  if (!username || !password) {
    console.error('Set E2E_USERNAME and E2E_PASSWORD (see e2e/.env).');
    process.exit(1);
  }

  const login = await request('POST', `${API}/api/auth/login`, {
    body: { username, password },
  });
  const token = JSON.parse(login.body).token;
  if (!token) {
    console.error('Login failed:', login.status, login.body.slice(0, 200));
    process.exit(1);
  }

  const decks = JSON.parse((await request('GET', `${API}/api/decks`, { token })).body);
  const deckId = arg('deck', Array.isArray(decks) ? decks[0]?.id : decks.items?.[0]?.id);
  if (!deckId) {
    console.error('No deck to plan against. Create one first, or pass --deck=<id>.');
    process.exit(1);
  }

  // Tovolar by default — a two-colour tribal commander, which exercises the tribe hint and
  // gives the fixture a deck with a visible theme rather than a pile of good-stuff.
  const commanderOracleId = arg('commander', '45d49831-548a-4a0e-9a18-9f7397913895');
  const strategy = arg('strategy', 'wolf tribal');

  console.log(`Building ${strategy} for ${commanderOracleId} on deck ${deckId}`);
  console.log('This is a live Opus 5 call and takes minutes.');

  const started = Date.now();
  const res = await request('POST', `${API}/api/decks/${deckId}/ai-build/plan/stream`, {
    token,
    body: { commanderOracleId, bracket: 3, strategy },
  });
  process.stdout.write('\r');

  if (res.status !== 200) {
    console.error(`Stream failed: ${res.status}`, res.body.slice(0, 300));
    process.exit(1);
  }

  const frames = res.body.replace(/\r\n?/g, '\n').split('\n\n').filter(Boolean);
  const plan = frames.find((f) => f.startsWith('event: plan'));
  const cards = plan ? JSON.parse(plan.split('\n')[1].slice(6)).cards.length : 0;

  if (!cards) {
    // A build that returns nothing is exactly the failure this whole exercise was about.
    // Recording it as the fixture would bake it in.
    console.error(`Refusing to write: the build returned ${cards} cards. Check the API log.`);
    process.exit(1);
  }

  const out = path.join(__dirname, 'fixtures', 'ai-build-stream.sse');
  fs.writeFileSync(out, res.body.replace(/\r\n?/g, '\n'), 'utf8');

  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  console.log(
    `  ${frames.length} frames, ${cards} cards, ${Math.round((Date.now() - started) / 1000)}s`,
  );
  console.log('Update fixtures/README.md if the provenance note no longer describes this.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
