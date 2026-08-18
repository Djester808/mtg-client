#!/usr/bin/env node
//
// Every .ts file this branch adds or changes must be exercised by a test.
//
// A repo-wide coverage threshold cannot enforce that. This one sits near 54% statements,
// so any floor it passes today it also passes with a brand-new file at 0% — which is
// exactly what happened: a directive and a service shipped with no spec between them while
// 901 tests stayed green and every gate stayed quiet.
//
// So the threshold is per-file and scoped to the diff. Untested legacy is left alone; the
// line only ratchets forward, on the files you actually touched.
//
//   node tools/check-new-coverage.js [--min 60] [--base HEAD]
//
// Reads coverage/mtg-client/coverage-summary.json, so run the suite with --code-coverage
// first (npm run verify does).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const MIN = Number(opt('min', 60));
const BASE = opt('base', 'HEAD');

const SUMMARY = path.join(__dirname, '..', 'coverage', 'mtg-client', 'coverage-summary.json');
if (!fs.existsSync(SUMMARY)) {
  console.error(
    'check-new-coverage: no coverage summary. Run the suite with --code-coverage first.',
  );
  process.exit(1);
}

/**
 * Files worth holding to this. Specs test other things; models, barrels and environment
 * files are declarations, and demanding a spec for a type alias teaches people to write
 * empty ones.
 */
const EXEMPT = /\.spec\.ts$|\.d\.ts$|environments[\\/]|[\\/]index\.ts$|models[\\/]|\.module\.ts$/;

function changedTsFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', BASE, '--', 'src'],
    {
      encoding: 'utf8',
    },
  );
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'src'], {
    encoding: 'utf8',
  });
  return [...out.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.ts') && !EXEMPT.test(f));
}

const summary = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
// Istanbul keys are absolute; match on the tail so platform separators do not matter.
const byTail = new Map(
  Object.entries(summary)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => [k.replace(/\\/g, '/'), v]),
);

/**
 * Two tiers, because one floor applied to both is unfair in one direction and useless in
 * the other:
 *
 *  - A NEW file meets the floor. Nothing legacy is at stake and there is no excuse: the
 *    code and its test are being written in the same sitting.
 *  - A MODIFIED file only has to be exercised by *something*. Demanding 60% of a
 *    2,700-line component because you corrected two lines in it turns the gate into
 *    something people route around, and a gate that gets routed around is worse than none.
 *    The line still moves: touch a file nothing tests and you write the first test for it.
 */
const failures = [];
const checked = [];
const newFiles = new Set(
  execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'src'], { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean),
);

for (const file of changedTsFiles()) {
  const wanted = file.replace(/\\/g, '/');
  const hit = [...byTail].find(([k]) => k.endsWith(wanted));
  const isNew = newFiles.has(file);

  if (!hit) {
    // Never loaded by the suite at all — the strongest form of "no test touches this".
    failures.push(`${file}  — not exercised by any test`);
    continue;
  }
  const pct = hit[1].statements.pct;
  checked.push(`${file} ${pct}%${isNew ? ' (new)' : ''}`);
  if (isNew && pct < MIN) {
    failures.push(`${file}  — new file at ${pct}% of statements, needs ${MIN}%`);
  }
}

if (!checked.length && !failures.length) {
  console.log('check-new-coverage: no changed source files to check');
  process.exit(0);
}

if (failures.length) {
  console.error(`\ncheck-new-coverage: changed files below ${MIN}% statement coverage\n`);
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nAdd a test that fails without your change — write it, break the code, watch it go\n' +
      'red, then put the code back. A test that passes either way guards nothing.\n',
  );
  process.exit(1);
}

console.log(`check-new-coverage: ${checked.length} changed file(s) at or above ${MIN}%`);
