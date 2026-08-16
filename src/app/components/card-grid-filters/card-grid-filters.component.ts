import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardFilters, SortBy } from '../../models/card-filters';
import { FilterChip, FilterChipsComponent } from '../filter-chips/filter-chips.component';
import { AvailableFacets } from '../../services/card-grid-filter.service';
import {
  COLOR_CHIPS,
  TYPE_CHIPS,
  CMC_CHIPS,
  RARITY_CHIPS,
  SORT_CHIPS,
  CLEAR_CHIPS,
} from '../filter-chips/filter-chip-sets';
import { SelectMenuComponent, SelectMenuOption } from '../select-menu/select-menu.component';

/**
 * The filter bar above a card grid: a name box with suggestions, the facet chips, and a
 * zoom stepper, with slots for whatever else the page keeps up there.
 *
 * The collection grid and the deck grid had a bar each — same name box, same suggestion
 * menu, same zoom stepper, same labelled-column chrome under two sets of class names
 * (`cbar-*` and `fbar-*`) that had already drifted apart in font size and spacing. This
 * is the one bar; the per-page controls arrive by projection, not by a copy of the
 * layout:
 *
 *   [cgfLeft]  — collection: the cover picker · deck: Group By and Layout
 *   [cgfRight] — collection: select / group / display · deck: the density pickers
 *
 * `filters` is the caller's own `CardFilters`, mutated in place. That is deliberate: the
 * page holds the filter state, this bar is only its controls, and `filtersChange` fires
 * after every mutation so an OnPush page can mark itself.
 */
