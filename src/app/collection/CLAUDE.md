# collection/ — component standards

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

- `collection-detail.component.ts` is still **over 1100 lines**. What is left is wiring —
  store dispatches, modal state, move/select flows. The filtering, sorting and same-card
  grouping moved to `services/card-grid-filter.service.ts`, the filter bar to
  `components/card-grid-filters`, and the tile to `components/card-tile`. Keep going that
  way: extract before adding to it, do not append.
- Filter state is one `CardFilters` (`models/card-filters.ts`), the same object the
  search panel and the deck grid hold. Don't add a parallel field for a facet — add it to
  `CardFilters` and to the filter service's `matches`, and remember `stateKey` gates the
  memo (a facet missing from it silently never re-filters).
- The domain contract lives in `MtgEngine/CARD_COLLECTION_FEATURE.md` — read it before
  touching DTO shapes, quantities, boards, or price fields.
- A collection row with `scryfallId === null` means "owned, printing unspecified". Code
  that resolves a row by printing must handle it; assuming a pinned printing has caused
  two separate ownership bugs.
