# Roomy board — step 2 review

Approved source: docs/table-prototype/README.md and board.dc.html, roomy layout.
Mode: Operate; existing dark tokens, flat color frames, restrained motion, dense game information.

Implemented:
- Shared BoardZonesService supplies four public piles, counts, top cards and modal tabs. Graveyards retain the engine's top-first order; append-ordered exile/command cards display newest first. Library identities remain private.
- Existing zone viewer now has tabs, flat public cards, a count-only library, native modal focus and Escape/backdrop/close behavior. The existing board inspector opens in a second native dialog above it; phone details use the right side sheet.
- Hand is a 64px desktop strip with names, mana and castable rings; Raise hand opens a flat-card tray. Existing click/casting, pointer reorder, Alt+Arrow reorder and card-options-menu are retained. Obsolete hand height/resize logic was removed.
- 667x375 layout uses 62x84 local creatures, 44x58 other permanents plus a land chip, one opponent row, 96px stack (64px collapsed), phone hand bar/tray, and a portrait rotation notice. Focus is used on phone; Table remains available on desktop.

Verification:
- npm run verify exited 0: 1,802 tests, changed-file coverage gate and production build passed. Statement coverage 66.08%.
- 30 desktop/landscape captures plus one portrait capture completed with no failed states.
- Captures exercise zone tabs, library privacy, details above the zone, Escape focus return, hand keyboard/pointer reorder, hand options, enlarged text, 2/3/4 seats, Focus/Table, collapsed stack and overflow.
- Final containment audits: document fits, no offscreen board controls, no cut-off battlefield names, and local panel fits without scrolling in the default/enlarged-text fixtures.
- Independent visual reviewer: no remaining blocking findings after repairing panel overflow and wrapping zone labels.
- Static design checker flagged the 3px top color bands on rounded flat cards; these are explicit approved-prototype requirements.
- Before/after interaction review: hand fan/resize replaced by immediate strip/tray toggle; zone navigation and priority actions stay immediate. No decorative shared motion was added.

Known limits:
- Compact phone zone and life controls remain below 44px, reflecting the approved prototype density; Pass and opponent arrows are 44px. Modal controls meet 44px.
- Commander tax remains unavailable because the game view lacks its count.
- The gate reports 19 advisory lint warnings, defensive nullish-fallback template warnings and the existing card-modal stylesheet budget warning.
- Phone captures are Chrome emulation, not physical iOS verification.
- No commits or API changes.

Evidence: e2e/screenshots/step2-confirm-verify.log, step2-confirm-capture.log, step2-confirm-portrait.log and state-board-roomy-*.png in board-desktop/ and board-landscape/.
