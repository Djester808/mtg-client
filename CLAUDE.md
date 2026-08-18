# mtg-client — engineering standards

Angular 17 (standalone components, NgRx) client for the MTG deck builder. The API
lives in the sibling `MtgEngine` repo. These rules keep new code from
re-introducing the debt we deliberately cleaned up. When a rule below and the
surrounding code disagree, the rule wins — fix the code, don't copy it.

## Build / run gotchas (read first)

- Dev server `http://localhost:4200` (`ng serve`), API `https://localhost:7001`.
- Unit tests: `ng test --watch=false --browsers=ChromeHeadless` (701+ specs).
- **Stale Karma/node processes** cause "Found 1 load error" / port 9876 conflicts.
  Kill node processes older than ~2 min under this repo before re-running.
- The e2e/characterization scripts run through Selenium with
  `NODE_PATH=c:/Users/John/Documents/Projects/mtg-client/e2e/node_modules`.

## Mobile is the baseline, not a pass at the end

Every surface in this app is expected to work on a phone, and it is headed for a packaged
build (PWA/Capacitor). "We'll do mobile later" is not a plan, it is a second build of the
same screen. **Design the narrow layout first and let it grow.** A 375 × 667 iPhone SE is
the floor every screen is judged against.

This covers the **whole gamut** — new pages, panels, modals, filter bars, menus, tables,
drag interactions, empty and error states. A feature that works at 1440px is not done.

### The rules

- **Use the vocabulary, never a raw media query.** `styles/_breakpoints.scss`:
  `$bp-phone: 640px`, `$bp-nav: 900px`, `$bp-wide: 1200px`, `$tap-min: 44px`, and
  `@include upto() / from() / touch`.
- **Include the shared treatments; do not re-implement them.** Each of these exists
  because one idea had already drifted into three different-looking copies:
  - `styles/_filter-bar.scss` — top row, collapse pill, active dot, panel, chip grid,
    segmented control
  - `styles/_detail-page.scss` — detail header, back button, and the drawer
    header/title/close that every side panel wears
  - `app-filter-facets` — the facet arrangement (colours + rarities, types, CMC)
  - `filter-chips.component.scss` — chip geometry, the single authority
  - `app-search-input` — the search field
  - `ScrollEdgesDirective` — `can-scroll-left/right` on anything that pans
- **Nothing may overflow the document.** `document.scrollWidth === innerWidth` at 375px.
  A layout wider than the screen is a defect even when it scrolls.
- **Derived layouts reflow; authored layouts pan.** A grid the app computed (visual view's
  CMC columns) reflows to fit — panning it is the wrong idiom, nothing about it is the
  user's. A layout the user arranged and saved (free view) keeps its geometry and pans,
  with a faded edge so it reads as more board rather than a clipped one.
- **Fill the width.** A container that stops short of the edge reads as broken. Watch for
  a column layout's `max-width` cap surviving into its stacked variant, and prefer
  `repeat(auto-fit, minmax(<size>, 1fr))` over fixed widths + wrap.
- **Text that will not fit shrinks, then pans.** Ellipsis is the last resort — "Kodama of
  the…" on every row is not a list. Give the text the width first (move the badge, drop
  the caption), then a smaller size, then a horizontal pan.
- **A caption whose control already says the word goes** (Format, Tags).
- **Side panels are full-screen sheets below `$bp-phone`**, inset under the navbar so nav
  stays reachable, and raised over the page header — a sheet's own `z-index` is spent
  inside its parent's stacking context, so raise the parent (`.detail-body:has(> .is-open)`).
- **Tap targets ≥ `$tap-min`** for anything primary. Density exceptions are deliberate and
  counted by the audit, never accidental.
- **Touch, not hover.** Anything reachable only through `:hover` does not exist in the
  app. Pointer events over mouse events — the deck's drag was mousedown-based and dead on
  touch.

### Verify with captures, not with reasoning

