#!/usr/bin/env node
//
// A screen you changed must be registered in the capture harness.
//
// CLAUDE.md says the e2e harness is the evidence for any claim about a phone layout, and
// the whole knowledge base — three list modes, two detail panes and a full-screen sheet
// that opens over card text — shipped without a single entry in shoot-states.js. The
// phone audit therefore ran, found what it found before, and reported no change. Nothing
// was broken and nothing was hidden; there was simply nothing registered to look at, and
// the feature was "verified" by one-off scripts that guard nothing after the day they
// were written.
//
//   node tools/check-ui-states.js [--base HEAD]
//   node tools/check-ui-states.js --update    # re-record the known gaps
//
// A component counts as registered when the harness mentions its selector or one of the
// class names its own stylesheet defines.

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

const ROOT = path.join(__dirname, '..');
const E2E = path.join(ROOT, 'e2e');
const ALLOW = path.join(E2E, 'ui-coverage-allow.json');
const BASELINE = path.join(__dirname, 'baselines', 'ui-states.json');

function changedComponents() {
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
    .filter((f) => f.endsWith('.component.ts') && !f.endsWith('.spec.ts'));
}

/** Everything the harness could plausibly name a surface by. */
function handlesFor(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return null;

  const source = fs.readFileSync(abs, 'utf8');
  const selector = /selector:\s*['"]([^'"]+)['"]/.exec(source)?.[1];

  const handles = new Set();
  if (selector) handles.add(selector);

  // Class names the component's own stylesheet defines. A state's `root` is usually one
  // of these ('.kws-panel', '.kb-sidebar'), which is what makes this checkable at all.
  const scss = abs.replace(/\.ts$/, '.scss');
  if (fs.existsSync(scss)) {
    for (const m of fs.readFileSync(scss, 'utf8').matchAll(/^\.([a-z][\w-]*)/gm)) {
      handles.add('.' + m[1]);
    }
  }

  return { selector, handles: [...handles] };
}

/**
 * The *standing* harness only.
 *
 * Underscore-prefixed scripts are one-offs — a diagnosis, a reproduction, a capture taken
 * to answer one question. They are worth keeping and they are not coverage: they run when
 * someone remembers them, which is never. Counting them would let this gate be satisfied
 * by exactly the habit it exists to stop, and on its first test it was — renaming the
 * keyword sheet's root out of shoot-states.js left the check green, because a throwaway
 * _verify-kb-rework.js still mentioned it.
 */
function harnessText() {
  return fs
    .readdirSync(E2E, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map((e) => fs.readFileSync(path.join(E2E, e.name), 'utf8'))
    .join('\n');
}

const allow = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) : {};
const harness = harnessText();
const missing = [];
let checked = 0;

for (const file of changedComponents()) {
  const norm = file.replace(/\\/g, '/');
  if (allow[norm]) continue;

  const info = handlesFor(file);
  if (!info || !info.handles.length) continue;

  checked++;
  if (!info.handles.some((h) => harness.includes(h))) {
    missing.push({ file: norm, handles: info.handles.slice(0, 6) });
  }
}

// The ratchet. This repo carries real debt, and a check that fails on all of it the first
// time someone edits an unrelated file is a check that gets deleted. The baseline is that
// debt written down — not approval, just the list of what was already true. Only something
// new fails a build.
if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(missing.map((m) => m.file).sort(), null, 2) + '\n');
  console.log(`check-ui-states: baseline recorded (${missing.length} known gap(s))`);
  process.exit(0);
}

const known = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : []);
const fresh = missing.filter((m) => !known.has(m.file));

if (fresh.length) {
  console.error('\ncheck-ui-states: changed screens the phone audit cannot see\n');
  for (const m of fresh) {
    console.error(`  ${m.file}`);
    console.error(`    nothing in e2e/ mentions ${m.handles.join(', ')}`);
  }
  console.error(
    '\nRegister it in e2e/shoot-states.js (an opened state: a panel, sheet, modal or\n' +
      'tab) or e2e/shoot.js (a route), so the audit measures it on every run instead of\n' +
      'once, by hand, on the day you wrote it.\n' +
      '\nIf it genuinely is not a surface — chrome already captured on every route, or a\n' +
      'component with no layout of its own — add it to e2e/ui-coverage-allow.json with a\n' +
      'reason. A gate people route around is worse than no gate, so the escape hatch is\n' +
      'deliberate; it just has to be written down.\n',
  );
  process.exit(1);
}

console.log(
  `check-ui-states: ${checked} changed screen(s) checked, none unregistered ` +
    `(${known.size} known gap(s) in tools/baselines/ui-states.json)`,
);
