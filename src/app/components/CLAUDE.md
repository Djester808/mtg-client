# components/ — shared component standards

**Read `mtg-client/CLAUDE.md` first** — it is the authority and it does *not* auto-load
when the session's working directory is the sibling `MtgEngine` repo. This file exists so
the standards are found from inside this directory too. `MtgEngine/.claude/hooks/require-docs.js`
blocks edits under `mtg-client/src/` until the root doc has been read in-session.

The rules that get broken here most often:

- **OnPush contract** — every path that mutates state ends in `this.cdr.markForCheck()`.
- **Template getters are memoized** on input identity. Anything a template binds runs on
  every change-detection pass; never sort/filter/map unmemoized in a getter.
- **Logic goes in an `@Injectable`, not the component.** Over ~600 lines is a smell.
- **Don't copy-paste — share.** A base class or a service, never a second copy of the
  same vocabulary under different names.

## Specific to this directory

- This is where sharing happens. Before adding a filter chip, a set label, or another
  printing-option mapper, check whether one already exists.
- `card-search-base.ts` is the shared filter vocabulary (colors, types, rarities, cmc,
  set, sort). Extend it rather than re-declaring its fields elsewhere.
- The card grids are assembled from three shared pieces — use them, don't re-cut them:
  - **`card-grid-filters/`** — the whole filter bar (name box + suggestions, facet chips,
    zoom). Takes a `CardFilters` and mutates it in place, emitting `filtersChange` so an
    OnPush page can mark itself. Per-page controls arrive through the `[cgfLeft]` /
    `[cgfRight]` slots; `facets` switches the chip rows on.
  - **`card-tile/`** — a card's art surface: image, flip button, description overlay, with
    `[tileBadges]` / `[tileBottom]` slots. The tile *frame* stays with the caller, which
    is what carries the drag handlers and the violation classes.
  - **`filter-chips/`** — one chip row: colour swatches, rarity badges, or text chips,
    chosen by which field the chip carries. `filter-chip-sets.ts` holds the lists.
- **`services/card-grid-filter.service.ts`** owns the rules those grids apply: what
  matches, how it sorts, how copies of one card fold together, and how a grid cuts into
  labelled sections. Pure and memoized; specs run without a TestBed.
- One class name per thing. `.ct-art`, `.ct-flip` and `.rarity-badge` are defined once
  (the first in `card-tile`'s sheet, the other two at the top level of `global.scss`)
  because more than one component renders them. They replaced `.card-art`/`.visual-art`,
  `.flip-btn`/`.thumb-flip` and a per-panel copy of the badges, each pair of which had
  already drifted apart.
- `select-menu.component.ts` lifts its popup to `<body>` on open: `position: fixed` is
  captured by any ancestor with a `transform` or `backdrop-filter`, which silently threw
  the menu off-screen inside the collection grid. Keep the lift if you touch it.