`mtg-client/e2e` drives Chrome mobile emulation and is the evidence for any claim about a
phone layout. Measure the element (`getBoundingClientRect`), then look at the picture.

| script | what it gives |
|---|---|
| `shoot.js` | every route × device, plus the overflow audit |
| `shoot-states.js` | modals, filter panels, tab states |
| `shoot-deck-states.js` | each deck view and each drawer |
| `shoot-flow.js` | the deck/collection build flows, step by step |
| `verify-same.js` | pixel-diffs the shared filter block across all four hosts — stays at 0 |
| `sheet.js` | builds the contact sheet from all of the above |
| `compare-desktop.js` | captures a page at 1280 from whichever port you point it at |
| `pixdiff.js` | pixel-diffs two captures, with the rows the difference is in |
| `crop.js` | trims a tall element capture so it can actually be looked at |

**Narrow-first is not narrow-only.** A phone rule that escapes its media query is a desktop
regression, and this repo has shipped several: a filter block pinned to 302px at every
width, a card grid stacked on a 1258px bar. Before claiming a responsive change is done,
diff the desktop against the last commit — `git worktree add ../mtg-client-head HEAD
--detach`, serve it on another port, then `compare-desktop.js` both and `pixdiff.js` the
pair. Zero differing pixels is the bar, and it is reachable.

Chrome emulation is exact for Android and indicative for iPhone: `100dvh`, safe-area
insets, focus auto-zoom and `backdrop-filter` still need a real device before the packaged
build ships.

### Traps this codebase has already paid for

- **No backticks inside the template literal of a component's `styles` array** — one in a CSS comment
  terminates the string, the build fails, and the dev server keeps serving its last good
  bundle, so the app looks unchanged and nothing on screen says why. If an edit "does
  nothing", read the dev server log before theorising.
- A component's inner elements are unreachable from a host stylesheet (view
  encapsulation). Let the component take a size from its host rather than reaching in.
- `min-width` beats `max-width` — a fixed `min-width` ignores `max-width: 96vw`.
- `container-type: size` collapses a stacked child to 0 × 0.
- A `flex: 1` spacer keeps `order: 0`, so it lands first when the row wraps.
- Content projected through `ng-content` keeps the *projecting* page's encapsulation, so
  the receiving component's scoped styles never reach it.

## Knowledge docs — they live in the API repo, read them there

This file loads automatically every session; the API's knowledge docs do not, and they
are **not duplicated here on purpose** — a second copy drifts and the two halves start
disagreeing. Open the original in the sibling `MtgEngine` repo:

- **`MtgEngine/MtgEngine.Api/Knowledge/commander-doctrine.md`** — the deck-building
  standard every AI pass reasons from. Read it before building or changing any UI that
  displays AI suggestions, synergy scores, or deck advice, so the wording on screen
  matches the doctrine the scores came from.
- **`MtgEngine/CARD_COLLECTION_FEATURE.md`** — collection/deck domain, the DTO shapes
  this client binds to (including `prices`, `priceUsdAtAdd`, and the price-history
  endpoint). Read before changing collection, deck, or price components.
- **`MtgEngine/CLAUDE.md`** — the API's standards, for any cross-repo change.

When a change spans both repos, read the API doc first: the DTO contract is defined
there and mirrored here.

## Which rules here are enforced, and which are on you

The API repo's standards put it exactly right: *an instruction the assistant is asked to
follow is not a control.* This file was read in full, in-session, on the day every rule in
the right-hand column below was broken — three copies of one breakpoint, a second copy of a
scroll-edge listener, six mixins that were never included, and new behaviour with no test.
Everything with a gate held. Everything without one was deferred and then forgotten,
sometimes in the same message that named it.

So: **two commands.** The second needs the app running, which is the only reason it is not
the first.

```bash
npm run verify        # format:check · lint · dead styles · shared treatments · audit
                      # coverage · unit suite · production build
npm run verify:ui     # with 4200 + 7001 up: phone captures, contact sheet, audit ratchet
```

