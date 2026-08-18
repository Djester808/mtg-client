#!/usr/bin/env node
//
// A component must not re-implement a treatment styles/ already owns.
//
// check-dead-styles.js guards the opposite direction — a shared mixin with no caller. It
// has nothing to say about the failure that actually keeps happening, which is a
// component writing out a mixin's declarations by hand under new class names. The
// knowledge base did it twice in one change: a centred empty state and a loading state,
// both already sitting in styles/_detail-page.scss as `empty-state` and `loading-state`,
// both re-derived from scratch. Nothing failed, because nothing was looking.
//
//   node tools/check-shared-treatments.js [--base HEAD]
//   node tools/check-shared-treatments.js --update    # re-record the known copies
//
// The comparison is on declarations, not names, because that is how the duplication
// arrives: same properties, same values, different class name.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('base', 'HEAD');
const UPDATE = args.includes('--update');

// Two floors, both required. The ratio alone would fire on a three-property mixin that
// any flex row happens to match; the absolute alone would fire on a big block that
// overlaps a big mixin by a quarter.
const MIN_SHARED = 5;
const MIN_RATIO = 0.6;

const ROOT = path.join(__dirname, '..');
const STYLES = path.join(ROOT, 'src', 'styles');
const BASELINE = path.join(__dirname, 'baselines', 'shared-treatments.json');

/** `prop: value` pairs declared directly in a block, ignoring nested rules. */
function declarations(body) {
  const flat = body.replace(/&?[^;{}]*\{[^{}]*\}/g, ''); // drop one level of nesting
  const out = new Set();
  for (const m of flat.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) {
    const prop = m[1].trim();
    if (prop.startsWith('--')) continue;
    out.add(`${prop}:${m[2].trim().replace(/\s+/g, ' ')}`);
  }
  return out;
}

/** Reads a `{ ... }` body starting at the opening brace, brace-counting. */
function readBlock(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return '';
}

function sharedMixins() {
  const mixins = [];
  if (!fs.existsSync(STYLES)) return mixins;

  for (const name of fs.readdirSync(STYLES).filter((f) => f.endsWith('.scss'))) {
    const text = fs.readFileSync(path.join(STYLES, name), 'utf8');
    for (const m of text.matchAll(/@mixin\s+([\w-]+)[^{]*\{/g)) {
      const decls = declarations(readBlock(text, m.index + m[0].length - 1));
      if (decls.size >= MIN_SHARED) {
        mixins.push({ name: m[1], file: `styles/${name}`, decls });
      }
    }
  }
  return mixins;
}

function changedScss() {
  const tracked = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', BASE, '--', 'src'],
    { encoding: 'utf8' },
  );
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'src'], {
    encoding: 'utf8',
  });
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')])]
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.scss') && !f.includes('src/styles/'));
}

const mixins = sharedMixins();
const findings = [];
let checked = 0;

for (const file of changedScss()) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;

  const text = fs.readFileSync(abs, 'utf8');
  const included = new Set([...text.matchAll(/@include\s+([\w-]+)/g)].map((m) => m[1]));
  checked++;

  for (const m of text.matchAll(/^([.#][\w-][^{\n]*)\{/gm)) {
    const decls = declarations(readBlock(text, m.index + m[0].length - 1));
    if (decls.size < MIN_SHARED) continue;

    for (const mixin of mixins) {
      if (included.has(mixin.name)) continue;

      const shared = [...decls].filter((d) => mixin.decls.has(d));
      if (shared.length >= MIN_SHARED && shared.length / mixin.decls.size >= MIN_RATIO) {
        findings.push({
          file: file.replace(/\\/g, '/'),
          selector: m[1].trim(),
          mixin: mixin.name,
          from: mixin.file,
          shared: shared.length,
          of: mixin.decls.size,
        });
      }
    }
  }
}

const key = (f) => `${f.file}::${f.selector}::${f.mixin}`;

// The ratchet. The first run found 43 blocks, none of them written that day. A check that
// fails on all of the repo's existing debt gets switched off by Friday; this one records
// that debt and fails only on something new.
if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(findings.map(key).sort(), null, 2) + '\n');
  console.log(`check-shared-treatments: baseline recorded (${findings.length} known)`);
  process.exit(0);
}

const known = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : []);
const fresh = findings.filter((f) => !known.has(key(f)));

if (fresh.length) {
  console.error('\ncheck-shared-treatments: a shared treatment written out by hand\n');
  for (const f of fresh) {
    console.error(`  ${f.file}  ${f.selector}`);
    console.error(
      `    repeats ${f.shared} of ${f.of} declarations from @mixin ${f.mixin} (${f.from})`,
    );
  }
  console.error(
    '\nInclude the mixin instead. Each of these exists because one idea had already\n' +
      'drifted into three different-looking copies, and the copies are never a paste —\n' +
      'they are the same small answer written again under a new class name.\n' +
      '\nIf the resemblance is a coincidence, the block and the mixin will diverge as soon\n' +
      'as either changes; say so in a comment and give the block a declaration the mixin\n' +
      'does not have.\n',
  );
  process.exit(1);
}

console.log(
  `check-shared-treatments: ${checked} changed stylesheet(s), no new re-implementation ` +
    `(${known.size} known in tools/baselines/shared-treatments.json)`,
);
