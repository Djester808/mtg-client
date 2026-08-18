#!/usr/bin/env node
//
// Builds a self-contained contact sheet from screenshots/results.json.
//
//   node sheet.js            # -> screenshots/mobile-audit.html
//
// Every image is inlined as a data URI so the page survives being moved, mailed, or
// published somewhere with a strict CSP. Desktop shots are the audit's control and are
// deliberately left out of the sheet — only the phone profiles are embedded, which keeps
// the file to roughly a third of what the full set would cost.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots');
const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'results.json'), 'utf8'));

// Interaction states from shoot-states.js. Optional: the sheet still builds from route
// captures alone if that has never been run.
let states = [];
try {
  states = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'states.json'), 'utf8'));
} catch {
  states = [];
}

// Authenticated deck panels and view modes from shoot-deck-states.js. Folded into the
// same states section: they are the same kind of thing (a layout behind a toggle), and
// splitting them would just make two sections that read identically.
try {
  const deckStates = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'deck-states.json'), 'utf8'));
  states = states.concat(
    deckStates
      .filter((d) => d.file)
      .map((d) => ({ ...d, smallTargets: d.cramped ?? 0, overflowsX: (d.offscreen || []).length > 0 })),
  );
} catch {
  /* deck states are optional */
}

// Step-by-step flows from shoot-flow.js. Also optional.
let flows = [];
try {
  flows = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'flows.json'), 'utf8'));
} catch {
  flows = [];
}

const PHONES = ['iphone-se', 'pixel-8'];
const BASELINE = 'iphone-se'; // narrowest profile = worst case, so findings key off it

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Embeds a capture, preferring a sibling .jpg when one exists.
 *
 * The full sheet of PNGs comes to ~17 MB, which is over the 16 MB ceiling for publishing
 * it anywhere — and a sheet nobody can send is a sheet nobody reads. `compress.js` writes
 * a .jpg next to each .png; when it has been run the page is a couple of megabytes and
 * otherwise nothing changes, so the PNGs stay the source of truth for pixdiff.
 */
const dataUri = (file) => {
  const png = path.join(OUT_DIR, file);
  const jpg = png.replace(/\.png$/i, '.jpg');

  if (fs.existsSync(jpg)) {
    return 'data:image/jpeg;base64,' + fs.readFileSync(jpg).toString('base64');
  }
  return 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
};

// ---- Shape the data -----------------------------------------------------------------

const routeIds = [...new Set(results.map((r) => r.route))];
const routes = routeIds
  .map((id) => {
    const shots = PHONES.map((d) => results.find((r) => r.device === d && r.route === id)).filter(
      (r) => r && !r.error && r.file,
    );
    if (!shots.length) return null;
    const base = results.find((r) => r.device === BASELINE && r.route === id) || shots[0];
    return { id, label: base.routeLabel || id, shots, base };
  })
  .filter(Boolean);

const totalClipped = routes.reduce((n, r) => n + (r.base.causes || []).length, 0);
const worstReach = routes.reduce(
  (m, r) => Math.max(m, ...(r.base.causes || []).map((c) => c.right - r.base.vw), 0),
  0,
);

// Elements clipped on every single route are structural — app chrome, not page content.
const perRouteSels = routes.map((r) => new Set((r.base.causes || []).map((c) => c.sel)));
const universal = [...(perRouteSels[0] || [])].filter((s) => perRouteSels.every((set) => set.has(s)));

// ---- Reach bar ----------------------------------------------------------------------
//
// Magnitude against a hard reference line: the bar is the element's own width in place,
// and the screen edge is drawn across it. The overflow segment carries its own "+Npx"
// label so the reading never depends on the colour alone.
function reachBar(cause, vw) {
  const span = Math.max(cause.right, vw);
  const pctEdge = (vw / span) * 100;
  const left = Math.max(0, cause.left);
  const pctLeft = (left / span) * 100;
  const pctWidth = ((cause.right - left) / span) * 100;
  const over = cause.right - vw;
  const offLeft = cause.left < 0 ? Math.abs(cause.left) : 0;

  return `
    <div class="finding">
      <div class="finding-head">
        <code>${esc(cause.sel)}</code>
        <span class="over">+${over}px</span>
      </div>
      <div class="track" role="img"
           aria-label="${esc(cause.sel)} spans ${cause.left} to ${cause.right} pixels; the screen ends at ${vw}">
        <div class="fill" style="left:${pctLeft.toFixed(2)}%;width:${pctWidth.toFixed(2)}%"></div>
        <div class="fill over-seg" style="left:${pctEdge.toFixed(2)}%;width:${(100 - pctEdge).toFixed(2)}%"></div>
        <div class="edge${pctEdge > 55 ? ' flip' : ''}" style="left:${pctEdge.toFixed(2)}%"><span>screen edge ${vw}px</span></div>
      </div>
      <p class="note">
        Runs to <strong>${cause.right}px</strong>${offLeft ? ` and starts <strong>${offLeft}px</strong> off the left` : ''} —
        <strong>${over}px</strong> past the edge, with no way to scroll to it.
      </p>
    </div>`;
}