| Rule | What actually stops you |
|---|---|
| Formatting | `prettier/prettier` as a lint **error** |
| No `any`, no unused vars, no negated-async | eslint errors |
| Breakpoints stay in `shared/breakpoints.service.ts` | `no-restricted-syntax` on width `matchMedia` — see below |
| A shared mixin has a caller | `tools/check-dead-styles.js` |
| A shared mixin is **included, not rewritten by hand** | `tools/check-shared-treatments.js` |
| A screen you changed is **registered in the capture harness** | `tools/check-ui-states.js` |
| Overflow, tap targets and cut-off names do not get worse | `tools/check-ui-audit.js` (in `verify:ui`) |
| A **new** file is tested; a **changed** file is tested by *something* | `tools/check-new-coverage.js` |
| Components ≤ 500 lines, complexity ≤ 20 | eslint **warnings** — advisory, and `deck-detail` has been over for a long time |
| Phone layout stays identical across the four hosts | `e2e/verify-same.js` (in `verify:ui`) |
| Desktop does not regress | `compare-desktop.js` + `pixdiff.js` against a HEAD worktree |
| **No duplicated logic** | *nothing* — you |
| **Delete unused TypeScript and templates** | *nothing*; the mixin check covers shared SCSS only |

The middle three are new, and they exist because the rules above them were followed and the
rules beside them were not. A whole knowledge base — three list modes, two detail panes, a
full-screen sheet over card text — shipped with zero entries in `shoot-states.js`, so the
phone audit ran and truthfully reported no change. In the same change a centred empty state
and a loading state were written out by hand next to the `empty-state` and `loading-state`
mixins that already existed. Every gate stayed green throughout.

All three ratchet rather than judge. The repo's debt is recorded in `tools/baselines/`
(43 hand-written treatments, 2 unregistered screens) and in `e2e/ui-baseline.json` (42
surfaces, one of which reports 442 undersized tap targets). That is not approval — it is
what was already true, written down, so that only something *new* fails a build. Pay a
line down and re-record with `--update`.

One thing `check-ui-states` deliberately does not accept: an underscore-prefixed script.
`_verify-*.js` and `_diag-*.js` are one-offs — worth keeping, and not coverage, because
they run when someone remembers them. Counting them would let the gate be satisfied by the
exact habit it exists to stop, and on its first test it was.

Note what the coverage gate deliberately does **not** do: it will not demand 60% of a
2,700-line component because you corrected two lines in it. A gate people route around is
worse than no gate. New files meet the floor; changed files only have to be exercised by
something, which still means touching an untested file earns it its first test.

The two rows at the bottom are the ones to be deliberate about, because nothing will tell
you. On duplication in particular, do not expect a tool to help: what shipped twice here
was not a paste but a re-implementation — `el.scrollLeft > 1` in one file and
`el.scrollLeft > 2` in another, different names, different write mechanism, three lines of
overlap. No copy-paste detector sees that.

Two habits that would have caught all of this session's misses:

- **When you write "worth folding in next time" in a report, do it now instead.** That
  sentence was written about the duplicate scroll-edge listener and the copy survived
  another eight commits' worth of work.
- **Before adding a shared vocabulary, count the callers you have today.** Ten mixins were
  written for bars that never arrived; four were used. Write the two you need.

## Change detection — OnPush is the default, and it has a contract

- Components use `ChangeDetectionStrategy.OnPush`. **Every path that mutates
  component state must end in `this.cdr.markForCheck()`** — subscriptions, event
  handlers, timers, pointer callbacks. A view that "doesn't update" is almost
  always a missing `markForCheck()`.
- Pointer/drag listeners registered on `window`/`document` should run outside
  Angular where they fire at rAF frequency, and call `markForCheck()` only when
  state actually changes.

## Template-called getters must be memoized

- Anything a template binds (`getGroups()`, `filteredCards()`, `getDeckStats()`)
  runs on **every** change-detection pass. If it computes, **memoize on the input
  identity** (cache `{deck, board, query, result}` and return `result` when the
  inputs are `===`). Never do sorting/filtering/mapping unmemoized in a getter.

