# Roomy board cleanup and validation

The approved roomy board is the game route. Removed the unused original lobby and player sidebar, disconnected Play API/hub services, obsolete layout service, and old board capture/diagnostic scripts. Removed the intermediate spacing/preferences helpers, unwired drag handlers, unused compact-card mode, and old hand/board CSS. Board styling now has one stylesheet.

The approved prototype remains in docs/table-prototype as design reference. The card renderer remains because the inspector uses it when artwork is missing.

Validation on 2026-10-22:
- npm run verify: 1,751 unit tests passed; coverage gate and production build passed.
- Current browser regression: 4 tests passed (multiplayer Focus/Table, containment, library privacy and modal focus return, hand/phase controls).
- 30 desktop/landscape captures and 1 portrait capture passed.
- Default desktop 1280x800 and landscape 667x375 captures: zero changed pixels compared with approved step 2 before cleanup.
- Independent visual review of desktop/landscape board and zone dialog: no blockers.
- Existing advisory lint warnings and card-modal stylesheet budget warning remain.

Live/environment limits:
- Dedicated local test accounts could register, import decks, create a table and both bring decks. POST /api/games/lobbies/{id}/start returned HTTP 500, so live board synchronization could not be tested. Trace ID: 00-e7951f506ae91ce14ae29f99bb5306f5-ef9f8e04a2db8eb4-00.
- e2e/verify-roomy-live.js preserves the reproducible smoke test. It uses local test accounts; no real players are invited.
- verify-same.js stopped at login (redirect timeout). This does not establish shared-page pixel parity.
- No API source changes. Phone captures use Chrome emulation.

Evidence (local, ignored): e2e/screenshots/cleanup-final-verify.log, cleanup-e2e.log, cleanup-capture.log, cleanup-portrait.log, cleanup-live.log, cleanup-shared.log.
