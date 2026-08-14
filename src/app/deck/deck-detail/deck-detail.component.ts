import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  NgZone,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  StatsChartComponent,
  ChartEntry,
} from '../../components/stats-chart/stats-chart.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, switchMap, takeUntil, of, catchError, map, filter, take } from 'rxjs';
import { AppState } from '../../store';
import { DeckActions } from '../../store/deck/deck.actions';
import { selectActiveDeck, selectDeckLoading } from '../../store/deck/deck.selectors';
import {
  CollectionCardDto,
  PrintingDto,
  CardType,
  ManaColor,
  CardDto,
} from '../../models/game.models';
import { DeckDetailDto, DeckApiService } from '../../services/deck-api.service';
import { PrintingsService } from '../../services/printings.service';
import { PreferencesApiService } from '../../services/preferences-api.service';
import {
  buildTypeLine,
  colorIdentityViolations as identityViolations,
} from '../../utils/card.utils';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { flyCardGhost, FlightSource } from '../../shared/fly-card';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CardSearchPanelComponent } from '../../components/card-search-panel/card-search-panel.component';
import { CardSideListComponent } from '../../components/card-side-list/card-side-list.component';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';
import { DeckSuggestionsPanelComponent } from '../../components/deck-suggestions-panel/deck-suggestions-panel.component';
import { ManaSuggestPanelComponent } from '../../components/mana-suggest-panel/mana-suggest-panel.component';
import {
  SelectMenuComponent,
  SelectMenuOption,
} from '../../components/select-menu/select-menu.component';
import { ForumActions } from '../../store/forum/forum.actions';
import { selectForumPublishLoading } from '../../store/forum/forum.selectors';

export type SortMode =
  | 'cmc'
  | 'name'
  | 'type'
  | 'subtype'
  | 'color'
  | 'color-identity'
  | 'rarity'
  | 'artist'
  | 'set'
  | 'creature-split';
export type ViewMode = 'list' | 'visual' | 'free';

export interface FreeColumn {
  id: string;
  label: string;
  cardIds: string[];
  width?: number;
}

/** Shape guard for layouts read back from localStorage. */
function isFreeColumns(v: unknown): v is FreeColumn[] {
  return (
    Array.isArray(v) &&
    v.every(
      (col): boolean =>
        !!col &&
        typeof col === 'object' &&
        typeof (col as FreeColumn).id === 'string' &&
        typeof (col as FreeColumn).label === 'string' &&
        Array.isArray((col as FreeColumn).cardIds) &&
        (col as FreeColumn).cardIds.every((id) => typeof id === 'string'),
    )
  );
}

export interface CmcGroup {
  label: string;
  key: string;
  cards: CollectionCardDto[];
  totalCount: number;
}

