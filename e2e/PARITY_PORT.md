# Compleat parity checks

The feature comparison and test ledger live in the task's parity-audit folder. The original Unity source was inventoried; these checks exercise the new browser/API app.

- npm run verify: lint, formatting, style/state registrations, client tests, changed-file coverage and production build.
- npm run verify:parity-port: disposable account, session-only login, Insights, global ownership, partial transfer/create destination, Undo, copy language, etched details, exports and history at phone/tablet/desktop sizes.
- npm run verify:collection-scale: disposable 201-row collection, three pages, measured fetch payload bounds/no full-detail GET, full-collection filtering, full regex and invalid recovery, offscreen rendering and overflow at the same sizes.
- npm run verify:explore-port: full directory identity/rank queries, daily commander, recents, advanced lists, Insights, browser Back, remembered destination and cross-page add Undo.
- npm run verify:draft-port: private publication draft reload, land/token/emblem readouts and builder-plan reload. AI responses are replayed from the existing recorded fixtures; no paid model request is made.
- node e2e/verify-ui-fixture.js: provisions disposable credentials/deck/collection and runs the full verify:ui harness. Finally deletes the disposable account. Builder state captures use fresh temporary Chrome profiles; they do not delete saved draft keys.

All live checks require the API on https://localhost:7001 and the client preview on port 4200. Wait for the preview's successful bundle before running; source edits during a browser run can trigger reloads and invalidate elements. Production upstream data can be absent; the app keeps unknown figures distinct from zero. Collection reads are paged on the server. Filters, sorting, valuation and all ten Insights cover the full collection; only the requested rows and compact aggregates are downloaded. Full collection regex executes on the server with the original 50 ms per-match timeout, including lookarounds, backreferences and expressions over 200 characters. Invalid expressions match no rows and show a notice; the browser stays responsive. Same-card paging counts oracle groups, whose member printing/language rows can exceed the tile count. Broad server metadata queries still scan the collection.