// ---- Page ---------------------------------------------------------------------------

// ---- Flows --------------------------------------------------------------------------
//
// A route is a screen; a flow is whether the screens connect. These are captured in
// order from an empty account, so a step that could not be reached is recorded as a
// blocked step rather than quietly omitted.
const flowIds = [...new Set(flows.map((f) => f.flow))];
const flowBlocks = flowIds
  .map((id) => {
    const steps = flows
      .filter((f) => f.flow === id && f.device === BASELINE)
      .sort((a, b) => a.order - b.order);
    if (!steps.length) return '';
    const label = steps[0].flowLabel || id;
    const frames = steps
      .map((st) => {
        const bad = (st.offscreen || []).length;
        const status = st.error
          ? `<span class="chip bad">blocked</span>`
          : bad
            ? `<span class="chip bad">${bad} off-screen</span>`
            : `<span class="chip ok">ok</span>`;
        const shot = st.file
          ? `<div class="bezel" style="width:${st.vw}px"><img src="${dataUri(st.file)}" width="${st.vw}" alt="${esc(st.label)}" /></div>`
          : `<div class="bezel missing" style="width:${st.vw}px"><p>not reached</p></div>`;
        return `
          <figure class="step">
            ${shot}
            <figcaption>
              <span class="step-n">${String(st.order).padStart(2, '0')}</span>
              <span class="step-label">${esc(st.label)}</span>
              ${status}
              ${st.error ? `<span class="step-err">${esc(st.error)}</span>` : ''}
              ${
                !st.error && bad
                  ? `<span class="step-err">${esc((st.offscreen || []).map((o) => o.sel).join(', '))}</span>`
                  : ''
              }
            </figcaption>
          </figure>`;
      })
      .join('');
    return `
      <section class="flow">
        <h2 class="flow-head">${esc(label)} — every step, on an iPhone SE</h2>
        <div class="filmstrip">${frames}</div>
      </section>`;
  })
  .join('');

// ---- Interaction states -------------------------------------------------------------
//
// These are the layouts a route capture never reaches: a modal that is only mounted once
// you open it, a list that only exists in one of two view modes. They are the states the
// route screenshots above cannot show, so they get their own section rather than being
// mixed into the per-route blocks.
const stateIds = [...new Set(states.filter((s) => s.file).map((s) => s.state))];
const stateGroups = stateIds
  .map((id) => {
    // Baseline device only. Embedding both phones for every state pushed the page past
    // the 16MB artifact cap, and the second device rarely tells a different story at
    // this granularity — the routes section still carries both.
    const shots = [states.find((s) => s.device === BASELINE && s.state === id)].filter(
      (s) => s && s.file,
    );
    if (!shots.length) return null;
    return { id, label: shots[0].label || id, shots };
  })
  .filter(Boolean);

const stateBlocks = stateGroups.length
  ? `<section class="states">
      <h2 class="states-head">States you only reach by opening them</h2>
      <p class="states-intro">
        A route screenshot catches the first paint and nothing else. The card modal is not in
        the DOM until you tap a card; the forum list exists in two view modes that persist
        across visits. Each one below was driven open and then measured.
      </p>
      ${stateGroups
        .map((g) => {
          const frames = g.shots
            .map(
              (s) => `
              <figure class="device">
                <div class="bezel" style="width:${s.vw}px">
                  <img src="${dataUri(s.file)}" width="${s.vw}" alt="${esc(g.label)} on ${esc(s.deviceLabel)}" />
                </div>
                <figcaption>${esc(s.deviceLabel)} <span>${s.box ? esc(s.box.w + '×' + s.box.h) : ''}</span></figcaption>
              </figure>`,
            )
            .join('');
          const s0 = g.shots[0];
          const bad = s0.overflowsX || s0.overflowsY;
          return `
            <div class="route" id="state-${esc(g.id)}">
              <header class="route-head">
                <h2>${esc(g.label)}</h2>
                <p class="tally">
                  <span class="chip ${bad ? 'bad' : 'ok'}">${
                    bad ? 'runs off screen' : 'fits the screen'
                  }</span>
                  <span class="chip warn">${s0.smallTargets} targets under 44px</span>
                </p>
              </header>
              <div class="frames">${frames}</div>
            </div>`;
        })
        .join('')}
    </section>`
  : '';