export interface DeckStats {
  total: number;
  lands: number;
  creatures: number;
  instants: number;
  sorceries: number;
  enchantments: number;
  artifacts: number;
  planeswalkers: number;
  other: number;
  avgCmc: number;
  curve: { cmc: number; count: number; label: string }[];
  curveMax: number;
  manaPips: { color: string; count: number }[];
  manaProduction: { color: string; count: number }[];
  creatureSubtypes: { name: string; count: number }[];
  landSubtypes: { name: string; count: number; deckCard: CollectionCardDto | null }[];
  tokensNeeded: { tokenName: string; description: string; creatorCard: CollectionCardDto }[];
  emblemSources: {
    name: string;
    imageUri: string | null;
    manaCost: string;
    sourceCard: CollectionCardDto;
  }[];
}

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ManaCostComponent,
    CardModalComponent,
    CardSearchPanelComponent,
    CardSideListComponent,
    CoverPickerModalComponent,
    DeckSuggestionsPanelComponent,
    ManaSuggestPanelComponent,
    StatsChartComponent,
    SelectMenuComponent,
    OracleSymbolsPipe,
  ],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetailComponent implements OnInit, OnDestroy {
  deck$: Observable<DeckDetailDto | null>;
  loading$: Observable<boolean>;
  commanderCardDetails$: Observable<CardDto | null>;

  filterQuery = '';
  filterCardNames: string[] = [];
  filterSuggOpen = false;
  sortMode: SortMode = 'cmc';

  readonly sortModeOptions: SelectMenuOption[] = [
    { value: 'cmc', label: 'CMC' },
    { value: 'type', label: 'Type' },
    { value: 'creature-split', label: 'Creature / Non-Creature' },
    { value: 'name', label: 'Name' },
    { value: 'subtype', label: 'Subtype' },
    { value: 'color', label: 'Color' },
    { value: 'color-identity', label: 'Color Identity' },
    { value: 'rarity', label: 'Rarity' },
    { value: 'artist', label: 'Artist' },
    { value: 'set', label: 'Set' },
  ];

  /** Card-name suggestions for the filter box, narrowed by the current query. */
  get filterSuggestions(): string[] {
    const q = this.filterQuery.trim().toLowerCase();
    const pool = q
      ? this.filterCardNames.filter((n) => n.toLowerCase().includes(q))
      : this.filterCardNames;
    return pool.slice(0, 8);
  }

  selectFilterSuggestion(name: string): void {
    this.filterQuery = name;
    this.filterSuggOpen = false;
    this.cdr.markForCheck();
  }

  pickFirstFilterSuggestion(): void {
    if (this.filterSuggOpen && this.filterSuggestions.length > 0 && this.filterQuery.trim()) {
      this.selectFilterSuggestion(this.filterSuggestions[0]);
    } else {
      this.filterSuggOpen = false;
    }
  }

  /** Delayed so a mousedown on a suggestion wins the race against the input's blur. */
  closeFilterSuggSoon(): void {
    setTimeout(() => {
      this.filterSuggOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  // ---- Tag input suggestions -----------------------------------

  tagSuggOpen = false;

  tagSuggestions(deck: DeckDetailDto): string[] {
    const q = this.tagDraft.trim().toLowerCase();
    const existing = new Set((deck.tags ?? []).map((t) => t.toLowerCase()));
    return this.tagHistory
      .filter((t) => !existing.has(t.toLowerCase()))
      .filter((t) => !q || t.toLowerCase().includes(q))
      .slice(0, 8);
  }

  pickDeckTag(tag: string, deck: DeckDetailDto): void {
    this.tagDraft = tag;
    this.commitTagInput(deck);
    this.tagSuggOpen = false;
    this.cdr.markForCheck();
  }

  closeTagSuggSoon(): void {
    setTimeout(() => {
      this.tagSuggOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  viewMode: ViewMode = 'list';
  textStyle = false;
  zoomLevel = 1.0;
  activeBoard: 'main' | 'side' | 'maybe' = 'main';
  /** Arena-style swap: search browser fills the board area, deck becomes a side list. */
  swapMode = false;
  showSearchPanel = false;
  showSuggestionsPanel = false;
  showManaSuggestPanel = false;
  showSidePanel = false;
  sideTab: 'stats' | 'commander' = 'stats';

  freeColumns: FreeColumn[] = [];
  selectedFreeColId: string | null = null;
  editingColumnId: string | null = null;
  columnLabelDraft = '';
  dragCardId: string | null = null;
  dragSrcRenderedIdx: number | null = null;
  dragSourceColId: string | null = null;
  dragOverColId: string | null = null;
  dragOverIndex: number | null = null;
  dragColId: string | null = null;
  dragOverColInsertIdx: number | null = null;

  isRenaming = false;
  renameDraft = '';
  tagDraft = '';

  showDetailCoverPicker = false;

  showPublishModal = false;
  publishDescription = '';
  publishLoading = false;

  tokenCardCache = new Map<string, CardDto | null>();
  landCardCache = new Map<string, CardDto | null>();

  currentDeck: DeckDetailDto | null = null;

  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;

  modalSlotKey: string | null = null;
  private _modalFlipped = false;
  get modalFlipped(): boolean {
    return this._modalFlipped;
  }
  set modalFlipped(val: boolean) {
    this._modalFlipped = val;
    if (this.modalSlotKey) {
      if (val) this.flippedCardIds.add(this.modalSlotKey);
      else this.flippedCardIds.delete(this.modalSlotKey);
      this.cdr.markForCheck();
    }
  }
  flippedCardIds = new Set<string>();
  stackDensity: 'full' | 'half' | 'name' = 'half';
  groupDir: 'h' | 'v' = 'h';
  layoutSaved = false;
  freeLayoutDirty = false;
  showUnsavedLayoutModal = false;
  showSortResetModal = false;

  dragSelectBox: { x: number; y: number; w: number; h: number } | null = null;
  isDragSelecting = false;
  dragSelectMode: 'column' | 'card' = 'column';
  dragSelectedColIds: Set<string> = new Set();
  selectedCardSlots: Map<string, string> = new Map(); // slotKey → cardId
  isDraggingMultiCards = false;
  isDraggingMultiCols = false;
  multiDragColIds: string[] = [];
  private multiDragCards: { colId: string; cardId: string; renderedIdx: number }[] = [];
  private dragSelectOrigin = { x: 0, y: 0 };
  private dragSelectListEl: HTMLElement | null = null;
  private dragSelectJustEnded = false;
  private edgeScrollAnimId: number | null = null;
  private edgeScrollEl: HTMLElement | null = null;
  private edgeScrollDir = 0;
  private edgeScrollSpeed = 0;

  private pendingNavigation: (() => void) | null = null;
  private pendingSortMode: SortMode | null = null;
  private pendingSortDeck: DeckDetailDto | null = null;

  resizingColId: string | null = null;

  stackOrders = new Map<string, string[]>();
  /** What each stack actually displayed on the last render — the index space drag events live in. */
  private displayedStackOrders = new Map<string, string[]>();
  stackDragGroupKey: string | null = null;
  stackDragFromIdx: number | null = null;
  stackDragOverIdx: number | null = null;

  listOrders = new Map<string, string[]>();
  listDragGroupKey: string | null = null;
  listDragFromIdx: number | null = null;
  listDragOverIdx: number | null = null;

  isSearchDragOver = false;

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printings.cached(this.selectedCard.oracleId) ?? []) : [];
  }

  @ViewChild(CardSearchPanelComponent) searchPanel?: CardSearchPanelComponent;
  @ViewChild(CardSideListComponent) sideList?: CardSideListComponent;

  private deckId = '';
  private _rafPending = false;
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private printings: PrintingsService,
    private deckApi: DeckApiService,
    private cdr: ChangeDetectorRef,
    private prefs: PreferencesApiService,
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {
    this.deck$ = this.store.select(selectActiveDeck);
    this.loading$ = this.store.select(selectDeckLoading);
    this.commanderCardDetails$ = this.deck$.pipe(
      map((deck) =>
        deck?.format === 'commander' ? (this.commanderCard(deck)?.cardDetails ?? null) : null,
      ),
    );
  }

  ngOnInit(): void {
    this.zone.runOutsideAngular(() =>
      document.addEventListener('mousemove', this.onDocMouseMove, { passive: true }),
    );
    this.loadTagHistory();
    this.deckId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(DeckActions.loadDeck({ id: this.deckId }));

    this.store
      .select(selectForumPublishLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe((loading) => {
        this.publishLoading = loading;
        this.cdr.markForCheck();
      });
    const savedZoom = localStorage.getItem('deck-zoom');
    if (savedZoom) this.zoomLevel = Math.max(0.5, Math.min(3.0, parseFloat(savedZoom) || 1.0));

    // Swap mode keeps the search browser as the board; the search panel must be open
    // from the start or the restored layout would show an empty board area.
    this.swapMode = localStorage.getItem('deck-swap-mode') === '1';
    if (this.swapMode) this.showSearchPanel = true;

    if (localStorage.getItem(`deck-free-${this.deckId}`)) {
      this.viewMode = 'free';
      // Initialise free columns once deck data arrives
      this.deck$
        .pipe(
          filter((deck): deck is DeckDetailDto => deck != null && this.freeColumns.length === 0),
          take(1),
          takeUntil(this.destroy$),
        )
        .subscribe((deck) => {
          this.enterFreeMode(deck);
          this.cdr.markForCheck();
        });
    } else {
      this.stackDensity = 'half';
      this.prefs
        .load()
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe((p) => {
          this.viewMode = p.deckLayout ?? 'visual';
          this.cdr.markForCheck();
        });
    }

    this.deck$.pipe(takeUntil(this.destroy$)).subscribe((deck) => {
      this.currentDeck = deck;
      this.filterCardNames = deck
        ? [
            ...new Set(deck.cards.map((c) => c.cardDetails?.name).filter((n): n is string => !!n)),
          ].sort()
        : [];
      if (deck && !this.notesInitialized) {
        this.notesDraft = deck.notes ?? '';
        this.notesInitialized = true;
      }
      if (this.selectedCard && deck) {
        const updated = deck.cards.find((c) => c.id === this.selectedCard!.id);
        if (updated) {
          this.selectedCard = updated;
          this.cdr.markForCheck();
        } else {
          this.closeCard();
        }
      }
      if (deck && this.viewMode === 'free' && this.freeColumns.length > 0) {
        this.syncFreeColumns(deck);
        this.cdr.markForCheck();
      }
      if (deck) this.loadTokenImages(deck);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onDocMouseMove);
    this.destroy$.next();
    this.destroy$.complete();
    this.stopEdgeScroll();
    if (this.boardBumpTimer) clearTimeout(this.boardBumpTimer);
    if (this.commanderBumpTimer) clearTimeout(this.commanderBumpTimer);
  }

  goBack(): void {
    this.checkUnsaved(() => this.router.navigate(['/deck']));
  }

  openPublishModal(): void {
    this.showPublishModal = true;
    this.publishDescription = '';
  }

  closePublishModal(): void {
    this.showPublishModal = false;
  }

  submitPublish(): void {
    if (!this.currentDeck) return;
    this.store.dispatch(
      ForumActions.publishDeck({
        deckId: this.currentDeck.id,
        description: this.publishDescription.trim() || null,
      }),
    );
    this.showPublishModal = false;
  }

  // ---- Sort & filter ----------------------------------------

  setSortMode(mode: SortMode, deck?: DeckDetailDto): void {
    if (this.viewMode === 'free' && deck && mode !== this.sortMode) {
      this.pendingSortMode = mode;
      this.pendingSortDeck = deck;
      this.showSortResetModal = true;
      this.cdr.markForCheck();
      return;
    }
    this.sortMode = mode;
    this.listOrders.clear();
    this.stackOrders.clear();
    this.displayedStackOrders.clear();
    this.cdr.markForCheck();
  }

  confirmSortReset(): void {
    if (this.pendingSortMode && this.pendingSortDeck) {
      this.sortMode = this.pendingSortMode;
      this.rebuildFreeColumns(this.pendingSortDeck);
      this.freeLayoutDirty = true;
    }
    this.pendingSortMode = null;
    this.pendingSortDeck = null;
    this.showSortResetModal = false;
    this.cdr.markForCheck();
  }

  cancelSortReset(): void {
    this.pendingSortMode = null;
    this.pendingSortDeck = null;
    this.showSortResetModal = false;
    this.cdr.markForCheck();
  }

  setViewMode(mode: ViewMode, deck?: DeckDetailDto): void {
    const doSwitch = () => {
      if (this.viewMode !== mode) {
        this.stackOrders.clear();
        this.displayedStackOrders.clear();
      }
      this.viewMode = mode;
      this.textStyle = false;
      if (mode === 'free' && deck) this.enterFreeMode(deck);
      if (mode !== 'free') this.prefs.save({ deckLayout: mode });
      this.cdr.markForCheck();
    };
    if (this.viewMode === 'free' && mode !== 'free') {
      this.checkUnsaved(doSwitch);
    } else {
      doSwitch();
    }
  }

  setTextStyle(val: boolean): void {
    this.textStyle = val;
    this.cdr.markForCheck();
  }

  private checkUnsaved(proceed: () => void): void {
    if (this.viewMode === 'free' && this.freeLayoutDirty) {
      this.pendingNavigation = proceed;
      this.showUnsavedLayoutModal = true;
      this.cdr.markForCheck();
    } else {
      proceed();
    }
  }

  unsavedSave(): void {
    this.saveFreeLayout();
    this.freeLayoutDirty = false;
    this.layoutSaved = true;
    this.showUnsavedLayoutModal = false;
    const nav = this.pendingNavigation;
    this.pendingNavigation = null;
    this.cdr.markForCheck();
    nav?.();
  }

  unsavedDiscard(): void {
    this.freeLayoutDirty = false;
    this.showUnsavedLayoutModal = false;
    const nav = this.pendingNavigation;
    this.pendingNavigation = null;
    this.cdr.markForCheck();
    nav?.();
  }

  unsavedCancel(): void {
    this.showUnsavedLayoutModal = false;
    this.pendingNavigation = null;
    this.cdr.markForCheck();
  }

  setStackDensity(density: 'full' | 'half' | 'name'): void {
    this.stackDensity = density;
    this.textStyle = false;
    this.cdr.markForCheck();
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(3.0, +(this.zoomLevel + 0.25).toFixed(2));
    localStorage.setItem('deck-zoom', String(this.zoomLevel));
  }
  zoomOut(): void {
    this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2));
    localStorage.setItem('deck-zoom', String(this.zoomLevel));
  }
  get zoomLabel(): string {
    return Math.round(this.zoomLevel * 100) + '%';
  }

  // ---- Free mode layout ------------------------------------

  private rebuildFreeColumns(deck: DeckDetailDto): void {
    const prevFilter = this.filterQuery;
    this.filterQuery = '';
    this.freeColumns = this.getGroups(deck).map((g) => ({
      id: crypto.randomUUID(),
      label: g.label,
      cardIds: g.cards.flatMap((c) => Array(this.cardCount(c)).fill(c.id)),
    }));
    this.filterQuery = prevFilter;
  }

  private enterFreeMode(deck: DeckDetailDto): void {
    if (this.sortMode === 'name') this.sortMode = 'cmc';
    const saved = localStorage.getItem(`deck-free-${this.deckId}`);
    if (saved) {
      try {
        // localStorage survives app versions and manual edits — well-formed JSON of
        // the wrong shape must rebuild, not flow into freeColumns and NRE later.
        const parsed: unknown = JSON.parse(saved);
        if (isFreeColumns(parsed) && parsed.length) {
          this.freeColumns = parsed;
          this.freeLayoutDirty = false;
          this.syncFreeColumns(deck);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    this.rebuildFreeColumns(deck);
    this.freeLayoutDirty = false;
  }

  private syncFreeColumns(deck: DeckDetailDto): void {
    const assignedCounts = new Map<string, number>();
    for (const col of this.freeColumns)
      for (const id of col.cardIds) assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);

    const extra: string[] = [];
    for (const card of deck.cards) {
      if (deck.commanderOracleId && card.oracleId === deck.commanderOracleId) continue;
      const gap = this.cardCount(card) - (assignedCounts.get(card.id) ?? 0);
      for (let i = 0; i < gap; i++) extra.push(card.id);
    }

    if (extra.length) {
      const targetIdx = Math.max(
        0,
        this.freeColumns.findIndex((c) => c.id === this.selectedFreeColId),
      );
      this.freeColumns = this.freeColumns.map((col, i) =>
        i === targetIdx ? { ...col, cardIds: [...col.cardIds, ...extra] } : col,
      );
      this.freeLayoutDirty = true;
    }
  }

  saveFreeLayout(): void {
    localStorage.setItem(`deck-free-${this.deckId}`, JSON.stringify(this.freeColumns));
  }

  saveLayoutExplicit(): void {
    this.saveFreeLayout();
    this.freeLayoutDirty = false;
    this.layoutSaved = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.layoutSaved = false;
      this.cdr.markForCheck();
    }, 1800);
  }

  resetFreeLayout(deck: DeckDetailDto): void {
    localStorage.removeItem(`deck-free-${this.deckId}`);
    this.sortMode = 'cmc';
    this.freeColumns = [];
    this.rebuildFreeColumns(deck);
    this.freeLayoutDirty = true;
    this.cdr.detectChanges();
  }

  getCardsForColumn(col: FreeColumn, deck: DeckDetailDto): CollectionCardDto[] {
    const isCommander = (c: CollectionCardDto) =>
      deck.commanderOracleId ? c.oracleId === deck.commanderOracleId : false;
    const cards = col.cardIds
      .map((id) => deck.cards.find((c) => c.id === id))
      .filter((c): c is CollectionCardDto => c != null && !isCommander(c));
    const targetId = this.selectedFreeColId ?? this.freeColumns[0]?.id;
    if (col.id === targetId) {
      const assignedCounts = new Map<string, number>();
      for (const fc of this.freeColumns)
        for (const id of fc.cardIds) assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);
      const unassigned: CollectionCardDto[] = [];
      for (const card of deck.cards) {
        if (isCommander(card)) continue;
        const remaining = this.cardCount(card) - (assignedCounts.get(card.id) ?? 0);
        for (let i = 0; i < remaining; i++) unassigned.push(card);
      }
      return [...cards, ...unassigned];
    }
    return cards;
  }

  selectFreeCol(colId: string): void {
    this.dragSelectedColIds = new Set();
    this.selectedCardSlots = new Map();
    this.selectedFreeColId = this.selectedFreeColId === colId ? null : colId;
    this.cdr.markForCheck();
  }

  clearFreeColSelection(): void {
    if (this.dragSelectJustEnded) {
      this.dragSelectJustEnded = false;
      return;
    }
    if (
      this.selectedFreeColId ||
      this.dragSelectedColIds.size > 0 ||
      this.selectedCardSlots.size > 0
    ) {
      this.selectedFreeColId = null;
      this.dragSelectedColIds = new Set();
      this.selectedCardSlots = new Map();
      this.cdr.markForCheck();
    }
  }

  onGroupsListMouseDown(event: MouseEvent): void {
    this.dragSelectJustEnded = false;
    if ((event.target as Element).closest('.free-card, .free-col-header, .add-col-wrap')) return;
    const listEl = event.currentTarget as HTMLElement;
    const rect = listEl.getBoundingClientRect();
    this.dragSelectMode = this.isInHeaderZone(listEl, event.clientY) ? 'column' : 'card';
    this.dragSelectOrigin = {
      x: event.clientX - rect.left + listEl.scrollLeft,
      y: event.clientY - rect.top + listEl.scrollTop,
    };
    this.dragSelectListEl = listEl;
    this.dragSelectBox = null;
    this.isDragSelecting = false;
    event.preventDefault();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase() ?? '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (this.viewMode !== 'free') return;
    if (event.key === 'Escape') {
      this.clearFreeColSelection();
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (this.selectedCardSlots.size === 0) return;
    event.preventDefault();
    this.deleteSelectedCards();
  }

  private deleteSelectedCards(): void {
    this.deck$.pipe(take(1)).subscribe((deck) => {
      if (!deck) return;
      const removals = new Map<string, number>(); // cardId → copies to remove
      const splices: Array<{ col: FreeColumn; idx: number }> = [];
      for (const [slotKey, cardId] of this.selectedCardSlots) {
        const slashIdx = slotKey.lastIndexOf('/');
        const colId = slotKey.slice(0, slashIdx);
        const renderedIdx = parseInt(slotKey.slice(slashIdx + 1), 10);
        const col = this.freeColumns.find((c) => c.id === colId);
        if (col != null && renderedIdx < col.cardIds.length) {
          splices.push({ col, idx: renderedIdx });
        }
        removals.set(cardId, (removals.get(cardId) ?? 0) + 1);
      }
      splices.sort((a, b) => b.idx - a.idx);
      for (const { col, idx } of splices) col.cardIds.splice(idx, 1);
      for (const [cardId, count] of removals) {
        const card = deck.cards.find((c) => c.id === cardId);
        if (!card) continue;
        if (this.cardCount(card) - count <= 0) {
          this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId }));
        } else {
          const newQty = Math.max(0, card.quantity - count);
          const newFoil = Math.max(0, card.quantityFoil - Math.max(0, count - card.quantity));
          this.store.dispatch(
            DeckActions.updateCard({
              deckId: this.deckId,
              cardId,
              request: { quantity: newQty, quantityFoil: newFoil },
            }),
          );
        }
      }
      this.selectedCardSlots = new Map();
      this.freeLayoutDirty = true;
      this.cdr.markForCheck();
    });
  }

  /**
   * The single document mousemove listener, attached OUTSIDE the Angular zone in
   * ngOnInit. A zone-bound mousemove ran full change detection per pointer event
   * for the lifetime of the page; now the zone is entered only while a drag-select
   * is actually in progress, and edge auto-scroll (pure DOM scrolling) never
   * enters it at all.
   */
  private readonly onDocMouseMove = (event: MouseEvent): void => {
    if (this.dragSelectListEl) {
      this.zone.run(() => this.handleDragSelectMove(event));
      return;
    }
    if (this.viewMode !== 'free' && this.viewMode !== 'visual') return;
    const area = (event.target as HTMLElement | null)?.closest?.('.groups-area');
    if (area) this.updateEdgeScroll(event.clientX, area as HTMLElement);
    else this.stopEdgeScroll();
  };

  private handleDragSelectMove(event: MouseEvent): void {
    if (!this.dragSelectListEl) return;
    const el = this.dragSelectListEl;
    const r = el.getBoundingClientRect();
    const cx = event.clientX - r.left + el.scrollLeft;
    const cy = event.clientY - r.top + el.scrollTop;
    const { x: ox, y: oy } = this.dragSelectOrigin;
    const newBox = {
      x: Math.min(ox, cx),
      y: Math.min(oy, cy),
      w: Math.abs(cx - ox),
      h: Math.abs(cy - oy),
    };
    if (!this.isDragSelecting && (newBox.w > 4 || newBox.h > 4)) {
      this.isDragSelecting = true;
      if (this.dragSelectMode === 'column') {
        this.selectedFreeColId = null;
        this.dragSelectedColIds = new Set();
      }
      this.selectedCardSlots = new Map();
    }
    if (!this.isDragSelecting) return;
    this.dragSelectBox = newBox;
    this.updateDragSelection();
    const scrollEl = el.closest<HTMLElement>('.groups-area') ?? el.parentElement;
    if (scrollEl) this.updateEdgeScroll(event.clientX, scrollEl);
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.dragSelectListEl) return;
    if (
      this.isDragSelecting &&
      (this.dragSelectedColIds.size > 0 || this.selectedCardSlots.size > 0)
    ) {
      this.dragSelectJustEnded = true;
    }
    this.isDragSelecting = false;
    this.dragSelectBox = null;
    this.dragSelectListEl = null;
    this.stopEdgeScroll();
    this.cdr.markForCheck();
  }

  private isInHeaderZone(listEl: HTMLElement, clientY: number): boolean {
    const headers = listEl.querySelectorAll<HTMLElement>('.free-col-header');
    for (const h of Array.from(headers)) {
      const r = h.getBoundingClientRect();
      if (clientY >= r.top - 4 && clientY <= r.bottom + 4) return true;
    }
    return false;
  }

  private updateDragSelection(): void {
    if (this.dragSelectMode === 'column') this.updateDragSelectedCols();
    else this.updateDragSelectedCards();
  }

  private updateDragSelectedCols(): void {
    if (!this.dragSelectBox || !this.dragSelectListEl) {
      this.dragSelectedColIds = new Set();
      return;
    }
    const box = this.dragSelectBox;
    const el = this.dragSelectListEl;
    const elRect = el.getBoundingClientRect();
    const newIds = new Set<string>();
    el.querySelectorAll<HTMLElement>('[data-col-id]').forEach((colEl) => {
      const r = colEl.getBoundingClientRect();
      const left = r.left - elRect.left + el.scrollLeft;
      const top = r.top - elRect.top + el.scrollTop;
      const right = left + r.width;
      const bottom = top + r.height;
      if (left < box.x + box.w && right > box.x && top < box.y + box.h && bottom > box.y) {
        const id = colEl.getAttribute('data-col-id');
        if (id) newIds.add(id);
      }
    });
    this.dragSelectedColIds = newIds;
  }

  private updateDragSelectedCards(): void {
    if (!this.dragSelectBox || !this.dragSelectListEl) {
      this.selectedCardSlots = new Map();
      return;
    }
    const box = this.dragSelectBox;
    const el = this.dragSelectListEl;
    const elRect = el.getBoundingClientRect();
    const newSlots = new Map<string, string>();
    el.querySelectorAll<HTMLElement>('[data-slot-key]').forEach((cardEl) => {
      const r = cardEl.getBoundingClientRect();
      const left = r.left - elRect.left + el.scrollLeft;
      const top = r.top - elRect.top + el.scrollTop;
      const right = left + r.width;
      const bottom = top + r.height;
      if (left < box.x + box.w && right > box.x && top < box.y + box.h && bottom > box.y) {
        const slot = cardEl.getAttribute('data-slot-key');
        const cardId = cardEl.getAttribute('data-card-id');
        if (slot && cardId) newSlots.set(slot, cardId);
      }
    });
    this.selectedCardSlots = newSlots;
  }

  addFreeColumn(): void {
    this.freeColumns = [
      ...this.freeColumns,
      {
        id: crypto.randomUUID(),
        label: 'New Column',
        cardIds: [],
      },
    ];
    this.freeLayoutDirty = true;
    this.cdr.markForCheck();
  }

  removeColumn(colId: string): void {
    if (this.freeColumns.length <= 1) return;
    const col = this.freeColumns.find((c) => c.id === colId);
    if (!col) return;
    const remaining = this.freeColumns.filter((c) => c.id !== colId);
    remaining[0] = { ...remaining[0], cardIds: [...remaining[0].cardIds, ...col.cardIds] };
    this.freeColumns = remaining;
    this.freeLayoutDirty = true;
    this.cdr.markForCheck();
  }

  onColResizeStart(colId: string, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const colEl = document.querySelector<HTMLElement>(`[data-col-id="${colId}"]`);
    if (!colEl) return;
    const startX = event.clientX;
    const startWidth = colEl.offsetWidth;
    this.resizingColId = colId;
    document.body.style.setProperty('cursor', 'col-resize', 'important');
    this.cdr.markForCheck();
    const onMove = (e: PointerEvent) => {
      const newWidth = Math.max(120, startWidth + (e.clientX - startX));
      this.freeColumns = this.freeColumns.map((c) =>
        c.id === colId ? { ...c, width: newWidth } : c,
      );
      this.freeLayoutDirty = true;
      this.cdr.markForCheck();
    };
    const onUp = () => {
      this.resizingColId = null;
      document.body.style.removeProperty('cursor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.cdr.markForCheck();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  resetColWidth(colId: string): void {
    this.freeColumns = this.freeColumns.map((c) =>
      c.id === colId ? { ...c, width: undefined } : c,
    );
    this.freeLayoutDirty = true;
    this.cdr.markForCheck();
  }

  startEditColumnLabel(col: FreeColumn): void {
    this.editingColumnId = col.id;
    this.columnLabelDraft = col.label;
    this.cdr.markForCheck();
  }

  commitColumnLabel(): void {
    if (!this.editingColumnId) return;
    const label = this.columnLabelDraft.trim();
    if (label) {
      this.freeColumns = this.freeColumns.map((c) =>
        c.id === this.editingColumnId ? { ...c, label } : c,
      );
      this.freeLayoutDirty = true;
    }
    this.editingColumnId = null;
    this.cdr.markForCheck();
  }

  cancelColumnLabel(): void {
    this.editingColumnId = null;
    this.cdr.markForCheck();
  }

  // ---- Drag and drop ---------------------------------------

  private rafCheck(): void {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.cdr.markForCheck();
    });
  }

  private animateGhostDrop(
    ghost: HTMLElement,
    x: number,
    y: number,
    grabOffsetX: number,
    grabOffsetY: number,
    done: () => void,
  ): void {
    ghost.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0.2,1), opacity 0.15s ease';
    ghost.style.transform = `translate3d(${x - grabOffsetX}px,${y - grabOffsetY}px,0) rotate(0deg) scale(0.8)`;
    ghost.style.opacity = '0';
    setTimeout(done, 180);
  }

  /**
   * Glides a drag ghost into its landing point and fades it on arrival, so a release
   * reads as the card settling into the gap instead of evaporating at the cursor. The
   * caller applies the reorder in `done`, which keeps the opened gap visible right up
   * until the card lands in it. Also used to spring the ghost back home on a cancelled
   * or targetless drop.
   */
  private glideGhostTo(ghost: HTMLElement, x: number, y: number, done: () => void): void {
    ghost.style.transition =
      'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease 0.12s';
    ghost.style.transform = `translate3d(${x}px,${y}px,0) rotate(0deg) scale(1)`;
    ghost.style.opacity = '0';
    // Outlasts both the transform (220ms) and the delayed fade (120ms + 160ms).
    setTimeout(done, 290);
  }

  /** True when a stack card should slide down to open the insertion gap under a drag. */
  stackShifted(groupKey: string, i: number): boolean {
    if (this.groupDir === 'v') return false; // horizontal wrap uses the line indicator
    if (this.stackDragGroupKey !== groupKey || this.stackDragOverIdx == null) return false;
    if (this.stackDragFromIdx === i) return false;
    // Position among the non-dragged cards, which is what stackDragOverIdx indexes.
    const pos = this.stackDragFromIdx != null && i > this.stackDragFromIdx ? i - 1 : i;
    return pos >= this.stackDragOverIdx;
  }

  private createDragGhost(
    cardEl: HTMLElement,
    startX: number,
    startY: number,
  ): { ghost: HTMLElement; grabOffsetX: number; grabOffsetY: number } {
    const artEl = cardEl.querySelector<HTMLElement>('.visual-art, .card-thumb');
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.92';

    let grabOffsetX: number;
    let grabOffsetY: number;

    if (artEl) {
      const r = artEl.getBoundingClientRect();
      grabOffsetX = startX - r.left;
      grabOffsetY = startY - r.top;
      ghost.style.width = `${r.width || 120}px`;
      ghost.style.height = `${r.height || 168}px`;
      ghost.style.backgroundImage = artEl.style.backgroundImage || '';
      ghost.style.backgroundSize = 'cover';
      ghost.style.backgroundPosition = 'center';
      ghost.style.backgroundColor = '#1a1728';
      ghost.style.borderRadius = '6px';
      ghost.style.boxShadow = '0 24px 48px rgba(0,0,0,0.6), 0 0 0 2px rgba(201,168,76,0.4)';
    } else {
      // Text-only row — show a compact name badge
      const label =
        cardEl.querySelector('.list-name')?.textContent?.trim() ??
        cardEl.querySelector('.card-name span')?.textContent?.trim() ??
        '';
      const rowR = cardEl.getBoundingClientRect();
      grabOffsetX = startX - rowR.left;
      grabOffsetY = startY - rowR.top;
      ghost.style.height = '34px';
      ghost.style.maxWidth = '260px';
      ghost.style.width = 'max-content';
      ghost.style.padding = '0 14px';
      ghost.style.display = 'flex';
      ghost.style.alignItems = 'center';
      ghost.style.backgroundColor = '#1a1728';
      ghost.style.border = '1px solid rgba(201,168,76,0.5)';
      ghost.style.borderRadius = '17px';
      ghost.style.color = 'rgba(201,168,76,0.95)';
      ghost.style.fontSize = '13px';
      ghost.style.fontWeight = '500';
      ghost.style.whiteSpace = 'nowrap';
      ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.2)';
      ghost.textContent = label;
    }

    ghost.style.transform = `translate3d(${startX - grabOffsetX}px,${startY - grabOffsetY}px,0) rotate(2deg) scale(1.04)`;
    document.body.appendChild(ghost);
    return { ghost, grabOffsetX, grabOffsetY };
  }

  onFreeCardPointerDown(
    card: CollectionCardDto,
    colId: string,
    renderedIdx: number,
    event: PointerEvent,
  ): void {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();

    const slotKey = `${colId}/${renderedIdx}`;
    const isMulti = this.selectedCardSlots.size > 1 && this.selectedCardSlots.has(slotKey);
    const startX = event.clientX;
    const startY = event.clientY;
    let lastX = startX;
    let lastY = startY;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    const cardEl = event.currentTarget as HTMLElement;
    const scrollEl = document.querySelector<HTMLElement>('.groups-area.is-free');

    const cleanup = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      ghost?.remove();
      ghost = null;
      this.stopEdgeScroll();

      if (dragging && drop && this.dragOverColId !== null && this.dragOverIndex !== null) {
        if (isMulti && this.multiDragCards.length > 1) {
          this.executeMultiCardDrop(this.dragOverColId, this.dragOverIndex);
        } else {
          const dropColId = this.dragOverColId;
          const dropIdx = this.dragOverIndex;
          const cardId = card.id;
          const cols = this.freeColumns.map((c) => {
            if (c.id !== colId) return c;
            const i = c.cardIds.indexOf(cardId);
            if (i < 0) return c;
            return { ...c, cardIds: [...c.cardIds.slice(0, i), ...c.cardIds.slice(i + 1)] };
          });
          const ti = cols.findIndex((c) => c.id === dropColId);
          if (ti >= 0) {
            cols[ti] = {
              ...cols[ti],
              cardIds: [
                ...cols[ti].cardIds.slice(0, dropIdx),
                cardId,
                ...cols[ti].cardIds.slice(dropIdx),
              ],
            };
          }
          this.freeColumns = cols;
          this.freeLayoutDirty = true;
        }
      }

      document.body.style.removeProperty('cursor');
      this.dragCardId = null;
      this.dragSourceColId = null;
      this.dragSrcRenderedIdx = null;
      this.dragOverColId = null;
      this.dragOverIndex = null;
      this.isDraggingMultiCards = false;
      this.multiDragCards = [];
      if (dragging) this.cdr.markForCheck();
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        dragging = true;
        this.dragCardId = card.id;
        this.dragSourceColId = colId;
        this.dragSrcRenderedIdx = renderedIdx;
        if (isMulti) {
          this.isDraggingMultiCards = true;
          this.multiDragCards = Array.from(this.selectedCardSlots.entries()).map(([slot, cid]) => {
            const slash = slot.lastIndexOf('/');
            return {
              colId: slot.slice(0, slash),
              cardId: cid,
              renderedIdx: parseInt(slot.slice(slash + 1), 10),
            };
          });
        }
        document.body.style.setProperty('cursor', 'grabbing', 'important');

        // Build ghost element
        const r = cardEl.getBoundingClientRect();
        grabOffsetX = startX - r.left;
        grabOffsetY = startY - r.top;
        const visualArt = cardEl.querySelector<HTMLElement>('.visual-art');
        const bgImg = visualArt?.style.backgroundImage || '';
        ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.width = `${r.width || 120}px`;
        ghost.style.height = `${r.height || 168}px`;
        ghost.style.backgroundImage = bgImg;
        ghost.style.backgroundSize = 'cover';
        ghost.style.backgroundPosition = 'center';
        ghost.style.backgroundColor = '#1a1728';
        ghost.style.borderRadius = '6px';
        ghost.style.opacity = '0.9';
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.boxShadow = '0 24px 48px rgba(0,0,0,0.6), 0 0 0 2px rgba(201,168,76,0.4)';
        ghost.style.transform = `translate3d(${startX - grabOffsetX}px,${startY - grabOffsetY}px,0) rotate(2deg) scale(1.04)`;
        document.body.appendChild(ghost);

        this.cdr.markForCheck();
      }

      lastX = e.clientX;
      lastY = e.clientY;

      if (ghost) {
        ghost.style.transform = `translate3d(${e.clientX - grabOffsetX}px,${e.clientY - grabOffsetY}px,0) rotate(2deg) scale(1.04)`;
      }

      // Edge scroll the free area
      if (scrollEl) this.updateEdgeScroll(e.clientX, scrollEl);

      let newColId: string | null = null;
      for (const colEl of Array.from(document.querySelectorAll<HTMLElement>('.free-col'))) {
        const r = colEl.getBoundingClientRect();
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        ) {
          newColId = colEl.getAttribute('data-col-id');
          break;
        }
      }

      if (newColId !== null) {
        const colEl = document.querySelector<HTMLElement>(`.free-col[data-col-id="${newColId}"]`);
        const cards = colEl
          ? Array.from(colEl.querySelectorAll<HTMLElement>('.free-card:not(.is-dragging)'))
          : [];
        let idx = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const { top, height } = cards[i].getBoundingClientRect();
          if (e.clientY < top + height / 2) {
            idx = i;
            break;
          }
        }
        if (this.dragOverColId !== newColId || this.dragOverIndex !== idx) {
          this.dragOverColId = newColId;
          this.dragOverIndex = idx;
          this.rafCheck();
        }
      } else if (this.dragOverColId !== null) {
        this.dragOverColId = null;
        this.dragOverIndex = null;
        this.rafCheck();
      }
    };

    const onUp = () => {
      if (dragging) this.armClickSuppression();
      if (dragging && ghost) {
        this.animateGhostDrop(ghost, lastX, lastY, grabOffsetX, grabOffsetY, () => cleanup(true));
      } else {
        cleanup(true);
      }
    };
    const onCancel = () => {
      if (dragging) this.armClickSuppression();
      cleanup(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  private parseSearchDrag(event: DragEvent): { oracleId: string; scryfallId: string } | null {
    try {
      const raw = event.dataTransfer?.getData('application/x-search-card');
      if (!raw) return null;
      return JSON.parse(raw) as { oracleId: string; scryfallId: string };
    } catch {
      return null;
    }
  }

  onColDragOver(colId: string, event: DragEvent): void {
    if (this.dragColId) return;
    const isSearch = event.dataTransfer?.types.includes('application/x-search-card');
    if (!isSearch) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!this.isSearchDragOver) {
      this.isSearchDragOver = true;
      this.cdr.markForCheck();
    }
  }

  onColDrop(colId: string, event: DragEvent): void {
    if (this.dragColId) return;
    event.preventDefault();

    const searchCard = this.parseSearchDrag(event);
    if (searchCard) {
      event.stopPropagation();
      this.selectedFreeColId = colId;
      this.onPanelCardAdd(searchCard);
      this.dragOverColId = null;
      this.dragOverIndex = null;
      this.cdr.markForCheck();
      return;
    }

    if (!this.dragCardId) return;

    const dropIdx = this.dragOverIndex ?? 0;

    if (this.isDraggingMultiCards && this.multiDragCards.length > 1) {
      this.executeMultiCardDrop(colId, dropIdx);
    } else {
      const cardId = this.dragCardId;
      const srcId = this.dragSourceColId;
      const cols = this.freeColumns.map((c) => {
        if (c.id !== srcId) return c;
        const idx = c.cardIds.indexOf(cardId);
        if (idx < 0) return c;
        return { ...c, cardIds: [...c.cardIds.slice(0, idx), ...c.cardIds.slice(idx + 1)] };
      });
      const ti = cols.findIndex((c) => c.id === colId);
      if (ti >= 0) {
        cols[ti] = {
          ...cols[ti],
          cardIds: [
            ...cols[ti].cardIds.slice(0, dropIdx),
            cardId,
            ...cols[ti].cardIds.slice(dropIdx),
          ],
        };
      }
      this.freeColumns = cols;

      if (srcId != null && this.dragSrcRenderedIdx != null) {
        const removeIdx = this.dragSrcRenderedIdx;
        const wasFlipped = this.flippedCardIds.has(`${srcId}/${removeIdx}`);
        this.flippedCardIds.delete(`${srcId}/${removeIdx}`);
        this.shiftFlipKeys(srcId, removeIdx, -1);
        this.shiftFlipKeys(colId, dropIdx, +1);
        if (wasFlipped) this.flippedCardIds.add(`${colId}/${dropIdx}`);
      }
    }

    this.freeLayoutDirty = true;
    this.onDragEnd();
  }

  private updateEdgeScroll(clientX: number, listEl: HTMLElement): void {
    const rect = listEl.getBoundingClientRect();
    const ZONE = 80;
    const MAX_SPEED = 15;
    let dir = 0;
    let speed = 0;
    if (clientX < rect.left + ZONE) {
      speed = MAX_SPEED * Math.max(0, (ZONE - (clientX - rect.left)) / ZONE);
      dir = -1;
    } else if (clientX > rect.right - ZONE) {
      speed = MAX_SPEED * Math.max(0, (ZONE - (rect.right - clientX)) / ZONE);
      dir = 1;
    }
    this.edgeScrollEl = dir !== 0 ? listEl : null;
    this.edgeScrollDir = dir;
    this.edgeScrollSpeed = speed;
    if (dir !== 0 && this.edgeScrollAnimId === null) {
      this.runEdgeScrollLoop();
    }
  }

  private runEdgeScrollLoop(): void {
    if (this.edgeScrollDir === 0 || !this.edgeScrollEl) {
      this.edgeScrollAnimId = null;
      return;
    }
    this.edgeScrollEl.scrollLeft += this.edgeScrollDir * this.edgeScrollSpeed;
    this.edgeScrollAnimId = requestAnimationFrame(() => this.runEdgeScrollLoop());
  }

  onGroupsAreaDragOver(event: DragEvent): void {
    const isSearch = event.dataTransfer?.types.includes('application/x-search-card');
    if (isSearch) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      if (!this.isSearchDragOver) {
        this.isSearchDragOver = true;
        this.cdr.markForCheck();
      }
    }
    if (this.viewMode !== 'free' && this.viewMode !== 'visual') return;
    if (!this.dragCardId && !this.dragColId && !isSearch) return;
    this.updateEdgeScroll(event.clientX, event.currentTarget as HTMLElement);
  }

  onGroupsAreaDragLeave(event: DragEvent): void {
    const rel = event.relatedTarget as HTMLElement | null;
    if (rel && (event.currentTarget as HTMLElement).contains(rel)) return;
    if (this.isSearchDragOver) {
      this.isSearchDragOver = false;
      this.cdr.markForCheck();
    }
  }

  onGroupsAreaDrop(event: DragEvent): void {
    this.isSearchDragOver = false;
    const searchCard = this.parseSearchDrag(event);
    if (!searchCard) return;
    event.preventDefault();
    this.onPanelCardAdd(searchCard);
  }

  stopEdgeScroll(): void {
    this.edgeScrollDir = 0;
    this.edgeScrollEl = null;
    if (this.edgeScrollAnimId !== null) {
      cancelAnimationFrame(this.edgeScrollAnimId);
      this.edgeScrollAnimId = null;
    }
  }

  private shiftFlipKeys(colId: string, fromIdx: number, delta: number): void {
    const prefix = colId + '/';
    const toDelete: string[] = [];
    const toAdd: string[] = [];
    for (const key of this.flippedCardIds) {
      if (!key.startsWith(prefix)) continue;
      const idx = parseInt(key.slice(prefix.length), 10);
      if (isNaN(idx)) continue;
      if (delta < 0 && idx > fromIdx) {
        toDelete.push(key);
        toAdd.push(`${colId}/${idx + delta}`);
      } else if (delta > 0 && idx >= fromIdx) {
        toDelete.push(key);
        toAdd.push(`${colId}/${idx + delta}`);
      }
    }
    for (const k of toDelete) this.flippedCardIds.delete(k);
    for (const k of toAdd) this.flippedCardIds.add(k);
  }

  private executeMultiCardDrop(targetColId: string, dropIdx: number): void {
    const removals = new Map<string, Map<string, number>>();
    const toInsert: string[] = [];

    for (const { colId, cardId, renderedIdx } of this.multiDragCards) {
      const srcCol = this.freeColumns.find((c) => c.id === colId);
      const isExplicit = srcCol != null && renderedIdx < srcCol.cardIds.length;
      if (isExplicit) {
        if (!removals.has(colId)) removals.set(colId, new Map());
        const m = removals.get(colId)!;
        m.set(cardId, (m.get(cardId) ?? 0) + 1);
      }
      toInsert.push(cardId);
    }

    // Snapshot flip state per original slot key before any modification.
    // selectedCardSlots iteration order matches multiDragCards (both derived from same Map).
    const selectedSlotKeys = Array.from(this.selectedCardSlots.keys());
    const draggedFlip = new Map<string, boolean>();
    for (const key of selectedSlotKeys) {
      draggedFlip.set(key, this.flippedCardIds.has(key));
    }

    let adjustedDropIdx = dropIdx;
    const removalsByCol = new Map<string, Set<number>>();

    const cols = this.freeColumns.map((col) => {
      const removeMap = removals.get(col.id);
      if (!removeMap) return col;

      const counts = new Map(removeMap);
      const remaining: string[] = [];
      const removedIndices = new Set<number>();
      for (let i = 0; i < col.cardIds.length; i++) {
        const cid = col.cardIds[i];
        const toRemove = counts.get(cid) ?? 0;
        if (toRemove > 0) {
          counts.set(cid, toRemove - 1);
          removedIndices.add(i);
          if (col.id === targetColId && i < adjustedDropIdx) adjustedDropIdx--;
        } else {
          remaining.push(cid);
        }
      }
      removalsByCol.set(col.id, removedIndices);
      return { ...col, cardIds: remaining };
    });

    const ti = cols.findIndex((c) => c.id === targetColId);
    const adj = ti >= 0 ? Math.max(0, Math.min(adjustedDropIdx, cols[ti].cardIds.length)) : 0;
    if (ti >= 0) {
      cols[ti] = {
        ...cols[ti],
        cardIds: [...cols[ti].cardIds.slice(0, adj), ...toInsert, ...cols[ti].cardIds.slice(adj)],
      };
    }
    this.freeColumns = cols;

    // Update flippedCardIds to match the new layout.
    // Step 1: for each source column, remove dragged card flip keys and shift remaining keys down.
    for (const [colId, removedIndices] of removalsByCol) {
      for (const idx of removedIndices) {
        this.flippedCardIds.delete(`${colId}/${idx}`);
      }
      const prefix = colId + '/';
      const toDelete: string[] = [];
      const toAdd: string[] = [];
      for (const key of this.flippedCardIds) {
        if (!key.startsWith(prefix)) continue;
        const origIdx = parseInt(key.slice(prefix.length), 10);
        if (isNaN(origIdx)) continue;
        const shift = [...removedIndices].filter((ri) => ri < origIdx).length;
        if (shift > 0) {
          toDelete.push(key);
          toAdd.push(`${colId}/${origIdx - shift}`);
        }
      }
      for (const k of toDelete) this.flippedCardIds.delete(k);
      for (const k of toAdd) this.flippedCardIds.add(k);
    }
    // Step 2: shift target column keys at/above adj up to make room for inserted cards.
    this.shiftFlipKeys(targetColId, adj, toInsert.length);
    // Step 3: re-apply flip states of inserted cards at their new positions.
    for (let i = 0; i < selectedSlotKeys.length; i++) {
      if (draggedFlip.get(selectedSlotKeys[i])) {
        this.flippedCardIds.add(`${targetColId}/${adj + i}`);
      }
    }
  }

  // ---- Column drag and drop --------------------------------

  onColHeaderDragStart(col: FreeColumn, event: DragEvent): void {
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', col.id);
    }

    const isMulti = this.dragSelectedColIds.size > 1 && this.dragSelectedColIds.has(col.id);
    if (isMulti) {
      this.isDraggingMultiCols = true;
      this.multiDragColIds = this.freeColumns
        .filter((c) => this.dragSelectedColIds.has(c.id))
        .map((c) => c.id);
    } else {
      this.isDraggingMultiCols = false;
      this.multiDragColIds = [];
    }

    setTimeout(() => {
      this.dragColId = col.id;
      this.cdr.markForCheck();
    });
  }

  onColDragEnd(): void {
    this.dragColId = null;
    this.dragOverColInsertIdx = null;
    this.isDraggingMultiCols = false;
    this.multiDragColIds = [];
    this.stopEdgeScroll();
    this.cdr.markForCheck();
  }

  onGroupsListDragOver(event: DragEvent): void {
    if (!this.dragColId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const list = event.currentTarget as HTMLElement;
    const cols = Array.from(list.querySelectorAll<HTMLElement>('.free-col'));
    let idx = this.freeColumns.length;
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].classList.contains('is-dragging-col')) continue;
      const { left, width } = cols[i].getBoundingClientRect();
      if (event.clientX < left + width / 2) {
        idx = i;
        break;
      }
    }

    if (this.dragOverColInsertIdx !== idx) {
      this.dragOverColInsertIdx = idx;
      this.cdr.markForCheck();
    }
  }

  onGroupsListDrop(event: DragEvent): void {
    if (!this.dragColId) return;
    event.preventDefault();
    if (this.isDraggingMultiCols && this.multiDragColIds.length > 1) {
      this.executeMultiColumnDrop();
    } else {
      this.executeColumnDrop();
    }
    this.dragColId = null;
    this.dragOverColInsertIdx = null;
    this.isDraggingMultiCols = false;
    this.multiDragColIds = [];
    this.cdr.markForCheck();
  }

  onGroupsListDragLeave(event: DragEvent): void {
    const rel = event.relatedTarget as HTMLElement | null;
    const trulyLeft = !rel || !(event.currentTarget as HTMLElement).contains(rel);
    if (trulyLeft) this.stopEdgeScroll();
    if (!this.dragColId) return;
    if (trulyLeft) {
      this.dragOverColInsertIdx = null;
      this.cdr.markForCheck();
    }
  }

  private executeMultiColumnDrop(): void {
    if (!this.dragColId || this.dragOverColInsertIdx == null) return;
    const moveSet = new Set(this.multiDragColIds);
    const toMove = this.freeColumns.filter((c) => moveSet.has(c.id));
    const keep = this.freeColumns.filter((c) => !moveSet.has(c.id));

    let insertAt = 0;
    for (let i = 0; i < this.dragOverColInsertIdx && i < this.freeColumns.length; i++) {
      if (!moveSet.has(this.freeColumns[i].id)) insertAt++;
    }

    keep.splice(insertAt, 0, ...toMove);
    this.freeColumns = keep;
    this.freeLayoutDirty = true;
  }

  private executeColumnDrop(): void {
    if (!this.dragColId || this.dragOverColInsertIdx == null) return;
    const fromIdx = this.freeColumns.findIndex((c) => c.id === this.dragColId);
    if (fromIdx < 0) return;
    let toIdx = this.dragOverColInsertIdx;
    if (toIdx > fromIdx) toIdx--;
    const cols = [...this.freeColumns];
    const [removed] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, removed);
    this.freeColumns = cols;
    this.freeLayoutDirty = true;
  }

  onDragEnd(): void {
    this.dragCardId = null;
    this.dragSrcRenderedIdx = null;
    this.dragSourceColId = null;
    this.dragOverColId = null;
    this.dragOverIndex = null;
    this.isDraggingMultiCards = false;
    this.multiDragCards = [];
    this.selectedCardSlots = new Map();
    this.stopEdgeScroll();
    this.cdr.markForCheck();
  }

  totalCount(deck: DeckDetailDto): number {
    return deck.cards
      .filter((c) => (c.board ?? 'main') === 'main')
      .reduce((s, c) => s + c.quantity + c.quantityFoil, 0);
  }

  cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  private isLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.cardTypes?.includes(CardType.Land) ?? false;
  }

  getGroups(deck: DeckDetailDto): CmcGroup[] {
    const filtered = this.filteredCards(deck);

    if (this.sortMode === 'name') {
      const sorted = [...filtered].sort((a, b) =>
        (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''),
      );
      return [
        {
          label: 'All Cards',
          key: 'all',
          cards: sorted,
          totalCount: sorted.reduce((s, c) => s + this.cardCount(c), 0),
        },
      ];
    }

    if (this.sortMode === 'type') {
      const order: CardType[] = [
        CardType.Creature,
        CardType.Planeswalker,
        CardType.Instant,
        CardType.Sorcery,
        CardType.Enchantment,
        CardType.Artifact,
        CardType.Land,
      ];
      const groups: CmcGroup[] = [];
      for (const type of order) {
        const cards = filtered
          .filter((c) => c.cardDetails?.cardTypes?.includes(type))
          .sort(
            (a, b) =>
              (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0) ||
              (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''),
          );
        if (cards.length)
          groups.push({
            label: CardType[type] + 's',
            key: `type-${type}`,
            cards,
            totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
          });
      }
      const typed = new Set(groups.flatMap((g) => g.cards.map((c) => c.id)));
      const rest = filtered.filter((c) => !typed.has(c.id));
      if (rest.length)
        groups.push({
          label: 'Other',
          key: 'type-other',
          cards: rest,
          totalCount: rest.reduce((s, c) => s + this.cardCount(c), 0),
        });
      return groups;
    }

    if (this.sortMode === 'subtype') {
      const bySubtype = new Map<string, CollectionCardDto[]>();
      for (const c of filtered) {
        const key = c.cardDetails?.subtypes?.[0] ?? 'Other';
        if (!bySubtype.has(key)) bySubtype.set(key, []);
        bySubtype.get(key)!.push(c);
      }
      const keys = [...bySubtype.keys()].sort((a, b) =>
        a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b),
      );
      return keys.map((key) => {
        const cards = bySubtype.get(key)!;
        return {
          label: key,
          key: `subtype-${key}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        };
      });
    }

    if (this.sortMode === 'color') {
      const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      const byColor = new Map<string, CollectionCardDto[]>();
      for (const label of colorOrder) byColor.set(label, []);
      for (const c of filtered) {
        const mc = c.cardDetails?.manaCost ?? '';
        const colors = new Set([...mc].filter((ch) => 'WUBRG'.includes(ch)));
        const label =
          colors.size === 0
            ? 'Colorless'
            : colors.size > 1
              ? 'Multicolor'
              : colors.has('W')
                ? 'White'
                : colors.has('U')
                  ? 'Blue'
                  : colors.has('B')
                    ? 'Black'
                    : colors.has('R')
                      ? 'Red'
                      : 'Green';
        byColor.get(label)!.push(c);
      }
      return colorOrder
        .filter((label) => (byColor.get(label)?.length ?? 0) > 0)
        .map((label) => {
          const cards = byColor.get(label)!;
          return {
            label,
            key: `color-${label}`,
            cards,
            totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
          };
        });
    }

    if (this.sortMode === 'color-identity') {
      const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      const ciLabel = (ci: ManaColor[]): string => {
        if (ci.length === 0) return 'Colorless';
        if (ci.length > 1) return 'Multicolor';
        const map: Partial<Record<ManaColor, string>> = {
          [ManaColor.White]: 'White',
          [ManaColor.Blue]: 'Blue',
          [ManaColor.Black]: 'Black',
          [ManaColor.Red]: 'Red',
          [ManaColor.Green]: 'Green',
        };
        return map[ci[0]] ?? 'Colorless';
      };
      const byColor = new Map<string, CollectionCardDto[]>();
      for (const label of colorOrder) byColor.set(label, []);
      for (const c of filtered) {
        const label = ciLabel(c.cardDetails?.colorIdentity ?? []);
        byColor.get(label)!.push(c);
      }
      return colorOrder
        .filter((label) => (byColor.get(label)?.length ?? 0) > 0)
        .map((label) => {
          const cards = byColor.get(label)!;
          return {
            label,
            key: `ci-${label}`,
            cards,
            totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
          };
        });
    }

    if (this.sortMode === 'rarity') {
      const rarityOrder = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];
      const rarityLabel: Record<string, string> = {
        mythic: 'Mythic Rare',
        rare: 'Rare',
        uncommon: 'Uncommon',
        common: 'Common',
        special: 'Special',
        bonus: 'Bonus',
      };
      const byRarity = new Map<string, CollectionCardDto[]>();
      for (const c of filtered) {
        const r = c.cardDetails?.rarity ?? 'unknown';
        if (!byRarity.has(r)) byRarity.set(r, []);
        byRarity.get(r)!.push(c);
      }
      const known = rarityOrder.filter((r) => byRarity.has(r));
      const other = [...byRarity.keys()].filter((r) => !rarityOrder.includes(r)).sort();
      return [...known, ...other].map((r) => {
        const cards = byRarity.get(r)!;
        return {
          label: rarityLabel[r] ?? r,
          key: `rarity-${r}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        };
      });
    }

    if (this.sortMode === 'artist') {
      const byArtist = new Map<string, CollectionCardDto[]>();
      for (const c of filtered) {
        const artist = c.cardDetails?.artist ?? 'Unknown';
        if (!byArtist.has(artist)) byArtist.set(artist, []);
        byArtist.get(artist)!.push(c);
      }
      const keys = [...byArtist.keys()].sort((a, b) => a.localeCompare(b));
      return keys.map((artist) => {
        const cards = byArtist.get(artist)!;
        return {
          label: artist,
          key: `artist-${artist}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        };
      });
    }

    if (this.sortMode === 'set') {
      const bySet = new Map<string, CollectionCardDto[]>();
      for (const c of filtered) {
        const set = (c.cardDetails?.setCode ?? 'unknown').toUpperCase();
        if (!bySet.has(set)) bySet.set(set, []);
        bySet.get(set)!.push(c);
      }
      const keys = [...bySet.keys()].sort((a, b) => a.localeCompare(b));
      return keys.map((set) => {
        const cards = bySet.get(set)!;
        return {
          label: set,
          key: `set-${set}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        };
      });
    }

    if (this.sortMode === 'creature-split') {
      const cmcSort = (a: CollectionCardDto, b: CollectionCardDto) =>
        (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0) ||
        (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? '');
      const creatures = filtered
        .filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Creature) && !this.isLand(c))
        .sort(cmcSort);
      const nonCreatures = filtered
        .filter((c) => !c.cardDetails?.cardTypes?.includes(CardType.Creature) && !this.isLand(c))
        .sort(cmcSort);
      const lands = filtered
        .filter((c) => this.isLand(c))
        .sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
      const groups: CmcGroup[] = [];
      if (creatures.length)
        groups.push({
          label: 'Creatures',
          key: 'split-creatures',
          cards: creatures,
          totalCount: creatures.reduce((s, c) => s + this.cardCount(c), 0),
        });
      if (nonCreatures.length)
        groups.push({
          label: 'Non-Creatures',
          key: 'split-noncreatures',
          cards: nonCreatures,
          totalCount: nonCreatures.reduce((s, c) => s + this.cardCount(c), 0),
        });
      if (lands.length)
        groups.push({
          label: 'Lands',
          key: 'split-lands',
          cards: lands,
          totalCount: lands.reduce((s, c) => s + this.cardCount(c), 0),
        });
      return groups;
    }

    // CMC
    const nonLands = filtered
      .filter((c) => !this.isLand(c))
      .sort(
        (a, b) =>
          (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0) ||
          (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''),
      );
    const lands = filtered
      .filter((c) => this.isLand(c))
      .sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));

    const groups: CmcGroup[] = [];
    const buckets = new Map<string, CollectionCardDto[]>();
    for (const c of nonLands) {
      const key =
        (c.cardDetails?.manaValue ?? 0) >= 6 ? '6+' : String(c.cardDetails?.manaValue ?? 0);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    for (const key of ['0', '1', '2', '3', '4', '5', '6+']) {
      const cards = buckets.get(key);
      if (cards?.length)
        groups.push({
          label: key === '6+' ? 'CMC 6+' : `CMC ${key}`,
          key: `cmc-${key}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        });
    }
    if (lands.length)
      groups.push({
        label: 'Lands',
        key: 'lands',
        cards: lands,
        totalCount: lands.reduce((s, c) => s + this.cardCount(c), 0),
      });
    return groups;
  }

  /**
   * The display order for one stack, derived from the saved arrangement and the
   * cards currently visible. Pure with respect to `stackOrders`: the saved order is
   * only ever written by an explicit drag. The old version wrote the reconciled
   * order back on every change-detection pass, so filtering the deck (which shrinks
   * `cards`) permanently deleted the hidden ids — clearing the filter dumped the
   * user's arrangement.
   */
  private deriveStackOrder(groupKey: string, cards: CollectionCardDto[]): string[] {
    const quota = new Map<string, number>(cards.map((c) => [c.id, this.cardCount(c)]));
    const used = new Map<string, number>();
    const kept: string[] = [];
    for (const id of this.stackOrders.get(groupKey) ?? []) {
      const u = used.get(id) ?? 0;
      if (u < (quota.get(id) ?? 0)) {
        kept.push(id);
        used.set(id, u + 1);
      }
    }
    // Slots for cards beyond the saved arrangement (new cards, raised quantities)
    // go to the visual top.
    for (const [id, q] of quota) {
      for (let i = used.get(id) ?? 0; i < q; i++) kept.unshift(id);
    }
    return kept;
  }

  getStackCards(groupKey: string, cards: CollectionCardDto[]): CollectionCardDto[] {
    const derived = this.deriveStackOrder(groupKey, cards);
    // Render cache, not state: drag indices refer to what was displayed.
    this.displayedStackOrders.set(groupKey, derived);
    return derived
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is CollectionCardDto => c != null);
  }

  onStackPointerDown(
    groupKey: string,
    idx: number,
    card: CollectionCardDto,
    event: PointerEvent,
  ): void {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const cardEl = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startY = event.clientY;
    let lastX = startX;
    let lastY = startY;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let overCommander = false;

    const d = card.cardDetails;
    const isCommanderEligible =
      !!d &&
      (d.supertypes?.includes('Legendary') ?? false) &&
      ((d.cardTypes?.includes(CardType.Creature) ?? false) ||
        (d.cardTypes?.includes(CardType.Planeswalker) ?? false));

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const finish = (drop: boolean) => {
      ghost?.remove();
      ghost = null;
      if (dragging && drop) {
        if (overCommander && isCommanderEligible) {
          this.deck$.pipe(take(1)).subscribe((deck) => {
            if (deck) this.setCommander(card.oracleId, deck);
          });
        } else {
          const srcIdx = this.stackDragFromIdx;
          const dstIdx = this.stackDragOverIdx;
          if (srcIdx != null && dstIdx != null && srcIdx !== dstIdx) {
            // Drag indices are positions in the DISPLAYED order (which may differ
            // from the saved one when a filter hides cards). Apply the move there,
            // then keep any hidden ids so they aren't lost when the filter clears.
            const displayed = [
              ...(this.displayedStackOrders.get(groupKey) ?? this.stackOrders.get(groupKey) ?? []),
            ];
            const [moved] = displayed.splice(srcIdx, 1);
            displayed.splice(dstIdx, 0, moved);
            const shown = new Map<string, number>();
            for (const id of displayed) shown.set(id, (shown.get(id) ?? 0) + 1);
            const hidden: string[] = [];
            for (const id of this.stackOrders.get(groupKey) ?? []) {
              const n = shown.get(id) ?? 0;
              if (n > 0) shown.set(id, n - 1);
              else hidden.push(id);
            }
            this.stackOrders.set(groupKey, [...displayed, ...hidden]);
          }
        }
      }
      document.body.style.removeProperty('cursor');
      this.stackDragGroupKey = null;
      this.stackDragFromIdx = null;
      this.stackDragOverIdx = null;
      if (this.cpSlotDragOver) {
        this.cpSlotDragOver = false;
      }
      if (dragging) this.cdr.markForCheck();
    };

    /** Where a released ghost should glide: the insertion gap, or home when there is none. */
    const settlePoint = (): { x: number; y: number } | null => {
      // A commander drop gets the slot's own bump; the shrink-out exit fits there.
      if (overCommander && isCommanderEligible) return null;
      const springBack = () => {
        const r = (cardEl.querySelector('.visual-art') ?? cardEl).getBoundingClientRect();
        return { x: r.left, y: r.top };
      };
      const dst = this.stackDragOverIdx;
      if (dst == null) return springBack();
      const listEl = document.querySelector<HTMLElement>(
        `.visual-stack[data-group-key="${groupKey}"]`,
      );
      if (!listEl) return springBack();
      const others = Array.from(
        listEl.querySelectorAll<HTMLElement>('.visual-card:not(.is-stack-dragging)'),
      );
      if (others.length === 0) {
        const r = listEl.getBoundingClientRect();
        return { x: r.left, y: r.top };
      }
      if (dst < others.length) {
        const r = others[dst].getBoundingClientRect();
        return { x: r.left, y: r.top - 6 };
      }
      const r = others[others.length - 1].getBoundingClientRect();
      return { x: r.left, y: r.bottom + 4 };
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        dragging = true;
        this.stackDragGroupKey = groupKey;
        this.stackDragFromIdx = idx;
        document.body.style.setProperty('cursor', 'grabbing', 'important');
        ({ ghost, grabOffsetX, grabOffsetY } = this.createDragGhost(cardEl, startX, startY));
        this.cdr.markForCheck();
      }

      lastX = e.clientX;
      lastY = e.clientY;
      if (ghost)
        ghost.style.transform = `translate3d(${e.clientX - grabOffsetX}px,${e.clientY - grabOffsetY}px,0) rotate(2deg) scale(1.04)`;

      // Check hover over commander slot (only relevant for eligible cards in commander decks)
      if (isCommanderEligible) {
        const cpEl = document.querySelector<HTMLElement>('.cp-portrait-wrap');
        if (cpEl) {
          const r = cpEl.getBoundingClientRect();
          const nowOver =
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom;
          if (nowOver !== overCommander) {
            overCommander = nowOver;
            this.cpSlotDragOver = nowOver;
            this.cdr.markForCheck();
          }
          if (nowOver) return; // don't update stack hover while over commander slot
        }
      }

      const listEl = document.querySelector<HTMLElement>(
        `.visual-stack[data-group-key="${groupKey}"]`,
      );
      if (!listEl) return;
      const cards = Array.from(
        listEl.querySelectorAll<HTMLElement>('.visual-card:not(.is-stack-dragging)'),
      );
      let dstIdx = cards.length;
      if (this.groupDir === 'v') {
        // Horizontal wrapping layout — find insert point by 2-D position
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          if (e.clientY < r.top) {
            dstIdx = i;
            break;
          }
          if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) {
            dstIdx = i;
            break;
          }
        }
      } else {
        // Vertical stack layout — Y position check
        for (let i = 0; i < cards.length; i++) {
          if (e.clientY < cards[i].getBoundingClientRect().top + 16) {
            dstIdx = i;
            break;
          }
        }
      }
      if (this.stackDragOverIdx !== dstIdx) {
        this.stackDragOverIdx = dstIdx;
        this.rafCheck();
      }
    };

    const onUp = () => {
      detach();
      if (dragging) this.armClickSuppression();
      if (!(dragging && ghost)) {
        finish(true);
        return;
      }
      const g = ghost;
      ghost = null;
      const to = settlePoint();
      if (to) {
        this.glideGhostTo(g, to.x, to.y, () => {
          g.remove();
          finish(true);
        });
      } else {
        this.animateGhostDrop(g, lastX, lastY, grabOffsetX, grabOffsetY, () => {
          g.remove();
          finish(true);
        });
      }
    };
    const onCancel = () => {
      detach();
      if (dragging) this.armClickSuppression();
      if (dragging && ghost) {
        const g = ghost;
        ghost = null;
        const r = (cardEl.querySelector('.visual-art') ?? cardEl).getBoundingClientRect();
        this.glideGhostTo(g, r.left, r.top, () => {
          g.remove();
          finish(false);
        });
      } else {
        finish(false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  trackByIdx(index: number): number {
    return index;
  }
  trackByGroupKey(_index: number, group: CmcGroup): string {
    return group.key;
  }

  getOrderedListCards(groupKey: string, cards: CollectionCardDto[]): CollectionCardDto[] {
    const order = this.listOrders.get(groupKey);
    if (!order) return cards;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((c): c is CollectionCardDto => c != null);
    const inOrder = new Set(order);
    const rest = cards.filter((c) => !inOrder.has(c.id));
    return [...ordered, ...rest];
  }

  onListCardPointerDown(
    groupKey: string,
    idx: number,
    card: CollectionCardDto,
    event: PointerEvent,
    allCards: CollectionCardDto[],
  ): void {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const cardEl = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const finish = (drop: boolean) => {
      ghost?.remove();
      ghost = null;
      if (dragging && drop) {
        const src = this.listDragFromIdx;
        const dst = this.listDragOverIdx;
        if (src != null && dst != null && src !== dst) {
          if (!this.listOrders.has(groupKey))
            this.listOrders.set(
              groupKey,
              allCards.map((c) => c.id),
            );
          const ids = [...this.listOrders.get(groupKey)!];
          const [moved] = ids.splice(src, 1);
          ids.splice(dst > src ? dst - 1 : dst, 0, moved);
          this.listOrders.set(groupKey, ids);
        }
      }
      document.body.style.removeProperty('cursor');
      this.listDragGroupKey = null;
      this.listDragFromIdx = null;
      this.listDragOverIdx = null;
      if (dragging) this.cdr.markForCheck();
    };

    /** The active drop-line is the landing point; no line means spring back home. */
    const settlePoint = (g: HTMLElement): { x: number; y: number } => {
      const dst = this.listDragOverIdx;
      const listEl = document.querySelector<HTMLElement>(
        `.list-drag-group[data-group-key="${groupKey}"]`,
      );
      if (dst != null && listEl) {
        const line = listEl.querySelectorAll<HTMLElement>('.drop-line')[dst];
        if (line) {
          const r = line.getBoundingClientRect();
          return { x: r.left + 8, y: r.top - g.getBoundingClientRect().height / 2 };
        }
      }
      const r = cardEl.getBoundingClientRect();
      return { x: r.left, y: r.top };
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        dragging = true;
        this.listDragGroupKey = groupKey;
        this.listDragFromIdx = idx;
        document.body.style.setProperty('cursor', 'grabbing', 'important');
        ({ ghost, grabOffsetX, grabOffsetY } = this.createDragGhost(cardEl, startX, startY));
        this.cdr.markForCheck();
      }
      if (ghost)
        ghost.style.transform = `translate3d(${e.clientX - grabOffsetX}px,${e.clientY - grabOffsetY}px,0) rotate(2deg) scale(1.04)`;
      const listEl = document.querySelector<HTMLElement>(
        `.list-drag-group[data-group-key="${groupKey}"]`,
      );
      if (!listEl) return;
      const rows = Array.from(
        listEl.querySelectorAll<HTMLElement>('.list-drag-row:not(.is-list-dragging)'),
      );
      let dstIdx = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          dstIdx = i;
          break;
        }
      }
      if (this.listDragOverIdx !== dstIdx) {
        this.listDragOverIdx = dstIdx;
        this.rafCheck();
      }
    };

    const onUp = () => {
      detach();
      if (dragging) this.armClickSuppression();
      if (!(dragging && ghost)) {
        finish(true);
        return;
      }
      const g = ghost;
      ghost = null;
      const to = settlePoint(g);
      this.glideGhostTo(g, to.x, to.y, () => {
        g.remove();
        finish(true);
      });
    };
    const onCancel = () => {
      detach();
      if (dragging && ghost) {
        const g = ghost;
        ghost = null;
        const r = cardEl.getBoundingClientRect();
        this.glideGhostTo(g, r.left, r.top, () => {
          g.remove();
          finish(false);
        });
      } else {
        finish(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  filteredCards(deck: DeckDetailDto): CollectionCardDto[] {
    const board = this.activeBoard;
    let cards = deck.cards.filter((c) => (c.board ?? 'main') === board);
    if (board === 'main' && deck.commanderOracleId) {
      cards = cards.filter((c) => c.oracleId !== deck.commanderOracleId);
    }

    if (this.filterQuery.trim()) {
      const q = this.filterQuery.toLowerCase();
      cards = cards.filter((c) => c.cardDetails?.name.toLowerCase().includes(q));
    }

    return cards;
  }

  boardCount(deck: DeckDetailDto, board: 'main' | 'side' | 'maybe'): number {
    return deck.cards
      .filter((c) => (c.board ?? 'main') === board)
      .reduce((s, c) => s + c.quantity + c.quantityFoil, 0);
  }

  getDeckStats(deck: DeckDetailDto): DeckStats {
    const cards = deck.cards.filter((c) => (c.board ?? 'main') === 'main');
    const total = cards.reduce((s, c) => s + this.cardCount(c), 0);
    const countOf = (type: CardType) =>
      cards
        .filter((c) => c.cardDetails?.cardTypes?.includes(type))
        .reduce((s, c) => s + this.cardCount(c), 0);

    const lands = countOf(CardType.Land);
    const creatures = countOf(CardType.Creature);
    const instants = countOf(CardType.Instant);
    const sorceries = countOf(CardType.Sorcery);
    const enchantments = countOf(CardType.Enchantment);
    const artifacts = countOf(CardType.Artifact);
    const planeswalkers = countOf(CardType.Planeswalker);
    const other = Math.max(
      0,
      total - lands - creatures - instants - sorceries - enchantments - artifacts - planeswalkers,
    );

    const nonLandCards = cards.filter((c) => !this.isLand(c));
    const totalNL = nonLandCards.reduce((s, c) => s + this.cardCount(c), 0);
    const avgCmcSum = nonLandCards.reduce(
      (s, c) => s + (c.cardDetails?.manaValue ?? 0) * this.cardCount(c),
      0,
    );
    const avgCmc = totalNL > 0 ? Math.round((avgCmcSum / totalNL) * 10) / 10 : 0;

    const curveData = new Map<number, number>();
    for (const c of nonLandCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      curveData.set(cmc, (curveData.get(cmc) ?? 0) + this.cardCount(c));
    }
    const curve = [1, 2, 3, 4, 5, 6, 7].map((cmc) => ({
      cmc,
      count: curveData.get(cmc) ?? 0,
      label: cmc === 7 ? '7+' : String(cmc),
    }));
    const curveMax = Math.max(...curve.map((b) => b.count), 1);

    const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];
    const ALL_COLORS_C = [...ALL_COLORS, 'C'];

    // Mana pip breakdown across all non-land costs
    const pipCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const c of nonLandCards) {
      const cost = c.cardDetails?.manaCost ?? '';
      if (!cost) continue;
      const re = /\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cost)) !== null) {
        const sym = m[1].toUpperCase();
        if (sym.includes('/')) {
          const parts = sym
            .split('/')
            .filter((p) => Object.prototype.hasOwnProperty.call(pipCounts, p));
          if (parts.length > 0)
            for (const p of parts) pipCounts[p] += this.cardCount(c) / parts.length;
        } else if (Object.prototype.hasOwnProperty.call(pipCounts, sym)) {
          pipCounts[sym] += this.cardCount(c);
        }
      }
    }
    const manaPips = ALL_COLORS_C.map((color) => ({
      color,
      count: Math.round(pipCounts[color] * 10) / 10,
    })).filter((p) => p.count > 0);

    // Mana production — parse oracle text for "add {X}" patterns
    const prodCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const c of cards) {
      const text = c.cardDetails?.oracleText ?? '';
      if (!text.toLowerCase().includes('add')) continue;
      const qty = this.cardCount(c);
      if (/add (?:one mana of any color|mana of any color|any amount of mana of any)/i.test(text)) {
        for (const col of ALL_COLORS) prodCounts[col] += qty;
        continue;
      }
      const addRe = /add[^.;\n]*?\{([^}]+)\}/gi;
      let am: RegExpExecArray | null;
      while ((am = addRe.exec(text)) !== null) {
        const sym = am[1].toUpperCase();
        if (sym.includes('/')) {
          const parts = sym
            .split('/')
            .filter((p) => Object.prototype.hasOwnProperty.call(prodCounts, p));
          for (const p of parts) prodCounts[p] += qty;
        } else if (Object.prototype.hasOwnProperty.call(prodCounts, sym)) {
          prodCounts[sym] += qty;
        }
      }
    }
    const manaProduction = ALL_COLORS_C.map((color) => ({
      color,
      count: prodCounts[color],
    })).filter((p) => p.count > 0);

    // Creature subtypes (top 10 by count)
    const creatureSubMap = new Map<string, number>();
    for (const c of cards.filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Creature))) {
      const qty = this.cardCount(c);
      for (const sub of c.cardDetails?.subtypes ?? []) {
        creatureSubMap.set(sub, (creatureSubMap.get(sub) ?? 0) + qty);
      }
    }
    const creatureSubtypes = [...creatureSubMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Land subtypes
    const landSubMap = new Map<string, number>();
    for (const c of cards.filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Land))) {
      const qty = this.cardCount(c);
      for (const sub of c.cardDetails?.subtypes ?? []) {
        landSubMap.set(sub, (landSubMap.get(sub) ?? 0) + qty);
      }
    }
    const landSubtypes = [...landSubMap.entries()]
      .map(([name, count]) => ({
        name,
        count,
        deckCard:
          cards.find(
            (c) =>
              c.cardDetails?.cardTypes?.includes(CardType.Land) &&
              c.cardDetails?.subtypes?.includes(name),
          ) ?? null,
      }))
      .sort((a, b) => b.count - a.count);

    // Tokens needed — deduplicated list of token types this deck creates
    const tokenMap = new Map<string, { description: string; creatorCard: CollectionCardDto }>();
    for (const c of cards) {
      const text = c.cardDetails?.oracleText ?? '';
      const tokenRe =
        /create (?:a|an|one|two|three|four|five|\d+|X|that many) ([^.•\n]+?) tokens?/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tokenRe.exec(text)) !== null) {
        const description = tm[1].trim();
        const tokenName = description
          .replace(/^\d+\/[\d*]+\s*/i, '')
          .replace(
            /\b(white|blue|black|red|green|colorless|legendary|aura|artifact|creature|enchantment|token)\b/gi,
            '',
          )
          .replace(/\s+/g, ' ')
          .trim();
        if (tokenName && !tokenMap.has(tokenName))
          tokenMap.set(tokenName, { description, creatorCard: c });
      }
    }
    const tokensNeeded = [...tokenMap.entries()].map(
      ([tokenName, { description, creatorCard }]) => ({ tokenName, description, creatorCard }),
    );

    // Emblem sources
    const emblemSources: DeckStats['emblemSources'] = cards
      .filter(
        (c) => (c.cardDetails?.oracleText ?? '').toLowerCase().includes('emblem') && c.cardDetails,
      )
      .map((c) => ({
        name: c.cardDetails!.name,
        imageUri: c.cardDetails!.imageUriSmall ?? null,
        manaCost: c.cardDetails!.manaCost ?? '',
        sourceCard: c,
      }));

    return {
      total,
      lands,
      creatures,
      instants,
      sorceries,
      enchantments,
      artifacts,
      planeswalkers,
      other,
      avgCmc,
      curve,
      curveMax,
      manaPips,
      manaProduction,
      creatureSubtypes,
      landSubtypes,
      tokensNeeded,
      emblemSources,
    };
  }

  // ---- Token image loading ----------------------------------

  private loadTokenImages(deck: DeckDetailDto): void {
    const stats = this.getDeckStats(deck);

    for (const { tokenName } of stats.tokensNeeded) {
      if (this.tokenCardCache.has(tokenName)) continue;
      this.tokenCardCache.set(tokenName, null);
      this.deckApi
        .getCardByName(tokenName)
        .pipe(takeUntil(this.destroy$))
        .subscribe((card) => {
          this.tokenCardCache.set(tokenName, card);
          this.cdr.markForCheck();
        });
    }

    for (const { name } of stats.landSubtypes) {
      if (this.landCardCache.has(name)) continue;
      this.landCardCache.set(name, null);
      this.deckApi
        .getCardByName(name)
        .pipe(takeUntil(this.destroy$))
        .subscribe((card) => {
          this.landCardCache.set(name, card);
          this.cdr.markForCheck();
        });
    }
  }

  // ---- Side panel / Search panel ----------------------------

  toggleSidePanel(): void {
    this.showSidePanel = !this.showSidePanel;
    this.cdr.markForCheck();
  }

  openSidePanel(tab: 'stats' | 'commander'): void {
    if (this.sideTab === tab && this.showSidePanel) {
      this.showSidePanel = false;
      this.cdr.markForCheck();
      return;
    }
    // In swap mode the search panel IS the board area — leave it alone.
    const hadAny =
      (!this.swapMode && this.showSearchPanel) ||
      this.showManaSuggestPanel ||
      this.showSuggestionsPanel ||
      this.showSidePanel;
    if (!this.swapMode) this.showSearchPanel = false;
    this.showManaSuggestPanel = false;
    this.showSuggestionsPanel = false;
    this.showSidePanel = false;
    this.cdr.markForCheck();
    const open = () => {
      this.sideTab = tab;
      this.showSidePanel = true;
      this.cdr.markForCheck();
    };
    if (hadAny) {
      setTimeout(open, 300);
    } else {
      open();
    }
  }

  private switchRightPanel(openFn: () => void): void {
    // In swap mode the search panel IS the board area — leave it alone.
    const hasOpen =
      (!this.swapMode && this.showSearchPanel) ||
      this.showManaSuggestPanel ||
      this.showSuggestionsPanel ||
      this.showSidePanel;
    if (!this.swapMode) this.showSearchPanel = false;
    this.showManaSuggestPanel = false;
    this.showSuggestionsPanel = false;
    this.showSidePanel = false;
    this.cdr.markForCheck();
    if (hasOpen) {
      setTimeout(openFn, 300);
    } else {
      openFn();
    }
  }

  toggleSearchPanel(): void {
    if (this.showSearchPanel) {
      this.showSearchPanel = false;
      this.commanderSearchMode = false;
      this.cdr.markForCheck();
      return;
    }
    this.switchRightPanel(() => {
      this.showSearchPanel = true;
      this.cdr.markForCheck();
    });
  }

  // ---- Swap mode (Arena-style) ----------------------------------
  //
  // Swaps the two surfaces: the search browser takes over the board area and the deck
  // collapses into a compact side list on the right. The search panel stays open for the
  // whole time — its close button exits swap mode instead of leaving an empty board.

  toggleSwapMode(): void {
    this.swapMode = !this.swapMode;
    if (this.swapMode) {
      this.showManaSuggestPanel = false;
      this.showSuggestionsPanel = false;
      this.showSidePanel = false;
      this.showSearchPanel = true;
    } else {
      this.showSearchPanel = false;
      this.commanderSearchMode = false;
    }
    localStorage.setItem('deck-swap-mode', this.swapMode ? '1' : '0');
    this.cdr.markForCheck();
  }

  onSearchPanelClose(): void {
    if (this.swapMode) this.toggleSwapMode();
    else this.toggleSearchPanel();
  }

  /**
   * The header Add Cards button. In swap mode the search panel IS the board, so
   * "Close" there means leaving build mode, not stranding an empty board area.
   */
  onAddCardsClick(): void {
    if (this.swapMode) this.toggleSwapMode();
    else this.toggleSearchPanel();
  }

  /**
   * The active board's cards for the side list, cheapest-first then by name. Memoized
   * against the inputs that can change it — this component's mousemove listeners run
   * change detection constantly, and a fresh array every pass would defeat the list's trackBy.
   */
  private sideListMemo: {
    deck: DeckDetailDto;
    board: string;
    result: CollectionCardDto[];
  } | null = null;

  sideListCards(deck: DeckDetailDto): CollectionCardDto[] {
    const m = this.sideListMemo;
    if (m && m.deck === deck && m.board === this.activeBoard) return m.result;
    let cards = deck.cards.filter((c) => this.boardOf(c) === this.activeBoard);
    if (this.activeBoard === 'main' && deck.commanderOracleId) {
      cards = cards.filter((c) => c.oracleId !== deck.commanderOracleId);
    }
    const result = [...cards].sort((a, b) => {
      const cmcA = a.cardDetails?.manaValue ?? 0;
      const cmcB = b.cardDetails?.manaValue ?? 0;
      if (cmcA !== cmcB) return cmcA - cmcB;
      return (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? '');
    });
    this.sideListMemo = { deck, board: this.activeBoard, result };
    return result;
  }

  toggleManaSuggestPanel(): void {
    if (this.showManaSuggestPanel) {
      this.showManaSuggestPanel = false;
      this.cdr.markForCheck();
      return;
    }
    this.switchRightPanel(() => {
      this.showManaSuggestPanel = true;
      this.cdr.markForCheck();
    });
  }

  toggleSuggestionsPanel(): void {
    if (this.showSuggestionsPanel) {
      this.showSuggestionsPanel = false;
      this.cdr.markForCheck();
      return;
    }
    this.switchRightPanel(() => {
      this.showSuggestionsPanel = true;
      this.cdr.markForCheck();
    });
  }

  openCommanderSearch(): void {
    this.commanderSearchMode = true;
    this.switchRightPanel(() => {
      this.showSearchPanel = true;
      this.cdr.markForCheck();
    });
  }

  // ---- Tile info overlay ---------------------------------------
  //
  // Single click toggles the card-description overlay on a tile; double click opens
  // the card modal (its two leading clicks toggle the overlay on and off again, so no
  // click-delay timer is needed). A drag arms a one-tick click suppression so the
  // click that browsers fire after pointerup never toggles anything.

  tileInfoKey: string | null = null;
  private suppressTileClick = false;
  private lastTileClick: { key: string; time: number } | null = null;

  /** Swallow the single click the browser dispatches right after a drag's pointerup. */
  private armClickSuppression(): void {
    this.suppressTileClick = true;
    // The post-drag click (if any) fires synchronously after pointerup; clear on the
    // next macrotask so an unrelated later click is never eaten.
    setTimeout(() => (this.suppressTileClick = false));
  }

  onTileClick(card: CollectionCardDto, slotKey: string, e: MouseEvent): void {
    e.stopPropagation();
    if (this.suppressTileClick) return;
    // Double-click detection from the click stream itself: the drag handler's
    // preventDefault on pointerdown makes the native dblclick event unreliable.
    const now = performance.now();
    if (this.lastTileClick?.key === slotKey && now - this.lastTileClick.time < 350) {
      this.lastTileClick = null;
      this.tileInfoKey = null;
      this.openCard(card, slotKey);
      return;
    }
    this.lastTileClick = { key: slotKey, time: now };
    this.tileInfoKey = this.tileInfoKey === slotKey ? null : slotKey;
    this.cdr.markForCheck();
  }

  /** List rows keep single-click-to-open, but never from the click a drag leaves behind. */
  onListRowClick(card: CollectionCardDto): void {
    if (this.suppressTileClick) return;
    this.openCard(card);
  }

  /** Briefly set to the board whose tab just received a card, driving its bump animation. */
  bumpedBoard: 'main' | 'side' | 'maybe' | null = null;
  private boardBumpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Pulses a board tab to acknowledge its count ticking up. */
  private bumpBoardTab(board: 'main' | 'side' | 'maybe'): void {
    this.bumpedBoard = board;
    this.cdr.markForCheck();
    if (this.boardBumpTimer) clearTimeout(this.boardBumpTimer);
    // Must outlast the board-tab bump animation so the class is not removed mid-play.
    this.boardBumpTimer = setTimeout(() => {
      this.bumpedBoard = null;
      this.boardBumpTimer = null;
      this.cdr.markForCheck();
    }, 500);
  }

  /**
   * A landing target must actually be laid out on screen. Elements inside a collapsed
   * side panel stay in the DOM with a degenerate rect — flying a ghost "there" strands it
   * mid-screen.
   */
  private visibleRect(el: Element | null): DOMRect | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? r : null;
  }

  /**
   * Animates an add into the target board's tab. With a flight source the card's ghost
   * flies there and the tab bumps as it lands; without one — drag-and-drop, where the drag
   * itself was the motion — the tab just bumps. The tabs are hidden in free layout mode;
   * both parts quietly skip when there is nowhere to land.
   */
  private flyIntoBoard(
    flight: FlightSource | undefined,
    board: 'main' | 'side' | 'maybe',
    oracleId?: string,
  ): void {
    const idx = board === 'main' ? 0 : board === 'side' ? 1 : 2;
    // Swap mode: land on the card's own side-list row (pulsing it), falling back to the
    // mini board tab in the list header when the row does not exist yet.
    if (this.swapMode) {
      const row = oracleId
        ? this.visibleRect(
            this.host.nativeElement.querySelector(`.side-list-row[data-oracle-id="${oracleId}"]`),
          )
        : null;
      const to =
        row ?? this.visibleRect(this.host.nativeElement.querySelectorAll('.swap-tab')[idx]);
      if (!to) return;
      const land = () => {
        if (row && oracleId) this.sideList?.pulse(oracleId);
        else this.bumpBoardTab(board);
      };
      if (!flight) {
        land();
        return;
      }
      flyCardGhost({ from: flight.from, to, imageUrl: flight.imageUrl }).then(land);
      return;
    }
    const to = this.visibleRect(this.host.nativeElement.querySelectorAll('.board-tab')[idx]);
    if (!to) return;
    if (!flight) {
      this.bumpBoardTab(board);
      return;
    }
    flyCardGhost({ from: flight.from, to, imageUrl: flight.imageUrl }).then(() =>
      this.bumpBoardTab(board),
    );
  }

  /** The board a deck card lives on, normalized for tab lookups. */
  private boardOf(card: CollectionCardDto): 'main' | 'side' | 'maybe' {
    return card.board === 'side' || card.board === 'maybe' ? card.board : 'main';
  }

  /** Briefly true while the commander target (portrait or header button) plays its bump. */
  commanderBumped = false;
  private commanderBumpTimer: ReturnType<typeof setTimeout> | null = null;

  private bumpCommanderTarget(): void {
    this.commanderBumped = true;
    this.cdr.markForCheck();
    if (this.commanderBumpTimer) clearTimeout(this.commanderBumpTimer);
    this.commanderBumpTimer = setTimeout(() => {
      this.commanderBumped = false;
      this.commanderBumpTimer = null;
      this.cdr.markForCheck();
    }, 500);
  }

  /**
   * Commander pick: the card flies to the commander portrait when it is visibly on screen,
   * else to the header Commander button (the search panel replaces the side panel mid-pick,
   * and the collapsed panel keeps the portrait in the DOM with a useless rect — hence the
   * visibility check, not a bare querySelector). No flight source (a drop on the slot) →
   * just the bump.
   */
  private flyToCommander(flight?: FlightSource): void {
    const to =
      this.visibleRect(this.host.nativeElement.querySelector('.cp-portrait-wrap')) ??
      this.visibleRect(this.host.nativeElement.querySelector('.tool-btn--cmdr'));
    if (!to) return;
    if (!flight) {
      this.bumpCommanderTarget();
      return;
    }
    flyCardGhost({ from: flight.from, to, imageUrl: flight.imageUrl }).then(() =>
      this.bumpCommanderTarget(),
    );
  }

  onPanelCardAdd(event: {
    oracleId: string;
    scryfallId: string;
    isCommanderEligible?: boolean;
    flight?: FlightSource;
  }): void {
    // A commander pick lands on the commander slot, not the board tab.
    if (this.commanderSearchMode && event.isCommanderEligible) this.flyToCommander(event.flight);
    else this.flyIntoBoard(event.flight, this.activeBoard, event.oracleId);
    this.store.dispatch(
      DeckActions.addCard({
        deckId: this.deckId,
        request: {
          oracleId: event.oracleId,
          quantity: 1,
          scryfallId: event.scryfallId,
          board: this.activeBoard,
        },
      }),
    );
    if (this.commanderSearchMode) {
      if (event.isCommanderEligible) {
        this.deck$.pipe(take(1)).subscribe((deck) => {
          if (deck) this.setCommander(event.oracleId, deck);
        });
      }
      this.commanderSearchMode = false;
      // In swap mode the panel is the board area; it stays open after a commander pick.
      if (!this.swapMode) this.showSearchPanel = false;
    }
  }

  onFitRequested(event: { card: CardDto; commanderCard: CardDto }): void {
    const { card, commanderCard } = event;

    const isColorViolation =
      identityViolations(card.colorIdentity, commanderCard.colorIdentity).length > 0;

    if (isColorViolation) {
      this.searchPanel?.setSynergyScore(card.oracleId, {
        score: 0,
        reason: `Color identity violation — cannot be played in a ${commanderCard.name} deck.`,
      });
      return;
    }

    this.deck$
      .pipe(
        take(1),
        switchMap((deck) => {
          const deckCardNames = (deck?.cards ?? [])
            .filter(
              (c) =>
                c.cardDetails?.oracleId !== card.oracleId &&
                c.cardDetails?.oracleId !== commanderCard.oracleId,
            )
            .map((c) => c.cardDetails?.name)
            .filter((n): n is string => !!n);

          return this.deckApi.analyzeSynergy({
            commanderOracleId: commanderCard.oracleId,
            commanderName: commanderCard.name,
            commanderText: commanderCard.oracleText,
            cardOracleId: card.oracleId,
            cardName: card.name,
            cardText: card.oracleText,
            deckCardNames,
          });
        }),
        takeUntil(this.destroy$),
        catchError(() => of({ score: 0, reason: 'Failed to get synergy score.' })),
      )
      .subscribe((result) => {
        this.searchPanel?.setSynergyScore(card.oracleId, result);
      });
  }

  addSuggestedCard(event: { oracleId: string; scryfallId: string; flight?: FlightSource }): void {
    // Suggestions always add to the main board, wherever the active tab happens to be.
    this.flyIntoBoard(event.flight, 'main', event.oracleId);
    this.store.dispatch(
      DeckActions.addCard({
        deckId: this.deckId,
        request: {
          oracleId: event.oracleId,
          scryfallId: event.scryfallId,
          quantity: 1,
          quantityFoil: 0,
        },
      }),
    );
  }

  removeSuggestedCard(oracleId: string): void {
    this.deck$.pipe(take(1)).subscribe((deck) => {
      const card = deck?.cards.find((c) => c.cardDetails?.oracleId === oracleId);
      if (card)
        this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
    });
  }

  // ---- Card quantity controls --------------------------------

  increment(card: CollectionCardDto): void {
    // No flight for another copy of a card already in the deck — the ghost communicates a
    // card traveling INTO the deck; a count change inside it just gets the tab bump.
    this.bumpBoardTab(this.boardOf(card));
    // Quantities come from the store at dispatch time, not the template binding:
    // the reducer applies updates optimistically, so rapid clicks each read the
    // value the previous click produced instead of racing on a stale snapshot.
    this.deck$.pipe(take(1)).subscribe((deck) => {
      const cur = deck?.cards.find((c) => c.id === card.id) ?? card;
      this.store.dispatch(
        DeckActions.updateCard({
          deckId: this.deckId,
          cardId: card.id,
          request: { quantity: cur.quantity + 1, quantityFoil: cur.quantityFoil },
        }),
      );
    });
  }

  decrement(card: CollectionCardDto): void {
    this.deck$.pipe(take(1)).subscribe((deck) => {
      // Fall back to the binding when the store doesn't know the card (it may not
      // have loaded the deck yet); the store copy wins when both exist.
      const cur = deck?.cards.find((c) => c.id === card.id) ?? card;
      if (this.cardCount(cur) <= 1) {
        this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: cur.id }));
      } else if (cur.quantity > 0) {
        this.store.dispatch(
          DeckActions.updateCard({
            deckId: this.deckId,
            cardId: cur.id,
            request: { quantity: cur.quantity - 1, quantityFoil: cur.quantityFoil },
          }),
        );
      } else {
        this.store.dispatch(
          DeckActions.updateCard({
            deckId: this.deckId,
            cardId: cur.id,
            request: { quantity: cur.quantity, quantityFoil: cur.quantityFoil - 1 },
          }),
        );
      }
    });
  }

  freeIncrement(card: CollectionCardDto, colId: string): void {
    const col = this.freeColumns.find((c) => c.id === colId);
    if (col) {
      col.cardIds.push(card.id);
      this.freeLayoutDirty = true;
    }
    this.increment(card);
    this.cdr.markForCheck();
  }

  freeDecrement(card: CollectionCardDto, colId: string): void {
    if (this.cardCount(card) <= 1) {
      for (const col of this.freeColumns) {
        const idx = col.cardIds.indexOf(card.id);
        if (idx !== -1) col.cardIds.splice(idx, 1);
      }
    } else {
      const col = this.freeColumns.find((c) => c.id === colId);
      if (col) {
        const idx = col.cardIds.lastIndexOf(card.id);
        if (idx !== -1) col.cardIds.splice(idx, 1);
      }
    }
    this.freeLayoutDirty = true;
    this.decrement(card);
    this.cdr.markForCheck();
  }

  // ---- Card modal --------------------------------------------

  openCard(card: CollectionCardDto, slotKey?: string): void {
    this.selectedCard = card;
    this.modalSlotKey = slotKey ?? null;
    this._modalFlipped = slotKey ? this.flippedCardIds.has(slotKey) : false;
    const cached = this.printings.cached(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) {
      this.printings
        .get(card.oracleId)
        .pipe(takeUntil(this.destroy$))
        .subscribe((printings) => {
          if (
            this.selectedCard?.oracleId === card.oracleId &&
            !this.modalViewScryfallId &&
            printings.length
          )
            this.modalViewScryfallId = printings[0].scryfallId;
          this.cdr.markForCheck();
        });
    }
    this.cdr.markForCheck();
  }

  closeCard(): void {
    this.selectedCard = null;
    this.modalSlotKey = null;
    this.cdr.markForCheck();
  }

  toggleTileFlip(slotKey: string, _card: CollectionCardDto, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedCardIds.has(slotKey)) this.flippedCardIds.delete(slotKey);
    else this.flippedCardIds.add(slotKey);
    if (this.modalSlotKey === slotKey) {
      this._modalFlipped = this.flippedCardIds.has(slotKey);
    }
    this.cdr.markForCheck();
  }

  tileImage(card: CollectionCardDto, slotKey: string): string | null {
    // Tiles render at a few hundred px — the "normal" scan is already larger than
    // that; "large" (672px) only wastes bandwidth here.
    const front = card.cardDetails?.imageUriNormal ?? card.cardDetails?.imageUriLarge ?? null;
    const back = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(slotKey) && back ? back : front;
  }

  /** ~60px list thumbnails need the small scan, not a full card image. */
  thumbImage(card: CollectionCardDto, slotKey: string): string | null {
    const front =
      card.cardDetails?.imageUriSmall ??
      card.cardDetails?.imageUriNormal ??
      card.cardDetails?.imageUriLarge ??
      null;
    const back = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(slotKey) && back ? back : front;
  }

  tileHasBack(card: CollectionCardDto): boolean {
    return !!card.cardDetails?.imageUriNormalBack;
  }

  getAlsoOwnedIds(deck: DeckDetailDto): string[] {
    if (!this.selectedCard) return [];
    return deck.cards
      .filter(
        (c) =>
          c.oracleId === this.selectedCard!.oracleId &&
          c.scryfallId &&
          c.scryfallId !== this.selectedCard!.scryfallId,
      )
      .map((c) => c.scryfallId!);
  }

  typeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  // ---- Rename -----------------------------------------------

  startRename(deck: DeckDetailDto): void {
    this.renameDraft = deck.name;
    this.isRenaming = true;
    this.cdr.markForCheck();
  }

  commitRename(deck: DeckDetailDto): void {
    const name = this.renameDraft.trim();
    if (name && name !== deck.name) {
      this.store.dispatch(
        DeckActions.updateDeckMeta({
          id: this.deckId,
          name,
          coverUri: deck.coverUri ?? null,
          format: deck.format ?? null,
          commanderOracleId: deck.commanderOracleId ?? null,
          tags: deck.tags ?? [],
        }),
      );
    }
    this.isRenaming = false;
    this.cdr.markForCheck();
  }

  cancelRename(): void {
    this.isRenaming = false;
    this.cdr.markForCheck();
  }

  addTag(deck: DeckDetailDto, tag: string): void {
    const t = tag.trim().toLowerCase();
    if (!t || (deck.tags ?? []).includes(t)) return;
    const tags = [...(deck.tags ?? []), t];
    this.saveTagToHistory(t);
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: deck.id,
        name: deck.name,
        coverUri: deck.coverUri ?? null,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
        tags,
      }),
    );
  }

  removeTag(deck: DeckDetailDto, tag: string): void {
    const tags = (deck.tags ?? []).filter((t) => t !== tag);
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: deck.id,
        name: deck.name,
        coverUri: deck.coverUri ?? null,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
        tags,
      }),
    );
  }

  commitTagInput(deck: DeckDetailDto): void {
    const tag = this.tagDraft.trim();
    if (tag) {
      this.addTag(deck, tag);
      this.tagDraft = '';
    }
  }

  // ---- Detail cover picker ----------------------------------

  openDetailCoverPicker(_deck: DeckDetailDto): void {
    this.showDetailCoverPicker = true;
    this.cdr.markForCheck();
  }

  closeDetailCoverPicker(): void {
    this.showDetailCoverPicker = false;
    this.cdr.markForCheck();
  }

  onDetailCoverSelected(deck: DeckDetailDto, uri: string | null): void {
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: this.deckId,
        name: deck.name,
        coverUri: uri,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
        tags: deck.tags ?? [],
      }),
    );
    this.closeDetailCoverPicker();
  }

  // ---- Format / Commander -------------------------------------------------

  showFormatMenu = false;
  showCommanderPicker = false;
  cpSlotDragOver = false;
  commanderSearchMode = false;
  aiBuilding = false;
  aiBuildResult: {
    cardsAdded: number;
    sideboardAdded: number;
    maybeboardAdded: number;
    cardsSkipped: number;
  } | null = null;
  aiBuildError: string | null = null;
  aiBuildBracket = 3;
  aiBuildPrice = 'any';
  aiBuildSideboard = false;
  aiBuildMaybeboard = false;

  notesDraft = '';
  private notesInitialized = false;

  toggleFormatMenu(): void {
    this.showFormatMenu = !this.showFormatMenu;
    this.cdr.markForCheck();
  }

  setFormat(format: string | null, deck: DeckDetailDto): void {
    this.showFormatMenu = false;
    if (format !== 'commander' && this.sideTab === 'commander' && this.showSidePanel) {
      this.showSidePanel = false;
    }
    // Clearing format also clears the commander
    const commanderOracleId = format === 'commander' ? (deck.commanderOracleId ?? null) : null;
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: this.deckId,
        name: deck.name,
        coverUri: deck.coverUri ?? null,
        format,
        commanderOracleId,
        tags: deck.tags ?? [],
      }),
    );
    this.cdr.markForCheck();
  }

  setCommander(oracleId: string | null, deck: DeckDetailDto): void {
    this.showCommanderPicker = false;
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: this.deckId,
        name: deck.name,
        coverUri: deck.coverUri ?? null,
        format: deck.format ?? null,
        commanderOracleId: oracleId,
        tags: deck.tags ?? [],
      }),
    );
    this.cdr.markForCheck();
  }

  saveNotes(deck: DeckDetailDto): void {
    this.store.dispatch(
      DeckActions.updateDeckMeta({
        id: this.deckId,
        name: deck.name,
        coverUri: deck.coverUri ?? null,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
        tags: deck.tags ?? [],
        notes: this.notesDraft,
      }),
    );
  }

  onCpSlotDragOver(event: DragEvent, deck: DeckDetailDto): void {
    const hasCommanderCard =
      event.dataTransfer?.types.includes('application/x-commander-card') ?? false;
    const draggedCard = this.dragCardId ? deck.cards.find((c) => c.id === this.dragCardId) : null;
    const isEligible = draggedCard
      ? this.eligibleCommanders(deck).some((c) => c.id === draggedCard.id)
      : false;
    if (!hasCommanderCard && !isEligible) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = hasCommanderCard ? 'copy' : 'move';
    if (!this.cpSlotDragOver) {
      this.cpSlotDragOver = true;
      this.cdr.markForCheck();
    }
  }

  onCpSlotDrop(deck: DeckDetailDto, event: DragEvent): void {
    event.preventDefault();
    this.cpSlotDragOver = false;

    const searchCard = this.parseSearchDrag(event);
    if (searchCard) {
      if (!(event.dataTransfer?.types.includes('application/x-commander-card') ?? false)) {
        this.cdr.markForCheck();
        return;
      }
      // Dropped onto the commander slot — the drag was the motion, so just bump the slot.
      this.flyToCommander();
      this.store.dispatch(
        DeckActions.addCard({
          deckId: this.deckId,
          request: {
            oracleId: searchCard.oracleId,
            quantity: 1,
            scryfallId: searchCard.scryfallId,
          },
        }),
      );
      this.setCommander(searchCard.oracleId, deck);
      return;
    }

    if (this.dragCardId) {
      const card = deck.cards.find((c) => c.id === this.dragCardId);
      if (card && this.eligibleCommanders(deck).some((c) => c.id === card.id)) {
        this.setCommander(card.oracleId, deck);
      }
      this.onDragEnd();
    }
    this.cdr.markForCheck();
  }

  aiBuildDeck(deck: DeckDetailDto): void {
    if (!deck.commanderOracleId || this.aiBuilding) return;
    this.aiBuilding = true;
    this.aiBuildResult = null;
    this.aiBuildError = null;
    this.cdr.markForCheck();
    this.deckApi
      .aiBuildDeck(
        deck.id,
        deck.commanderOracleId,
        this.aiBuildBracket,
        this.aiBuildPrice,
        this.aiBuildSideboard,
        this.aiBuildMaybeboard,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.aiBuilding = false;
          this.aiBuildResult = result;
          this.store.dispatch(DeckActions.loadDeck({ id: deck.id }));
          this.cdr.markForCheck();
        },
        error: () => {
          this.aiBuilding = false;
          this.aiBuildError = 'Build failed. Please try again.';
          this.cdr.markForCheck();
        },
      });
  }

  /** Cards eligible to be commander: legendary creatures or planeswalkers. */
  eligibleCommanders(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter((c) => {
      const d = c.cardDetails;
      if (!d) return false;
      const legendary = d.supertypes?.includes('Legendary') ?? false;
      const creature = d.cardTypes?.includes(CardType.Creature) ?? false;
      const pw = d.cardTypes?.includes(CardType.Planeswalker) ?? false;
      return legendary && (creature || pw);
    });
  }

  commanderCard(deck: DeckDetailDto): CollectionCardDto | null {
    if (!deck.commanderOracleId) return null;
    return deck.cards.find((c) => c.oracleId === deck.commanderOracleId) ?? null;
  }

  /** Cards that are banned in Commander. */
  bannedInCommander(deck: DeckDetailDto): CollectionCardDto[] {
    return this.violations(deck).banned;
  }

  /** Cards on the Commander game changers list (legal but flagged as highly impactful). */
  gameChangerCards(deck: DeckDetailDto): CollectionCardDto[] {
    return this.violations(deck).gameChangers;
  }

  gameChangerNames(deck: DeckDetailDto): string {
    return this.gameChangerCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  /** Cards that grant an extra turn. */
  extraTurnCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(
      (c) =>
        (c.board ?? 'main') === 'main' &&
        /takes? an extra turn/i.test(c.cardDetails?.oracleText ?? ''),
    );
  }

  /** Cards that destroy or exile all (or all nonbasic) lands. */
  mldCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter((c) => {
      if ((c.board ?? 'main') !== 'main') return false;
      const text = c.cardDetails?.oracleText ?? '';
      return (
        /destroy all (?:nonbasic )?lands/i.test(text) ||
        /exile all (?:\w+, )*lands/i.test(text) ||
        /destroy all permanents/i.test(text) ||
        /exile all permanents/i.test(text)
      );
    });
  }

  /** True if the deck can chain extra turns (2+ extra-turn spells, or 1 + graveyard recursion). */
  hasChainingExtraTurns(deck: DeckDetailDto): boolean {
    const etCards = this.extraTurnCards(deck);
    if (etCards.length === 0) return false;
    if (etCards.length >= 2) return true;
    return deck.cards
      .filter((c) => (c.board ?? 'main') === 'main')
      .some((c) => {
        const text = c.cardDetails?.oracleText ?? '';
        return (
          /return target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(
            text,
          ) ||
          /cast target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(
            text,
          ) ||
          /you may cast (?:a card|target (?:instant or sorcery|instant|sorcery)) from your graveyard/i.test(
            text,
          )
        );
      });
  }

  /** Estimated Commander Bracket (1–4). Bracket 5 is intent-based and not computed. */
  commanderBracket(deck: DeckDetailDto): number {
    const gcCount = this.gameChangerCards(deck).length;
    const mld = this.mldCards(deck).length > 0;
    const chain = this.hasChainingExtraTurns(deck);
    if (gcCount > 3 || mld || chain) return 4;
    if (gcCount > 0) return 3;
    if (this.extraTurnCards(deck).length > 0) return 2;
    return 1;
  }

  mldCardNames(deck: DeckDetailDto): string {
    return this.mldCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  extraTurnCardNames(deck: DeckDetailDto): string {
    return this.extraTurnCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  bracketInfoOpen = false;

  toggleBracketInfo(e: MouseEvent): void {
    e.stopPropagation();
    this.violationPanelType = null;
    this.bracketInfoOpen = !this.bracketInfoOpen;
  }

  // ---- Violation detail panel ------------------------------------

  violationPanelType: 'banned' | 'singleton' | 'color-id' | null = null;

  openViolationPanel(type: 'banned' | 'singleton' | 'color-id', e: MouseEvent): void {
    e.stopPropagation();
    this.bracketInfoOpen = false;
    this.violationPanelType = this.violationPanelType === type ? null : type;
  }

  closeViolationPanel(): void {
    this.violationPanelType = null;
  }

  violationPanelCards(deck: DeckDetailDto): CollectionCardDto[] {
    switch (this.violationPanelType) {
      case 'banned':
        return this.bannedInCommander(deck);
      case 'singleton':
        return this.singletonViolations(deck);
      case 'color-id':
        return this.colorIdentityViolations(deck);
      default:
        return [];
    }
  }

  violationPanelTitle(): string {
    switch (this.violationPanelType) {
      case 'banned':
        return 'Banned Cards';
      case 'singleton':
        return 'Singleton Violations';
      case 'color-id':
        return 'Color Identity Violations';
      default:
        return '';
    }
  }

  colorIdViolationColors(card: CollectionCardDto, deck: DeckDetailDto): string {
    const cmdr = this.commanderCard(deck);
    if (!cmdr?.cardDetails) return '';
    return identityViolations(card.cardDetails?.colorIdentity, cmdr.cardDetails.colorIdentity).join(
      '',
    );
  }

  cardTypeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  removeViolatingCard(card: CollectionCardDto): void {
    this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
  }

  /**
   * All deck-legality derivations, computed once per deck emission and looked up
   * from the template. The violation classes are bound on every tile and the
   * header bar reads the arrays repeatedly, so the uncached version did O(N) deck
   * scans per card per change-detection pass — O(N²) at pointer-event frequency.
   * The store emits a new deck object on every mutation, so object identity is a
   * sound cache key.
   */
  private violationsCache: {
    deck: DeckDetailDto;
    singleton: CollectionCardDto[];
    colorId: CollectionCardDto[];
    banned: CollectionCardDto[];
    gameChangers: CollectionCardDto[];
    formatViolations: CollectionCardDto[];
    typeByCardId: Map<string, string | null>;
    oracleCounts: Map<string, number>;
  } | null = null;

  private violations(deck: DeckDetailDto): NonNullable<typeof this.violationsCache> {
    if (this.violationsCache?.deck === deck) return this.violationsCache;

    const isCommander = deck.format === 'commander';
    const mainCards = deck.cards.filter((c) => (c.board ?? 'main') === 'main');

    // Singleton: non-basic cards whose total copies (across printings) exceed one.
    const totalByOracle = new Map<string, number>();
    for (const c of mainCards) {
      if (!this.isBasicLand(c))
        totalByOracle.set(c.oracleId, (totalByOracle.get(c.oracleId) ?? 0) + this.cardCount(c));
    }
    const singleton = mainCards.filter(
      (c) => !this.isBasicLand(c) && (totalByOracle.get(c.oracleId) ?? 0) > 1,
    );

    // Color identity outside the commander's.
    const cmdr = this.commanderCard(deck);
    const colorId = cmdr?.cardDetails
      ? mainCards.filter(
          (c) =>
            c.oracleId !== cmdr.oracleId &&
            identityViolations(c.cardDetails?.colorIdentity, cmdr.cardDetails!.colorIdentity)
              .length > 0,
        )
      : [];

    const banned = mainCards.filter((c) => c.cardDetails?.legalities?.['commander'] === 'banned');
    const gameChangers = mainCards.filter((c) => c.cardDetails?.gameChanger === true);

    const fmt = deck.format;
    const formatViolations =
      !fmt || fmt === 'commander'
        ? []
        : deck.cards.filter((c) => {
            const leg = c.cardDetails?.legalities?.[fmt];
            return !!leg && leg !== 'legal';
          });

    const singletonIds = new Set(singleton.map((c) => c.id));
    const colorIdIds = new Set(colorId.map((c) => c.id));
    const typeByCardId = new Map<string, string | null>();
    if (isCommander) {
      for (const c of deck.cards) {
        if (c.cardDetails?.legalities?.['commander'] === 'banned') {
          typeByCardId.set(c.id, 'banned');
          continue;
        }
        const s = singletonIds.has(c.id);
        const ci = colorIdIds.has(c.id);
        typeByCardId.set(c.id, s && ci ? 'both' : s ? 'singleton' : ci ? 'color-id' : null);
      }
    }

    const oracleCounts = new Map<string, number>();
    for (const c of deck.cards) {
      const key = `${c.oracleId}|${c.board ?? 'main'}`;
      oracleCounts.set(key, (oracleCounts.get(key) ?? 0) + this.cardCount(c));
    }

    this.violationsCache = {
      deck,
      singleton,
      colorId,
      banned,
      gameChangers,
      formatViolations,
      typeByCardId,
      oracleCounts,
    };
    return this.violationsCache;
  }

  /** Non-basic cards with more than one total copy — violates singleton. */
  singletonViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.violations(deck).singleton;
  }

  /** Total copies of a card across all records with the same oracleId on the same board. */
  totalOracleCount(card: CollectionCardDto, deck: DeckDetailDto): number {
    return this.violations(deck).oracleCounts.get(`${card.oracleId}|${card.board ?? 'main'}`) ?? 0;
  }

  /** Cards whose color identity falls outside the commander's. */
  colorIdentityViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.violations(deck).colorId;
  }

  formatLabel(format: string | null): string {
    const labels: Record<string, string> = {
      commander: 'CMDR',
      brawl: 'BRAWL',
      oathbreaker: 'OATH',
      standard: 'STD',
      pioneer: 'PIO',
      modern: 'MOD',
      legacy: 'LEG',
      vintage: 'VIN',
      pauper: 'PAU',
    };
    return format ? (labels[format] ?? format.toUpperCase()) : 'FORMAT';
  }

  hasFormatViolations(deck: DeckDetailDto): boolean {
    return this.hasCommanderViolations(deck) || this.formatViolations(deck).length > 0;
  }

  formatViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.violations(deck).formatViolations;
  }

  hasCommanderViolations(deck: DeckDetailDto): boolean {
    if (deck.format !== 'commander') return false;
    return (
      this.totalCount(deck) !== 100 ||
      !deck.commanderOracleId ||
      this.singletonViolations(deck).length > 0 ||
      this.colorIdentityViolations(deck).length > 0 ||
      this.bannedInCommander(deck).length > 0
    );
  }

  /** Returns 'banned', 'singleton', 'color-id', 'both', or null. Banned takes highest priority. */
  cardViolationType(card: CollectionCardDto, deck: DeckDetailDto): string | null {
    if (deck.format !== 'commander') return null;
    if (card.cardDetails?.legalities?.['commander'] === 'banned') return 'banned';
    return this.violations(deck).typeByCardId.get(card.id) ?? null;
  }

  cardViolationClass(card: CollectionCardDto, deck: DeckDetailDto): string {
    const classes: string[] = [];
    const type = this.cardViolationType(card, deck);
    if (type) classes.push(`violation-${type}`);
    if (deck.format === 'commander' && card.cardDetails?.gameChanger)
      classes.push('is-game-changer');
    return classes.join(' ');
  }

  private isBasicLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.supertypes?.includes('Basic') ?? false;
  }

  // ── Stats chart ────────────────────────────────────────────────────────────

  private readonly MANA_COLORS: Record<string, string> = {
    w: '#f0ead6',
    u: '#60a5fa',
    b: '#9ca3af',
    r: '#f87171',
    g: '#4ade80',
    c: '#d1d5db',
  };

  tagHistory: string[] = [];

  private loadTagHistory(): void {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('mtg-tag-history') || '[]');
      this.tagHistory = Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
    } catch {
      this.tagHistory = [];
    }
  }

  private saveTagToHistory(tag: string): void {
    this.tagHistory = [...new Set([tag, ...this.tagHistory])].slice(0, 200);
    localStorage.setItem('mtg-tag-history', JSON.stringify(this.tagHistory));
  }

  deckCardNames(deck: DeckDetailDto): string[] {
    return [
      ...new Set(deck.cards.map((c) => c.cardDetails?.name).filter((n): n is string => !!n)),
    ].sort();
  }

  sectionChartType: Record<string, 'bar' | 'vbar' | 'pie'> = {};

  getChartType(section: string): 'bar' | 'vbar' | 'pie' {
    return this.sectionChartType[section] ?? 'bar';
  }

  setChartType(section: string, type: 'bar' | 'vbar' | 'pie'): void {
    this.sectionChartType[section] = type;
    this.cdr.markForCheck();
  }

  cardTypeData(stats: DeckStats): ChartEntry[] {
    return [
      { label: 'Creatures', value: stats.creatures },
      { label: 'Lands', value: stats.lands },
      { label: 'Instants', value: stats.instants },
      { label: 'Sorceries', value: stats.sorceries },
      { label: 'Enchantments', value: stats.enchantments },
      { label: 'Artifacts', value: stats.artifacts },
      { label: 'Planeswalkers', value: stats.planeswalkers },
      { label: 'Other', value: stats.other },
    ].filter((e) => e.value > 0);
  }

  manaPipData(stats: DeckStats): ChartEntry[] {
    return stats.manaPips.map((p) => ({
      label: p.color === 'm' ? 'Multi' : p.color.toUpperCase(),
      value: p.count,
      color: this.MANA_COLORS[p.color.toLowerCase()],
      manaSymbol: p.color.toLowerCase(),
    }));
  }

  manaProductionData(stats: DeckStats): ChartEntry[] {
    return stats.manaProduction.map((p) => ({
      label: p.color === 'm' ? 'Multi' : p.color.toUpperCase(),
      value: p.count,
      color: this.MANA_COLORS[p.color.toLowerCase()],
      manaSymbol: p.color.toLowerCase(),
    }));
  }

  subtypeData(stats: DeckStats): ChartEntry[] {
    return stats.creatureSubtypes.map((s) => ({ label: s.name, value: s.count }));
  }
}
