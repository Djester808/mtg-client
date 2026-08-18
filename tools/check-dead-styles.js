#!/usr/bin/env node
//
// Fails when a shared SCSS mixin has no caller.
//
// `styles/_filter-bar.scss` shipped ten mixins and four were ever included. They were dead
// the day they were written — a vocabulary designed ahead of the bars that were going to
// use it, for bars that never arrived. Nothing in lint, the build, the tests or the
// architecture tests can see an unused mixin, so they sat there looking like API.
//
// Scoped to src/styles/ on purpose: those files exist to be included from elsewhere, so
// "nobody calls this" is unambiguous. A mixin private to one component is its own business.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const SHARED = path.join(ROOT, 'styles');

/** Every .scss/.ts/.html under src, so a caller anywhere counts. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(scss|ts|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

const dead = [];
for (const file of files.filter((f) => f.startsWith(SHARED))) {
  const text = sources.get(file);
  for (const match of text.matchAll(/^@mixin\s+([\w-]+)/gm)) {
    const name = match[1];
    const called = [...sources].some(
      ([f, body]) => f !== file && new RegExp(`@include\\s+${name}\\b`).test(body),
    );
    // A mixin may also be included by a sibling inside the same shared file.
    const selfCalled = new RegExp(`@include\\s+${name}\\b`).test(text);
    if (!called && !selfCalled) {
      dead.push(`${path.relative(ROOT, file)}  @mixin ${name}`);
    }
  }
}

if (dead.length) {
  console.error('Dead shared mixins — defined, never included:\n');
  for (const d of dead) console.error('  ' + d);
  console.error(
    '\nDelete them, or include them where they were meant to go. A shared vocabulary that\n' +
      'nothing speaks is not an abstraction, it is a file to keep updating for no reader.\n',
  );
  process.exit(1);
}

console.log(`check-dead-styles: no unused mixins in ${path.relative(ROOT, SHARED)}`);