const routeBlocks = routes
  .map((r) => {
    const frames = r.shots
      .map(
        (s) => `
        <figure class="device">
          <div class="bezel" style="width:${s.vw}px">
            <img src="${dataUri(s.file)}" width="${s.vw}" alt="${esc(s.routeLabel)} on ${esc(s.deviceLabel)}" />
          </div>
          <figcaption>${esc(s.deviceLabel)} <span>${esc(s.viewport)}</span></figcaption>
        </figure>`,
      )
      .join('');

    const causes = r.base.causes || [];
    const findings = causes.length
      ? causes.map((c) => reachBar(c, r.base.vw)).join('')
      : `<p class="clean">Nothing runs past the screen edge on this route.</p>`;

    return `
      <section class="route" id="${esc(r.id)}">
        <header class="route-head">
          <h2>${esc(r.label)}</h2>
          <p class="path">${esc(r.base.url || '/' + r.id)}</p>
          <p class="tally">
            <span class="chip ${causes.length ? 'bad' : 'ok'}">${causes.length} clipped</span>
            <span class="chip warn">${r.base.smallTargets} targets under 44px</span>
          </p>
        </header>
        <div class="route-body">
          <div class="frames">${frames}</div>
          <div class="findings">
            <h3>Off-screen at ${r.base.vw}px</h3>
            ${findings}
          </div>
        </div>
      </section>`;
  })
  .join('');