## Logic belongs in services, not components

- Pure/business logic goes in an `@Injectable` service, not the component. See
  `deck/deck-legality.service.ts` and `deck/deck-stats.service.ts` — both are
  pure, memoized by deck identity, and unit-tested independently. Components
  delegate to them.
- **A component over ~600 lines is a smell.** Extract the pure logic to a service
  before adding to it.

## Breakpoints live in one place

- Widths belong to `styles/_breakpoints.scss`. Anything responsive that a stylesheet can
  express, a stylesheet expresses.
- The handful of decisions CSS genuinely cannot make — which of two *parents* a node
  renders under, which array a component is handed, whether a piece of state still means
  anything at this width — read `BreakpointsService` (`shared/breakpoints.service.ts`),
  whose two signals mirror `$bp-phone` and `$bp-nav`. **`window.matchMedia` anywhere else
  is a lint error.**
- Take it by injection rather than reading it statically: that is what lets a spec drive
  the width instead of inheriting whatever the Karma window happens to be.

## Don't copy-paste — share via a base class or service

- Two components ~90% identical? Extract the shared state/behaviour into an
  abstract base (`components/card-search-base.ts` backs both `HomeComponent` and
  `CardSearchPanelComponent`) or a service, keeping only the genuine differences
  in each. Two near-identical methods in one class → one parameterized helper
  with hooks for the differences (see `startCardReorderDrag` in deck-detail).
- **The second copy is the one to catch, not the third.** Nothing here detects
  duplication, and it does not arrive as an obvious paste: it arrives as the same small
  answer written in three files across three days, each one looking local. Two behaviours
  reached three copies that way — a breakpoint query and a scroll-edge listener — and both
  became `BreakpointsService` and `ScrollEdgesDirective` only after someone went looking.
  Before writing "watch this element and toggle a class", grep for the class name.

## NgRx

- Actions via `createActionGroup`; effects are typed and use the right flattening
  operator on purpose (`concatMap` for ordered writes, `switchMap` for
  latest-wins reads, `mergeMap` only when order truly doesn't matter).
- **Optimistic updates reconcile with a pending counter**, not a boolean: bump a
  per-id counter on dispatch, decrement on success, treat the server value as
  authoritative only when the counter hits 0 (see `deck.reducer` /
  `collection.reducer` `pendingCardUpdates`). This survives overlapping edits.
- Refresh effects that could clobber a newer active selection are guarded with
  `withLatestFrom` + `filter` on the active id.
- The deck and collection stores are **intentionally separate mirrors** — their
  reconcile logic and action sets diverge. Do not fold them behind a generic
  factory; the divergence is real and hiding it costs more than the duplication.

## Server communication

- SSE consumers normalize line endings (`/\r\n?/g` → `\n`), flush the trailing
  frame, and dispatch `AuthActions.logout()` on 401. See
  `services/deck-api.service.ts`.

## Before you commit

```bash
npm run verify
```

That is format:check, `ng lint`, the dead-style check, the unit suite and a production
build, in one command so there is nothing to half-remember. Lint **errors** fail it — no
new `any`, unused vars, negated-async or inline `matchMedia`; `*.spec.ts` relaxes `any`.

Then, for what the command cannot see:

- Changed drag/reorder or search behaviour → run the e2e characterization scripts.
- Changed anything responsive → `e2e/verify-same.js`, and diff desktop against a HEAD
  worktree (see the harness table above). A phone rule that escapes its media query is a
  desktop regression and this repo has shipped several.
- Added behaviour → **add a test that fails without your change.** Write it, break the
  code, watch it go red, put the code back. A test that passes both ways is a test of
  nothing, and the suite stays green either way so nothing else will tell you.
- Deleted a caller → grep for what it used. `check-dead-styles.js` covers shared SCSS;
  unused TypeScript and templates are on you.
