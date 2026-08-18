#!/usr/bin/env node
//
// The phone audit must not get worse.
//
// shoot.js and shoot-states.js have always measured overflow and undersized tap targets;
// they just printed the numbers and exited 0, so reading them was optional and therefore
// skipped. This turns the numbers into a gate.
//
//   node tools/check-ui-audit.js            # compare against e2e/ui-baseline.json
//   node tools/check-ui-audit.js --update   # record the current numbers as the baseline
//
// Against a baseline rather than an absolute floor, because the debt is real: one forum
// list reports 442 undersized targets today. A gate that fails on all of it on day one
// gets switched off by the end of the week. This one only fails when a number you are
// responsible for moves the wrong way, and a surface that has never been measured is not
// silently fine — it has to be added to the baseline deliberately.

const fs = require('fs');
const path = require('path');

const UPDATE = process.argv.includes('--update');
const E2E = path.join(__dirname, '..', 'e2e');
const SHOTS = path.join(E2E, 'screenshots');
const BASELINE = path.join(E2E, 'ui-baseline.json');

function load(name) {
  const file = path.join(SHOTS, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const routes = load('results.json');
const states = load('states.json');

if (!routes && !states) {
  console.error(
    'check-ui-audit: no audit output. Run the captures first, with both servers up:\n' +
      '  cd e2e && node shoot.js && node shoot-states.js\n',
  );
  process.exit(1);
}

/** One comparable row per device x surface, with only the numbers worth ratcheting. */
function measurements() {
  const out = {};

  for (const r of routes ?? []) {
    const audit = r.audit ?? r;
    out[`route:${r.device}:${r.route ?? r.id}`] = {
      overflows: Boolean(audit.overflows ?? audit.overflowsX),
      smallTargets: Number(audit.smallTargets ?? 0),
    };
  }

  for (const s of states ?? []) {
    const extra = s.extra ?? {};
    out[`state:${s.device}:${s.state}`] = {
      overflows: Boolean(s.overflowsX),
      smallTargets: Number(s.smallTargets ?? 0),
      // Names the layout had to cut. Ellipsis is the last resort in the standard, after
      // giving the text the width, so a rise here is a regression even when nothing
      // overflows.
      truncated: Number(extra.truncatedNames ?? 0) + Number(extra.truncatedRefs ?? 0),
    };
  }

  return out;
}

const current = measurements();

if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`check-ui-audit: baseline recorded for ${Object.keys(current).length} surfaces`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(
    'check-ui-audit: no baseline. Record one from a known-good run:\n' +
      '  node tools/check-ui-audit.js --update\n',
  );
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const problems = [];

for (const [key, now] of Object.entries(current)) {
  const was = baseline[key];

  if (!was) {
    problems.push(`${key}: not in the baseline — a surface nobody has agreed a number for`);
    continue;
  }

  if (now.overflows && !was.overflows) {
    problems.push(`${key}: now overflows the viewport (it did not before)`);
  }
  if (now.smallTargets > was.smallTargets) {
    problems.push(`${key}: tap targets under 44px went ${was.smallTargets} -> ${now.smallTargets}`);
  }
  if ((now.truncated ?? 0) > (was.truncated ?? 0)) {
    problems.push(`${key}: names cut off went ${was.truncated ?? 0} -> ${now.truncated}`);
  }
}

for (const key of Object.keys(baseline)) {
  if (!(key in current)) {
    problems.push(`${key}: in the baseline but no longer measured — did a state stop working?`);
  }
}

if (problems.length) {
  console.error('\ncheck-ui-audit: the phone layout got worse\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nFix the layout, or — if the change is deliberate and understood — re-record with\n' +
      '  node tools/check-ui-audit.js --update\n' +
      'and say in the commit message which number moved and why.\n',
  );
  process.exit(1);
}

console.log(`check-ui-audit: ${Object.keys(current).length} surfaces, no regression`);
