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

## Don't copy-paste — share via a base class or service

- Two components ~90% identical? Extract the shared state/behaviour into an
  abstract base (`components/card-search-base.ts` backs both `HomeComponent` and
  `CardSearchPanelComponent`) or a service, keeping only the genuine differences
  in each. Two near-identical methods in one class → one parameterized helper
  with hooks for the differences (see `startCardReorderDrag` in deck-detail).

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

`ng lint` must pass (**errors fail the build** — do not leave new `any`, unused
vars, or negated-async in shipped code; `*.spec.ts` may relax `any`). `ng build
--configuration production` and the unit suite must be green. If you changed
drag/reorder or search behaviour, run the e2e characterization scripts — they
exist to catch exactly that kind of silent regression.