@Component({
  selector: 'app-card-grid-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterChipsComponent, SelectMenuComponent],
  templateUrl: './card-grid-filters.component.html',
  styleUrls: ['./card-grid-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardGridFiltersComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) filters!: CardFilters;

  /** Card names offered under the box. Already narrowed by the caller. */
  @Input() suggestions: string[] = [];
  @Input() placeholder = 'Filter cards…';

  /**
   * Colour / type / CMC chips, the Set picker and the sort chips. A grid that only
   * filters by name (the deck) leaves this off and gets the bare bar.
   */
  @Input() @HostBinding('class.is-faceted') facets = false;

  /** Set picker options; omit for a grid with no set filter. */
  @Input() setOptions: SelectMenuOption[] | null = null;

  /**
   * The Name / CMC sort chips. Off for a grid that orders itself another way — the deck
   * grid's Group By already decides its order, and two controls claiming to sort the same
   * cards is worse than one.
   */
  @Input() sortControls = true;

  /** The deck's free-arrange mode has no filterable grid, so it hides the box. */
  @Input() showQuery = true;

  /**
   * Which facet values the page's cards actually contain, from
   * `CardGridFilterService.facetsPresent`. Chips outside this are dropped, so a mono-red
   * collection does not offer five colours it has none of.
   *
   * Null leaves every chip on — a page that cannot say what it holds gets the full set
   * rather than an empty bar.
   */
  @Input() available: AvailableFacets | null = null;

  @Input() zoomLabel = '';
  @Input() canZoomIn = true;
  @Input() canZoomOut = true;

  /** Any mutation of `filters` — the page re-reads its grid and marks for check. */
  @Output() filtersChange = new EventEmitter<void>();
  /** A suggestion was chosen; the query is already set to it. */
  @Output() suggestionPicked = new EventEmitter<string>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();

  private readonly allColorChips = COLOR_CHIPS;
  private readonly allTypeChips = TYPE_CHIPS;
  private readonly allCmcChips = CMC_CHIPS;
  private readonly allRarityChips = RARITY_CHIPS;
  readonly sortChips = SORT_CHIPS;
  readonly clearChips = CLEAR_CHIPS;
  /** Chips that act as buttons rather than toggles never read as active. */
  readonly none: ReadonlySet<string> = new Set<string>();

  suggOpen = false;

  /**
   * The controls menu, which CSS shows only while the bar is too narrow to lay them out
   * on the line. Kept here rather than in each page because the bar owns the layout that
   * decides whether the menu exists at all.
   */
  menuOpen = false;

  /**
   * The width at which the stylesheet stops using the menu and lays the controls out on
   * the bar. Kept in step with the `@container` query in the stylesheet by hand — there
   * is no way to read a container query back from script.
   */
  private static readonly WIDE_AT = 1180;

  private resize?: ResizeObserver;

  constructor(
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {}

  /**
   * Once the bar is wide enough, CSS lays the controls out inline and hides the button
   * that opens the menu — so an open menu would have nothing left to close it, and it
   * stayed open through the resize and after it. Closing it here on the way past the
   * breakpoint is the only place that can see that happen: the bar's width changes
   * without the window's whenever the search panel opens beside it.
   */
  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.resize = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (this.menuOpen && width >= CardGridFiltersComponent.WIDE_AT) {
          this.zone.run(() => {
            this.menuOpen = false;
            this.cdr.markForCheck();
          });
        }
      });
      this.resize.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(e.target as Node)) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  // ---- Chip rows, narrowed to what the page actually holds ------------
  //
  // Memoized on the availability object plus the live selection: these bind in the
  // template, so rebuilding the arrays every change-detection pass would hand
  // app-filter-chips a new `chips` identity each time and re-render every row.

  private chipMemo = new Map<string, { key: string; value: FilterChip[] }>();

  /**
   * Chips present in the cards, plus any the user has already switched on. Keeping an
   * active chip is what stops a filter becoming impossible to undo: narrow a collection
   * until nothing red is left and the red pip would otherwise vanish while still filtering.
   */
  private offered(
    name: string,
    chips: readonly FilterChip[],
    present: ReadonlySet<string> | undefined,
    active: ReadonlySet<string>,
  ): FilterChip[] {
    if (!present) return chips as FilterChip[];
    const key = `${[...present].sort().join(',')}|${[...active].sort().join(',')}`;
    const m = this.chipMemo.get(name);
    if (m && m.key === key) return m.value;
    const value = chips.filter((c) => present.has(c.code) || active.has(c.code));
    this.chipMemo.set(name, { key, value });
    return value;
  }

  get colorChips(): FilterChip[] {
    return this.offered('color', this.allColorChips, this.available?.colors, this.filters.colors);
  }

  get typeChips(): FilterChip[] {
    return this.offered('type', this.allTypeChips, this.available?.types, this.filters.types);
  }

  get rarityChips(): FilterChip[] {
    return this.offered(
      'rarity',
      this.allRarityChips,
      this.available?.rarities,
      this.filters.rarities,
    );
  }

  get cmcChips(): FilterChip[] {
    return this.offered('cmc', this.allCmcChips, this.available?.cmc, this.activeCmc);
  }

  /** A row with nothing left to offer is a caption over an empty space. */
  get hasAnyFacetChips(): boolean {
    return (
      this.colorChips.length > 0 ||
      this.typeChips.length > 0 ||
      this.rarityChips.length > 0 ||
      this.cmcChips.length > 0
    );
  }

  get sortDirChips() {
    return [{ code: 'dir', label: this.filters.sortDir === 'asc' ? '▲' : '▼' }];
  }

  /** Single-select facets read as one-entry sets, which is what a chip row expects. */
  get activeSort(): ReadonlySet<string> {
    return this.filters.activeAsSet(this.filters.sort);
  }

  get activeCmc(): ReadonlySet<string> {
    return this.filters.activeAsSet(this.filters.cmc);
  }

  onQuery(value: string): void {
    this.filters.query = value;
    this.suggOpen = true;
    this.changed();
  }

  onSet(code: string): void {
    this.filters.selectSet(code === '__all' ? null : code);
    this.changed();
  }

  onSort(field: SortBy): void {
    this.filters.setSort(field);
    this.changed();
  }

  onSortDir(): void {
    this.filters.toggleSortDir();
    this.changed();
  }

  onToggleColor(code: string): void {
    this.filters.toggleColor(code);
    this.changed();
  }

  onToggleType(type: string): void {
    this.filters.toggleType(type);
    this.changed();
  }

  onToggleRarity(rarity: string): void {
    this.filters.toggleRarity(rarity);
    this.changed();
  }

  onToggleCmc(value: string): void {
    this.filters.toggleCmc(value);
    this.changed();
  }

  onClear(): void {
    this.filters.clear();
    this.changed();
  }

  pick(name: string): void {
    this.filters.query = name;
    this.suggOpen = false;
    this.changed();
    this.suggestionPicked.emit(name);
  }

  /** Enter takes the top suggestion, the way the deck's box always has. */
  pickFirst(): void {
    if (this.suggOpen && this.suggestions.length > 0 && this.filters.query.trim()) {
      this.pick(this.suggestions[0]);
    }
  }

  /** Delayed so a mousedown on a suggestion wins the race against the input's blur. */
  closeSuggSoon(): void {
    setTimeout(() => {
      this.suggOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  private changed(): void {
    this.cdr.markForCheck();
    this.filtersChange.emit();
  }
}
