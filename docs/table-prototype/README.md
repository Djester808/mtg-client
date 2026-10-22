# Table prototype — the approved game board (2026-10-22)

John approved this board for 2 to 4 players on 2026-10-22. It replaces the Codex MTGO-style
table on `codex/multiplayer-table-implementation`. These files are a local copy of the design
canvas, so you need no claude.ai sign-in to read them.

## Files

| file | what it is |
|---|---|
| `board.dc.html` | **The source of truth.** The whole board in one file: the markup (top), the CSS (the `<helmet><style>` block), the card data and the layout logic (the `<script type="text/x-dc">` block at the bottom). |
| `boards/Roomy-*.dc.html` | The three approved views. Each one mounts the board (`name="Main"` = `board.dc.html`) with `layout="roomy"` and its seat count and device. |
| `boards/canvas.json` | Where each view sat on the canvas, and their titles. |
| `run-layout.js` | Runs the board's layout logic in Node: `node run-layout.js`. It prints the rows, zones and card sizes for each setup, and opens a zone and hides the stack to show those work. |
| `research/arena.md` | What MTG Arena's own code shows about its board, its piles and its unreleased 4-player mode. |
| `research/mtgo-and-tabletop.md` | Web research on MTGO, Forge, XMage, Cockatrice, Untap, SpellTable and Tabletop Simulator, with a source URL for each fact. |

## How to read `board.dc.html`

- The file is a Design Component. It only renders inside the claude.ai canvas, so do not try
  to serve it. Read it as a specification.
- **Markup:** `{{name}}` is a value that `renderVals()` returns. `<sc-for list=… as=…>` repeats
  its content; `<sc-if value=…>` shows its content only when the value is true.
  `onClick="{{fn}}"` calls a function that `renderVals()` returns.
- **Data:** `DB` holds the card facts (rules text is a short paraphrase). `ME`, `OPPS` and
  `HAND` are the sample game. `ZONE_CARDS` holds each player's graveyard and exile.
- **Layout logic:** these methods of `Component` are what the app needs, as a pure
  service:
  - `renderVals()` holds every size. `roomy` is the approved layout; the `compact` values were
    the first version and were rejected as cramped.
  - `rowsFor` puts the permanents into rows by type.
  - `fillRow` fills a row and pages the overflow behind "+N more".
  - `cardView` draws one permanent: a counted pile, tapped turned sideways, attacking marked.
  - `landTile` and `landChip` draw the lands.
  - `zoneButtons` makes the 4 zone piles.
  - `zoneModal` builds the open zone.
  - The opponent's card size comes from the height that is left: see `oppH` and `avail`.
- **Sizes:** desktop is judged at 1280 × 800. The phone is judged in landscape at 667 × 375.

## What the approved board does

- **Your side:** a player panel with life (− and +), poison, commander tax, the 4 zone piles and
  commander damage taken. The board has three rows: creatures (about 104 × 144), other
  permanents, then a thin strip of land piles. Identical permanents collapse into one pile with
  a ×N count. A row that does not fit pages behind "+N more".
- **Opponents:**
  - 2 players: the opponent's board fills the top, centred.
  - 3–4 players, Focus: a turn-order rail with ‹ ›, and the selected opponent's board below it,
    filling the space.
  - 3–4 players, Table: all opponents side by side.
- **Zones:** every player has 4 separate piles: Library, Graveyard, Exile and Command. Each pile
  opens a centred modal with a tab for each of that player's zones, and the cards face up,
  newest first. The library shows only its count.
- **Stack:** a right column that you can hide. When it is hidden, a narrow tab with the count and
  the Pass button stays.
- **Hand:** a strip of card tops. "Raise hand" shows the full cards.
- **Not decided yet:** card art (the cards are flat frames for now) and phone portrait.
