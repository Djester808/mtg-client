import { FormControl } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { CardDto, SetSummaryDto } from '../models/game.models';
import { CardFilters } from '../models/card-filters';
import {
  CMC_CHIPS,
  CMC_VALUES,
  SEARCH_CARD_TYPES,
  SEARCH_TYPE_CHIPS,
  SORT_CHIPS,
} from './filter-chips/filter-chip-sets';

export type { RarityCode } from './filter-chips/filter-chip-sets';
import type { RarityCode } from './filter-chips/filter-chip-sets';
export type CmcOption = '0' | '1' | '2' | '3' | '4' | '5' | '6+';
export type SortBy = 'name' | 'cmc';
export type SortDir = 'asc' | 'desc';

/**
 * The shared filter / query / paging surface behind the two card-search screens
 * (HomeComponent and CardSearchPanelComponent). Both templates bind the same controls to
 * these members; the two components previously carried byte-identical copies of all of it,
 * which had already drifted (filteredSets was memoized in one and not the other).
 *
 * Subclasses supply only what genuinely differs: the search-execution pipeline (their
 * ngOnInit), PAGE_SIZE, the display option arrays (colorOptions / rarityOptions), their
 * flip/image helpers, and buildQuery (the panel appends a commander-only token). Kept as a
 * base class rather than a composable so the existing template bindings need no rewrite.
 */
export abstract class CardSearchBase {
  // ---- Search & filter state ----
  searchText = new FormControl('');

  /**
   * One shared vocabulary with the collection grid (models/card-filters.ts). The public
   * names below are unchanged and forward onto it, so this class's subclasses and their
   * templates are untouched — the point is that there is now a single definition of what
   * a colour chip or a sort direction *is*, not two that drift.
   */
  readonly filters = new CardFilters();

  get selectedColors(): Set<string> {
    return this.filters.colors;
  }
  get selectedTypes(): Set<string> {
    return this.filters.types;
  }
  get selectedRarities(): Set<string> {
    return this.filters.rarities;
  }
  get selectedCmc(): CmcOption | null {
    return this.filters.cmc as CmcOption | null;
  }
  set selectedCmc(v: CmcOption | null) {
    this.filters.cmc = v;
  }
  get activeSet(): string | null {
    return this.filters.set;
  }
  set activeSet(v: string | null) {
    this.filters.set = v;
  }
  get sortBy(): SortBy {
    return this.filters.sort as SortBy;
  }
  set sortBy(v: SortBy) {
    this.filters.sort = v;
  }
  get sortDir(): SortDir {
    return this.filters.sortDir;
  }
  set sortDir(v: SortDir) {
    this.filters.sortDir = v;
  }
  matchCase = false;
  matchWord = false;
  useRegex = false;

  // ---- Results state ----
  results: CardDto[] = [];
  loading = false;
  loadingMore = false;
  searched = false;
  hasMore = false;
  flippedIds = new Set<string>();
  protected currentOffset = 0;
  protected lastQuery = '';

  // ---- Set dropdown ----
  allSets: SetSummaryDto[] = [];
  setQuery = '';
  setDropOpen = false;

  // ---- Filter option lists shared verbatim (colorOptions/rarityOptions differ per view) ----
  // Derived from the shared vocabulary rather than re-listed — see filter-chip-sets.ts.
  readonly typeOptions = SEARCH_CARD_TYPES;
  readonly cmcOptions = CMC_VALUES as readonly CmcOption[];

  // The same chip rows the card grids render — see components/filter-chips.
  readonly typeChips = SEARCH_TYPE_CHIPS;
  readonly cmcChips = CMC_CHIPS;
  readonly sortChips = SORT_CHIPS;
  /** Chips that act as buttons rather than toggles never read as active. */
  readonly noneActive: ReadonlySet<string> = new Set<string>();

  get sortDirChips() {
    return [{ code: 'dir', label: this.sortDir === 'asc' ? '▲' : '▼' }];
  }

  /** Single-select facets read as one-entry sets, which is what a chip row expects. */
  get activeCmc(): ReadonlySet<string> {
    return this.filters.activeAsSet(this.filters.cmc);
  }

  get activeSort(): ReadonlySet<string> {
    return this.filters.activeAsSet(this.filters.sort);
  }

  // A new filter emits here; the subclass pipeline re-runs the search. BehaviorSubject so
  // the pipeline fires an initial load on subscribe.
  protected filterChange$ = new BehaviorSubject<void>(undefined);
  protected loadMore$ = new Subject<void>();

  // Memoized: read on every change-detection pass while the dropdown is open, but the
  // filtered list only changes with the sets or the query.
  private filteredSetsMemo: { sets: SetSummaryDto[]; q: string; value: SetSummaryDto[] } | null =
    null;