const html = `<title>Phone Layout Audit</title>
<style>
  /* One deliberate visual world: this is a report wrapped around screenshots of a
     near-black app, so it wears that app's own tokens — gold on void, parchment ink.
     A light frame would fight every image on the page. Single theme on purpose, with
     the ground and every colour painted explicitly so it holds on any host. */
  :root {
    --void:#0b0b0c; --surface:#141416; --raised:#1c1c20; --sunken:#0e0e0f;
    --hairline:rgba(255,255,255,.08); --hairline-lit:rgba(255,255,255,.16);
    --gold:#c9a84c; --gold-dim:#8a6f2e;
    --ink:#f0e8d8; --ink-muted:#a9a091; --ink-faint:#736c60;
    --bad:#e2574c; --warn:#d3a03f; --ok:#4f9d69;
    --display:Georgia,'Iowan Old Style','Times New Roman',serif;
    --body:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:ui-monospace,'Cascadia Code',Consolas,'Liberation Mono',monospace;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--void); color:var(--ink);
    font-family:var(--body); font-size:15px; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  /* Wide enough to stand both phones at their true pixel width side by side (375 + 412
     + gap) with the findings column still beside them — comparing the two viewports is
     the whole point, and at 1140 the frames wrapped under each other. */
  .wrap { max-width:1320px; margin:0 auto; padding:56px 24px 96px; }

  /* Masthead */
  .masthead { border-bottom:1px solid var(--hairline); padding-bottom:32px; margin-bottom:12px; }
  .eyebrow {
    font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--gold); margin:0 0 14px;
  }
  h1 {
    font-family:var(--display); font-weight:600; font-size:clamp(30px,5vw,46px);
    line-height:1.1; letter-spacing:-.01em; margin:0 0 14px; text-wrap:balance;
  }
  .standfirst { font-size:17px; color:var(--ink-muted); max-width:64ch; margin:0; }

  /* Stat row */
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px;
           background:var(--hairline); border:1px solid var(--hairline);
           border-radius:10px; overflow:hidden; margin:36px 0 40px; }
  .stat { background:var(--surface); padding:18px 20px; }
  .stat .n { font-family:var(--display); font-size:34px; line-height:1; color:var(--gold);
             font-variant-numeric:tabular-nums; }
  .stat .k { font-family:var(--mono); font-size:10.5px; letter-spacing:.14em;
             text-transform:uppercase; color:var(--ink-faint); margin-top:8px; }

  /* Callout */
  .callout { background:var(--sunken); border:1px solid var(--hairline);
             border-left:2px solid var(--gold-dim); border-radius:0 8px 8px 0;
             padding:20px 22px; margin:0 0 40px; }
  .callout.resolved { border-left-color:var(--ok); }
  .callout h2 { font-family:var(--display); font-size:17px; margin:0 0 8px; font-weight:600; }
  .callout p { margin:0 0 10px; color:var(--ink-muted); font-size:14.5px; max-width:70ch; }
  .callout p:last-child { margin-bottom:0; }
  .callout strong { color:var(--ink); font-weight:600; }

  /* Structural summary */
  .structural { margin:0 0 52px; }
  .structural h2 { font-family:var(--display); font-size:20px; margin:0 0 6px; font-weight:600; }
  .structural > p { color:var(--ink-muted); margin:0 0 18px; max-width:70ch; font-size:14.5px; }
  .structural ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
  .structural li { background:var(--surface); border:1px solid var(--hairline); border-radius:8px;
                   padding:12px 16px; font-family:var(--mono); font-size:12.5px; color:var(--ink); }

  /* Flows */
  .flow { margin:0 0 44px; }
  .flow-head { font-family:var(--display); font-size:22px; font-weight:600; margin:0 0 16px; }
  .filmstrip { display:flex; gap:18px; overflow-x:auto; padding-bottom:14px; }
  .step { margin:0; flex:0 0 auto; display:flex; flex-direction:column; gap:10px; }
  .step .bezel.missing { height:300px; display:flex; align-items:center; justify-content:center;
                         border-style:dashed; color:var(--ink-faint); }
  .step figcaption { display:flex; flex-direction:column; gap:6px; align-items:flex-start;
                     max-width:375px; }
  .step-n { font-family:var(--mono); font-size:10px; color:var(--gold); letter-spacing:.1em; }
  .step-label { font-size:13px; color:var(--ink); }
  .step-err { font-family:var(--mono); font-size:10.5px; color:var(--bad); word-break:break-all; }

  /* Interaction states */
  .states { margin:0 0 8px; }
  .states-head { font-family:var(--display); font-size:22px; font-weight:600; margin:0 0 6px; }
  .states-intro { color:var(--ink-muted); margin:0 0 8px; max-width:70ch; font-size:14.5px; }

  /* Route blocks */
  .route { border-top:1px solid var(--hairline); padding-top:36px; margin-top:44px; }
  .route-head h2 { font-family:var(--display); font-size:25px; font-weight:600; margin:0 0 4px; }
  .path { font-family:var(--mono); font-size:12px; color:var(--ink-faint); margin:0 0 12px; }
  .tally { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 26px; }
  .chip { font-family:var(--mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase;
          padding:5px 10px; border-radius:999px; border:1px solid var(--hairline-lit); }
  .chip.bad  { color:var(--bad);  border-color:color-mix(in srgb,var(--bad) 45%,transparent); }
  .chip.warn { color:var(--warn); border-color:color-mix(in srgb,var(--warn) 40%,transparent); }
  .chip.ok   { color:var(--ok);   border-color:color-mix(in srgb,var(--ok) 45%,transparent); }

  .route-body { display:grid; grid-template-columns:auto minmax(320px,1fr); gap:36px; align-items:start; }
  @media (max-width:900px) { .route-body { grid-template-columns:1fr; } }

  .frames { display:flex; gap:20px; flex-wrap:wrap; }
  .device { margin:0; }
  .bezel { background:#000; border:1px solid var(--hairline-lit); border-radius:16px;
           padding:6px; overflow:hidden; box-shadow:0 18px 44px rgba(0,0,0,.6); }
  .bezel img { display:block; border-radius:11px; max-width:100%; height:auto; }
  figcaption { font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase;
               color:var(--ink-muted); margin-top:10px; text-align:center; }
  figcaption span { color:var(--ink-faint); }

  /* Findings */
  .findings h3 { font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase;
                 color:var(--ink-faint); margin:0 0 16px; font-weight:400; }
  .finding { margin-bottom:26px; }
  .finding-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:9px; }
  .finding-head code { font-family:var(--mono); font-size:12.5px; color:var(--ink);
                       word-break:break-all; line-height:1.45; }
  .over { font-family:var(--mono); font-size:12.5px; color:var(--bad);
          font-variant-numeric:tabular-nums; white-space:nowrap; }

  .track { position:relative; height:22px; background:var(--sunken);
           border:1px solid var(--hairline); border-radius:5px; overflow:hidden; }
  .fill { position:absolute; top:0; bottom:0; background:var(--gold-dim); border-radius:3px; }
  /* 2px surface gap so the in-view and overflow segments never bleed together */
  .over-seg { background:var(--bad); box-shadow:-2px 0 0 0 var(--sunken); }
  .edge { position:absolute; top:0; bottom:0; width:2px; background:var(--ink); }
  .edge span { position:absolute; left:6px; top:50%; transform:translateY(-50%);
               font-family:var(--mono); font-size:9.5px; letter-spacing:.06em;
               color:var(--ink); white-space:nowrap; text-shadow:0 0 6px var(--sunken),0 0 3px var(--sunken); }
  /* Once the edge sits in the right-hand half there is no room left for the caption, and
     the track clips it mid-word. Hang it off the other side of the line instead. */
  .edge.flip span { left:auto; right:6px; }
  .note { margin:8px 0 0; font-size:13px; color:var(--ink-muted); }
  .note strong { color:var(--ink); font-variant-numeric:tabular-nums; font-weight:600; }
  .clean { color:var(--ok); font-size:14px; margin:0; }

  footer { border-top:1px solid var(--hairline); margin-top:56px; padding-top:22px;
           font-size:13px; color:var(--ink-faint); }
  @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">MTG Engine · captured from localhost:4200</p>
    <h1>What the app looks like on a phone</h1>
    <p class="standfirst">
      Chrome mobile emulation across ${PHONES.length} phone profiles and ${routes.length} public routes.
      Every screenshot below is the real client at its real viewport width — not a mockup.
    </p>
  </header>

  <div class="stats">
    <div class="stat"><div class="n">${routes.length}</div><div class="k">Routes captured</div></div>
    <div class="stat"><div class="n">${totalClipped}</div><div class="k">Elements off-screen</div></div>
    <div class="stat"><div class="n">${worstReach}px</div><div class="k">Worst overshoot</div></div>
    <div class="stat"><div class="n">0</div><div class="k">Responsive breakpoints</div></div>
  </div>

  <div class="callout">
    <h2>Two things to know before reading these</h2>
    <p>
      <strong>The iPhone frames are indicative, not exact.</strong> Chrome emulation sets the viewport,
      DPR and touch flags but still renders in Blink. It will not reproduce Safari's behaviour for
      <code>100vh</code> under the collapsing address bar, <code>env(safe-area-inset-*)</code>, focus
      auto-zoom, or <code>backdrop-filter</code> cost — and the navbar uses a 12px backdrop blur.
      The Pixel frames <em>are</em> essentially exact, since Android Chrome is the same engine.
      Ground truth for iOS needs a real device.
    </p>
    <p>
      <strong>A plain overflow check cannot score this app.</strong> The shell is a 100vh column with
      <code>overflow:hidden</code>, so content past the right edge never becomes scrollable — it is
      <em>clipped and unreachable</em>, and <code>document.scrollWidth</code> reads clean on a page
      whose navbar is half off-screen. Every count below is measured against the viewport directly,
      and discounts anything a thumb can still scroll to.
    </p>
  </div>

  ${
    totalClipped === 0
      ? `<div class="callout resolved">
    <h2>Every route below is clear</h2>
    <p>
      The navbar collapses to a drawer under 900px, so the four destinations and the sign-in
      actions are reachable instead of rendering past the edge of the glass. Home's type filters
      wrap, and the community tab strip scrolls sideways rather than clipping its third tab.
      <strong>Nothing on these seven routes is stranded off-screen at 375px.</strong>
    </p>
    <p>
      Still open: collection and deck detail are behind the auth guard and are not in this run,
      and the sub-44px tap-target counts are untouched.
    </p>
  </div>`
      : ''
  }

  ${
    universal.length
      ? `<section class="structural">
    <h2>Broken on every single route</h2>
    <p>
      These sit in the app shell rather than in any one page, so they fail identically everywhere.
      On a logged-out phone this means <strong>Decks and Community cannot be reached and there is no
      way to sign in</strong> — the controls render, they are just past the edge of the glass.
    </p>
    <ul>${universal.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </section>`
      : ''
  }

  ${flowBlocks}

  ${stateBlocks}

  ${routeBlocks}

  <footer>
    Generated by <code>e2e/shoot.js</code> + <code>e2e/sheet.js</code>.
    Collection and deck detail — the two-pane screens — are behind the auth guard and are not in this
    run; they need <code>E2E_USERNAME</code> / <code>E2E_PASSWORD</code> in <code>e2e/.env</code>.
  </footer>
</div>
`;

const out = path.join(OUT_DIR, 'mobile-audit.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
