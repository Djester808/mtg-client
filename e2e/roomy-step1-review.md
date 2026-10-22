# Roomy board — step 1 review

Source: docs/table-prototype/README.md and board.dc.html, layout=roomy.
Step 1 includes local three-row battlefield, player panel, opponent Focus/Table/two-seat views, counted piles and overflow list, and stack collapse with priority controls.

Validation: npm run verify passed (1,801 tests; changed-file coverage gate; production build). 18 advisory lint warnings and existing card-modal stylesheet budget warning remain.
Capture command: HEADLESS=true node e2e/shoot-states.js --devices=board-desktop,board-landscape --only=board-roomy --dpr=1.
All 14 captures completed. Desktop audits report no cut-off names, offscreen board controls, or undersized primary board targets. The generic audit still includes small legacy hand controls, which belong to step 2.
Final independent visual read found no step 1 blockers. Long Table-view names now use prototype font sizing; land tiles omit redundant subtype. The static design check's top-band warning is an explicit prototype requirement; its image warning is an Angular [src] binding.

Components: BattlefieldArrangement owns memoized pure sizing/grouping/row filling; ZonesComponent renders flat tiles and the counted/overflow list; TableSeatComponent owns player controls; GameBoardComponent owns opponent focus and stack visibility. Use existing global tokens.

Limitations: commander tax is unavailable because the player DTO has no cast count. Phone landscape is captured as an unfinished baseline, with vertical overflow and undersized zone controls. Zone piles/modal redesign, hand strip/tray, phone layout and portrait notice are step 2 and await user review. No API changes or commits.