  get filteredSets(): SetSummaryDto[] {
    const q = this.setQuery.trim().toLowerCase();
    const m = this.filteredSetsMemo;
    if (m && m.sets === this.allSets && m.q === q) return m.value;
    const value = !q
      ? this.allSets
      : this.allSets.filter(
          (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
        );
    this.filteredSetsMemo = { sets: this.allSets, q, value };
    return value;
  }

  get activeSetName(): string {
    return (
      this.allSets.find((s) => s.code.toLowerCase() === this.activeSet?.toLowerCase())?.name ?? ''
    );
  }

  get hasFilters(): boolean {
    return (
      this.selectedColors.size > 0 ||
      this.selectedTypes.size > 0 ||
      this.selectedRarities.size > 0 ||
      this.selectedCmc !== null ||
      this.activeSet !== null ||
      this.sortBy !== 'name' ||
      this.sortDir !== 'asc'
    );
  }

  // ---- Filter toggles ----

  toggleColor(code: string): void {
    this.selectedColors.has(code)
      ? this.selectedColors.delete(code)
      : this.selectedColors.add(code);
    this.filterChange$.next();
  }

  toggleType(type: string): void {
    this.selectedTypes.has(type) ? this.selectedTypes.delete(type) : this.selectedTypes.add(type);
    this.filterChange$.next();
  }

  toggleRarity(code: RarityCode): void {
    this.selectedRarities.has(code)
      ? this.selectedRarities.delete(code)
      : this.selectedRarities.add(code);
    this.filterChange$.next();
  }

  toggleCmc(opt: CmcOption): void {
    this.selectedCmc = this.selectedCmc === opt ? null : opt;
    this.filterChange$.next();
  }

  selectSet(code: string): void {
    this.activeSet = this.activeSet === code ? null : code;
    this.filterChange$.next();
  }

  openSetDrop(): void {
    this.setQuery = '';
    this.setDropOpen = true;
  }

  selectSetFromDrop(code: string): void {
    this.activeSet = this.activeSet === code ? null : code;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  clearSet(): void {
    this.activeSet = null;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  setSortBy(field: SortBy): void {
    this.sortBy = field;
    this.filterChange$.next();
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.filterChange$.next();
  }

  toggleMatchCase(): void {
    this.matchCase = !this.matchCase;
    this.filterChange$.next();
  }
  toggleMatchWord(): void {
    this.matchWord = !this.matchWord;
    this.filterChange$.next();
  }
  toggleUseRegex(): void {
    this.useRegex = !this.useRegex;
    this.filterChange$.next();
  }

  clearFilters(): void {
    this.selectedColors.clear();
    this.selectedTypes.clear();
    this.selectedRarities.clear();
    this.selectedCmc = null;
    this.activeSet = null;
    this.setDropOpen = false;
    this.sortBy = 'name';
    this.sortDir = 'asc';
    this.matchCase = false;
    this.matchWord = false;
    this.useRegex = false;
    this.searchText.setValue('', { emitEvent: false });
    this.results = [];
    this.searched = false;
    this.flippedIds.clear();
    this.filterChange$.next();
  }

  loadMore(): void {
    this.loadMore$.next();
  }

  /** The filter half of the Scryfall-style query, shared verbatim. buildQuery (which adds
   *  the set token, and on the panel a commander token) stays in each subclass. */
  protected buildNonSetQuery(text: string): string {
    const parts: string[] = [];
    if (text.trim().length >= 2) parts.push(`(name:"${text.trim()}" or o:"${text.trim()}")`);

    if (this.selectedColors.size > 0) {
      const codes = [...this.selectedColors];
      if (codes.includes('M')) parts.push('c:m');
      else if (codes.includes('C')) parts.push('c:c');
      else parts.push(`c:${codes.join('').toLowerCase()}`);
    }

    if (this.selectedTypes.size > 0) {
      const t = [...this.selectedTypes].map((x) => x.toLowerCase());
      parts.push(t.length === 1 ? `t:${t[0]}` : `(${t.map((x) => `t:${x}`).join(' or ')})`);
    }

    if (this.selectedRarities.size > 0) {
      const r = [...this.selectedRarities];
      parts.push(r.length === 1 ? `r:${r[0]}` : `(${r.map((x) => `r:${x}`).join(' or ')})`);
    }

    if (this.selectedCmc !== null) {
      if (this.selectedCmc === '6+') parts.push('cmc>=6');
      else parts.push(`cmc=${this.selectedCmc}`);
    }

    return parts.join(' ');
  }
}
