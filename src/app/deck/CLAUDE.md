# deck/ — component standards

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

- `deck-detail.component.ts` is **~3200 lines** and already trips the `max-lines` lint
  warning. Put new logic in a service (`deck-legality.service.ts`, `deck-stats.service.ts`
  are the pattern: pure, memoized by deck identity, independently tested).
- The grid's parts are shared with the collection page and are **not** to be re-cut here:
  section grouping is `services/card-grid-filter.service.ts` (`sections()`, what used to
  be this component's `computeGroups`), the filter bar is `components/card-grid-filters`,
  and the visual/free tiles are `components/card-tile`. The list rows are still local —
  they are a row, not a tile — but they share `.ct-flip`.
- The drag/reorder code finds its targets by class (`.visual-card`, `.free-card`,
  `.list-drag-row`) and by `data-slot-key` / `data-card-id`. Those live on the caller's
  element — which is now `<app-card-tile>`'s host — so keep them there when you touch it.
- Anything that renders AI suggestions, synergy scores or deck advice must match
  `MtgEngine/MtgEngine.Api/Knowledge/commander-doctrine.md` — read it first.
- The deck and collection NgRx stores are **intentionally separate mirrors**. Do not fold
  them behind a generic factory.
