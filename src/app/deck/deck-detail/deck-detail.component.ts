import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  Observable, Subject, mergeMap, switchMap, takeUntil, of, catchError, map, filter, take,
} from 'rxjs';
import { AppState } from '../../store';
import { DeckActions } from '../../store/deck/deck.actions';
import { selectActiveDeck, selectDeckLoading } from '../../store/deck/deck.selectors';
import { CollectionCardDto, PrintingDto, CardType, ManaColor, CardDto } from '../../models/game.models';
import { DeckDetailDto, DeckApiService } from '../../services/deck-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CardSearchPanelComponent } from '../../components/card-search-panel/card-search-panel.component';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';
import { DeckSuggestionsPanelComponent } from '../../components/deck-suggestions-panel/deck-suggestions-panel.component';
import { ManaSuggestPanelComponent } from '../../components/mana-suggest-panel/mana-suggest-panel.component';

export type SortMode = 'cmc' | 'name' | 'type' | 'subtype' | 'color' | 'color-identity' | 'rarity' | 'artist' | 'set';
export type ViewMode = 'list' | 'visual' | 'free';

export interface FreeColumn {
  id: string;
  label: string;
  cardIds: string[];
  width?: number;
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
}

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ManaCostComponent, CardModalComponent, CardSearchPanelComponent, CoverPickerModalComponent, DeckSuggestionsPanelComponent, ManaSuggestPanelComponent],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetailComponent implements OnInit, OnDestroy {
  deck$: Observable<DeckDetailDto | null>;
  loading$: Observable<boolean>;
  commanderCardDetails$: Observable<CardDto | null>;

  filterQuery     = '';
  sortMode: SortMode = 'cmc';
  viewMode: ViewMode = 'list';
  textStyle       = false;
  zoomLevel = 1.0;
  showSearchPanel      = false;
  showSuggestionsPanel = false;
  showManaSuggestPanel = false;
  showSidePanel        = false;

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

  isRenaming  = false;
  renameDraft = '';
  tagDraft    = '';

  showDetailCoverPicker = false;

  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalSlotKey: string | null = null;
  private _modalFlipped = false;
  get modalFlipped(): boolean { return this._modalFlipped; }
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
  stackDragGroupKey: string | null = null;
  stackDragFromIdx: number | null = null;
  stackDragOverIdx: number | null = null;

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  @ViewChild(CardSearchPanelComponent) searchPanel?: CardSearchPanelComponent;

  private deckId = '';
  private printingsLoad$ = new Subject<string>();
  printingsCache = new Map<string, PrintingDto[]>();
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private collectionApi: CollectionApiService,
    private deckApi: DeckApiService,
    private cdr: ChangeDetectorRef,
  ) {
    this.deck$ = this.store.select(selectActiveDeck);
    this.loading$ = this.store.select(selectDeckLoading);
    this.commanderCardDetails$ = this.deck$.pipe(
      map(deck => (deck?.format === 'commander' ? (this.commanderCard(deck)?.cardDetails ?? null) : null)),
    );
  }

  ngOnInit(): void {
    this.deckId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(DeckActions.loadDeck({ id: this.deckId }));
    const savedZoom = localStorage.getItem('deck-zoom');
    if (savedZoom) this.zoomLevel = Math.max(0.5, Math.min(2.0, parseFloat(savedZoom) || 1.0));

    if (localStorage.getItem(`deck-free-${this.deckId}`)) {
      this.viewMode = 'free';
      // Initialise free columns once deck data arrives
      this.deck$.pipe(
        filter((deck): deck is DeckDetailDto => deck != null && this.freeColumns.length === 0),
        take(1),
        takeUntil(this.destroy$),
      ).subscribe(deck => {
        this.enterFreeMode(deck);
        this.cdr.markForCheck();
      });
    } else {
      this.viewMode = 'visual';
      this.stackDensity = 'half';
    }

    this.deck$.pipe(takeUntil(this.destroy$)).subscribe(deck => {
      if (this.selectedCard && deck) {
        const updated = deck.cards.find(c => c.id === this.selectedCard!.id);
        if (updated) { this.selectedCard = updated; this.cdr.markForCheck(); }
        else { this.closeCard(); }
      }
      if (deck && this.viewMode === 'free' && this.freeColumns.length > 0) {
        this.syncFreeColumns(deck);
        this.cdr.markForCheck();
      }
    });

    this.printingsLoad$.pipe(
      mergeMap(oracleId => {
        if (this.printingsCache.has(oracleId))
          return of({ oracleId, printings: this.printingsCache.get(oracleId)! });
        return this.collectionApi.getPrintings(oracleId).pipe(
          map(printings => ({ oracleId, printings })),
          catchError(() => of({ oracleId, printings: [] as PrintingDto[] })),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(({ oracleId, printings }) => {
      this.printingsCache.set(oracleId, printings);
      if (this.selectedCard?.oracleId === oracleId && !this.modalViewScryfallId && printings.length)
        this.modalViewScryfallId = printings[0].scryfallId;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopEdgeScroll();
  }

  goBack(): void { this.checkUnsaved(() => this.router.navigate(['/deck'])); }

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
      if (this.viewMode !== mode) this.stackOrders.clear();
      this.viewMode = mode;
      this.textStyle = false;
      if (mode === 'free' && deck) this.enterFreeMode(deck);
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

  zoomIn():  void { this.zoomLevel = Math.min(2.0, +(this.zoomLevel + 0.25).toFixed(2)); localStorage.setItem('deck-zoom', String(this.zoomLevel)); }
  zoomOut(): void { this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2)); localStorage.setItem('deck-zoom', String(this.zoomLevel)); }
  get zoomLabel(): string { return Math.round(this.zoomLevel * 100) + '%'; }

  // ---- Free mode layout ------------------------------------

  private rebuildFreeColumns(deck: DeckDetailDto): void {
    const prevFilter = this.filterQuery;
    this.filterQuery = '';
    this.freeColumns = this.getGroups(deck).map(g => ({
      id: crypto.randomUUID(),
      label: g.label,
      cardIds: g.cards.flatMap(c => Array(this.cardCount(c)).fill(c.id)),
    }));
    this.filterQuery = prevFilter;
  }

  private enterFreeMode(deck: DeckDetailDto): void {
    if (this.sortMode === 'name') this.sortMode = 'cmc';
    const saved = localStorage.getItem(`deck-free-${this.deckId}`);
    if (saved) {
      try {
        const parsed: FreeColumn[] = JSON.parse(saved);
        if (parsed.length) {
          this.freeColumns = parsed;
          this.freeLayoutDirty = false;
          this.syncFreeColumns(deck);
          return;
        }
      } catch { /* fall through */ }
    }
    this.rebuildFreeColumns(deck);
    this.freeLayoutDirty = false;
  }

  private syncFreeColumns(deck: DeckDetailDto): void {
    const assignedCounts = new Map<string, number>();
    for (const col of this.freeColumns)
      for (const id of col.cardIds)
        assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);

    const extra: string[] = [];
    for (const card of deck.cards) {
      if (deck.commanderOracleId && card.oracleId === deck.commanderOracleId) continue;
      const gap = this.cardCount(card) - (assignedCounts.get(card.id) ?? 0);
      for (let i = 0; i < gap; i++) extra.push(card.id);
    }

    if (extra.length) {
      const targetIdx = Math.max(0, this.freeColumns.findIndex(c => c.id === this.selectedFreeColId));
      this.freeColumns = this.freeColumns.map((col, i) =>
        i === targetIdx ? { ...col, cardIds: [...col.cardIds, ...extra] } : col
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
    setTimeout(() => { this.layoutSaved = false; this.cdr.markForCheck(); }, 1800);
  }

  resetFreeLayout(deck: DeckDetailDto): void {
    localStorage.removeItem(`deck-free-${this.deckId}`);
    this.freeColumns = [];
    this.enterFreeMode(deck);
    this.freeLayoutDirty = true;
    this.cdr.markForCheck();
  }

  getCardsForColumn(col: FreeColumn, deck: DeckDetailDto): CollectionCardDto[] {
    const isCommander = (c: CollectionCardDto) => deck.commanderOracleId ? c.oracleId === deck.commanderOracleId : false;
    const cards = col.cardIds
      .map(id => deck.cards.find(c => c.id === id))
      .filter((c): c is CollectionCardDto => c != null && !isCommander(c));
    const targetId = this.selectedFreeColId ?? this.freeColumns[0]?.id;
    if (col.id === targetId) {
      const assignedCounts = new Map<string, number>();
      for (const fc of this.freeColumns)
        for (const id of fc.cardIds)
          assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);
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
    if (this.selectedFreeColId || this.dragSelectedColIds.size > 0 || this.selectedCardSlots.size > 0) {
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
    this.deck$.pipe(take(1)).subscribe(deck => {
      if (!deck) return;
      const removals = new Map<string, number>(); // cardId → copies to remove
      const splices: Array<{ col: FreeColumn; idx: number }> = [];
      for (const [slotKey, cardId] of this.selectedCardSlots) {
        const slashIdx = slotKey.lastIndexOf('/');
        const colId = slotKey.slice(0, slashIdx);
        const renderedIdx = parseInt(slotKey.slice(slashIdx + 1), 10);
        const col = this.freeColumns.find(c => c.id === colId);
        if (col != null && renderedIdx < col.cardIds.length) {
          splices.push({ col, idx: renderedIdx });
        }
        removals.set(cardId, (removals.get(cardId) ?? 0) + 1);
      }
      splices.sort((a, b) => b.idx - a.idx);
      for (const { col, idx } of splices) col.cardIds.splice(idx, 1);
      for (const [cardId, count] of removals) {
        const card = deck.cards.find(c => c.id === cardId);
        if (!card) continue;
        if (this.cardCount(card) - count <= 0) {
          this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId }));
        } else {
          const newQty  = Math.max(0, card.quantity - count);
          const newFoil = Math.max(0, card.quantityFoil - Math.max(0, count - card.quantity));
          this.store.dispatch(DeckActions.updateCard({
            deckId: this.deckId, cardId, request: { quantity: newQty, quantityFoil: newFoil },
          }));
        }
      }
      this.selectedCardSlots = new Map();
      this.freeLayoutDirty = true;
      this.cdr.markForCheck();
    });
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.dragSelectListEl) return;
    const el = this.dragSelectListEl;
    const r = el.getBoundingClientRect();
    const cx = event.clientX - r.left + el.scrollLeft;
    const cy = event.clientY - r.top + el.scrollTop;
    const { x: ox, y: oy } = this.dragSelectOrigin;
    const newBox = {
      x: Math.min(ox, cx), y: Math.min(oy, cy),
      w: Math.abs(cx - ox), h: Math.abs(cy - oy),
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
    if (this.isDragSelecting && (this.dragSelectedColIds.size > 0 || this.selectedCardSlots.size > 0)) {
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
    el.querySelectorAll<HTMLElement>('[data-col-id]').forEach(colEl => {
      const r = colEl.getBoundingClientRect();
      const left  = r.left  - elRect.left + el.scrollLeft;
      const top   = r.top   - elRect.top  + el.scrollTop;
      const right  = left + r.width;
      const bottom = top  + r.height;
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
    el.querySelectorAll<HTMLElement>('[data-slot-key]').forEach(cardEl => {
      const r = cardEl.getBoundingClientRect();
      const left   = r.left  - elRect.left + el.scrollLeft;
      const top    = r.top   - elRect.top  + el.scrollTop;
      const right  = left + r.width;
      const bottom = top  + r.height;
      if (left < box.x + box.w && right > box.x && top < box.y + box.h && bottom > box.y) {
        const slot   = cardEl.getAttribute('data-slot-key');
        const cardId = cardEl.getAttribute('data-card-id');
        if (slot && cardId) newSlots.set(slot, cardId);
      }
    });
    this.selectedCardSlots = newSlots;
  }

  addFreeColumn(): void {
    this.freeColumns = [...this.freeColumns, {
      id: crypto.randomUUID(), label: 'New Column', cardIds: [],
    }];
    this.freeLayoutDirty = true;
    this.cdr.markForCheck();
  }

  removeColumn(colId: string): void {
    if (this.freeColumns.length <= 1) return;
    const col = this.freeColumns.find(c => c.id === colId);
    if (!col) return;
    const remaining = this.freeColumns.filter(c => c.id !== colId);
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
      this.freeColumns = this.freeColumns.map(c => c.id === colId ? { ...c, width: newWidth } : c);
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
    this.freeColumns = this.freeColumns.map(c => c.id === colId ? { ...c, width: undefined } : c);
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
      this.freeColumns = this.freeColumns.map(c =>
        c.id === this.editingColumnId ? { ...c, label } : c
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

  onCardDragStart(card: CollectionCardDto, colId: string, renderedIdx: number, event: DragEvent): void {
    const slotKey = `${colId}/${renderedIdx}`;
    const isMulti = this.selectedCardSlots.size > 1 && this.selectedCardSlots.has(slotKey);

    this.dragSourceColId = colId;
    this.dragSrcRenderedIdx = renderedIdx;
    if (event.dataTransfer) {
      // Use the full card element as the ghost — prevents the flip button from showing as ghost
      const cardEl = event.target
        ? (event.target as Element).closest<HTMLElement>('.free-card')
        : null;
      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        event.dataTransfer.setDragImage(cardEl, event.clientX - r.left, event.clientY - r.top);
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
    }

    if (isMulti) {
      this.isDraggingMultiCards = true;
      this.multiDragCards = Array.from(this.selectedCardSlots.entries()).map(([slot, cid]) => {
        const slashIdx = slot.lastIndexOf('/');
        return { colId: slot.slice(0, slashIdx), cardId: cid, renderedIdx: parseInt(slot.slice(slashIdx + 1), 10) };
      });
    } else {
      this.isDraggingMultiCards = false;
      this.multiDragCards = [];
    }

    setTimeout(() => { this.dragCardId = card.id; this.cdr.markForCheck(); });
  }

  private parseSearchDrag(event: DragEvent): { oracleId: string; scryfallId: string } | null {
    try {
      const raw = event.dataTransfer?.getData('application/x-search-card');
      if (!raw) return null;
      return JSON.parse(raw) as { oracleId: string; scryfallId: string };
    } catch { return null; }
  }

  onColDragOver(colId: string, event: DragEvent): void {
    if (this.dragColId) return;
    event.preventDefault();
    const isSearch = event.dataTransfer?.types.includes('application/x-search-card');
    if (event.dataTransfer) event.dataTransfer.dropEffect = isSearch ? 'copy' : 'move';

    const col = event.currentTarget as HTMLElement;
    const cards = Array.from(
      col.querySelectorAll<HTMLElement>('.free-card:not(.is-dragging)')
    );
    let idx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const { top, height } = cards[i].getBoundingClientRect();
      if (event.clientY < top + height / 2) { idx = i; break; }
    }

    if (this.dragOverColId !== colId || this.dragOverIndex !== idx) {
      this.dragOverColId = colId;
      this.dragOverIndex = idx;
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
      const cols = this.freeColumns.map(c => {
        if (c.id !== srcId) return c;
        const idx = c.cardIds.indexOf(cardId);
        if (idx < 0) return c;
        return { ...c, cardIds: [...c.cardIds.slice(0, idx), ...c.cardIds.slice(idx + 1)] };
      });
      const ti = cols.findIndex(c => c.id === colId);
      if (ti >= 0) {
        cols[ti] = {
          ...cols[ti],
          cardIds: [...cols[ti].cardIds.slice(0, dropIdx), cardId, ...cols[ti].cardIds.slice(dropIdx)],
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

  onGroupsAreaMouseMove(event: MouseEvent): void {
    if (this.viewMode !== 'free' && this.viewMode !== 'visual') return;
    this.updateEdgeScroll(event.clientX, event.currentTarget as HTMLElement);
  }

  onGroupsAreaMouseLeave(): void {
    this.stopEdgeScroll();
  }

  onGroupsAreaDragOver(event: DragEvent): void {
    const isSearch = event.dataTransfer?.types.includes('application/x-search-card');
    if (isSearch) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
    if (this.viewMode !== 'free' && this.viewMode !== 'visual') return;
    if (!this.dragCardId && !this.dragColId && !isSearch) return;
    this.updateEdgeScroll(event.clientX, event.currentTarget as HTMLElement);
  }

  onGroupsAreaDrop(event: DragEvent): void {
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
      const srcCol = this.freeColumns.find(c => c.id === colId);
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

    const cols = this.freeColumns.map(col => {
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

    const ti = cols.findIndex(c => c.id === targetColId);
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
        const shift = [...removedIndices].filter(ri => ri < origIdx).length;
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

  onColDragLeave(event: DragEvent): void {
    if (this.dragColId) return;
    const rel = event.relatedTarget as HTMLElement | null;
    if (!rel || !(event.currentTarget as HTMLElement).contains(rel)) {
      this.dragOverColId = null;
      this.dragOverIndex = null;
      this.cdr.markForCheck();
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
        .filter(c => this.dragSelectedColIds.has(c.id))
        .map(c => c.id);
    } else {
      this.isDraggingMultiCols = false;
      this.multiDragColIds = [];
    }

    setTimeout(() => { this.dragColId = col.id; this.cdr.markForCheck(); });
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
      if (event.clientX < left + width / 2) { idx = i; break; }
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
    const toMove = this.freeColumns.filter(c => moveSet.has(c.id));
    const keep   = this.freeColumns.filter(c => !moveSet.has(c.id));

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
    const fromIdx = this.freeColumns.findIndex(c => c.id === this.dragColId);
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
    return deck.cards.reduce((s, c) => s + c.quantity + c.quantityFoil, 0);
  }

  cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  private isLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.cardTypes.includes(CardType.Land) ?? false;
  }

  getGroups(deck: DeckDetailDto): CmcGroup[] {
    const filtered = this.filteredCards(deck);

    if (this.sortMode === 'name') {
      const sorted = [...filtered].sort((a, b) =>
        (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
      return [{ label: 'All Cards', key: 'all', cards: sorted, totalCount: sorted.reduce((s, c) => s + this.cardCount(c), 0) }];
    }

    if (this.sortMode === 'type') {
      const order: CardType[] = [
        CardType.Creature, CardType.Planeswalker,
        CardType.Instant, CardType.Sorcery,
        CardType.Enchantment, CardType.Artifact, CardType.Land,
      ];
      const groups: CmcGroup[] = [];
      for (const type of order) {
        const cards = filtered
          .filter(c => c.cardDetails?.cardTypes.includes(type))
          .sort((a, b) => (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0)
                        || (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
        if (cards.length)
          groups.push({ label: CardType[type] + 's', key: `type-${type}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) });
      }
      const typed = new Set(groups.flatMap(g => g.cards.map(c => c.id)));
      const rest = filtered.filter(c => !typed.has(c.id));
      if (rest.length)
        groups.push({ label: 'Other', key: 'type-other', cards: rest, totalCount: rest.reduce((s, c) => s + this.cardCount(c), 0) });
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
        a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));
      return keys.map(key => {
        const cards = bySubtype.get(key)!;
        return { label: key, key: `subtype-${key}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
      });
    }

    if (this.sortMode === 'color') {
      const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      const byColor = new Map<string, CollectionCardDto[]>();
      for (const label of colorOrder) byColor.set(label, []);
      for (const c of filtered) {
        const mc = c.cardDetails?.manaCost ?? '';
        const colors = new Set([...mc].filter(ch => 'WUBRG'.includes(ch)));
        const label = colors.size === 0 ? 'Colorless'
          : colors.size > 1 ? 'Multicolor'
          : colors.has('W') ? 'White'
          : colors.has('U') ? 'Blue'
          : colors.has('B') ? 'Black'
          : colors.has('R') ? 'Red' : 'Green';
        byColor.get(label)!.push(c);
      }
      return colorOrder
        .filter(label => (byColor.get(label)?.length ?? 0) > 0)
        .map(label => {
          const cards = byColor.get(label)!;
          return { label, key: `color-${label}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
        });
    }

    if (this.sortMode === 'color-identity') {
      const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      const ciLabel = (ci: ManaColor[]): string => {
        if (ci.length === 0) return 'Colorless';
        if (ci.length > 1) return 'Multicolor';
        const map: Partial<Record<ManaColor, string>> = {
          [ManaColor.White]: 'White', [ManaColor.Blue]: 'Blue', [ManaColor.Black]: 'Black',
          [ManaColor.Red]: 'Red', [ManaColor.Green]: 'Green',
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
        .filter(label => (byColor.get(label)?.length ?? 0) > 0)
        .map(label => {
          const cards = byColor.get(label)!;
          return { label, key: `ci-${label}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
        });
    }

    if (this.sortMode === 'rarity') {
      const rarityOrder = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];
      const rarityLabel: Record<string, string> = {
        mythic: 'Mythic Rare', rare: 'Rare', uncommon: 'Uncommon', common: 'Common',
        special: 'Special', bonus: 'Bonus',
      };
      const byRarity = new Map<string, CollectionCardDto[]>();
      for (const c of filtered) {
        const r = c.cardDetails?.rarity ?? 'unknown';
        if (!byRarity.has(r)) byRarity.set(r, []);
        byRarity.get(r)!.push(c);
      }
      const known = rarityOrder.filter(r => byRarity.has(r));
      const other = [...byRarity.keys()].filter(r => !rarityOrder.includes(r)).sort();
      return [...known, ...other].map(r => {
        const cards = byRarity.get(r)!;
        return { label: rarityLabel[r] ?? r, key: `rarity-${r}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
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
      return keys.map(artist => {
        const cards = byArtist.get(artist)!;
        return { label: artist, key: `artist-${artist}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
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
      return keys.map(set => {
        const cards = bySet.get(set)!;
        return { label: set, key: `set-${set}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) };
      });
    }

    // CMC
    const nonLands = filtered.filter(c => !this.isLand(c))
      .sort((a, b) => (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0)
                    || (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
    const lands = filtered.filter(c => this.isLand(c))
      .sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));

    const groups: CmcGroup[] = [];
    const buckets = new Map<string, CollectionCardDto[]>();
    for (const c of nonLands) {
      const key = (c.cardDetails?.manaValue ?? 0) >= 6 ? '6+' : String(c.cardDetails?.manaValue ?? 0);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    for (const key of ['0', '1', '2', '3', '4', '5', '6+']) {
      const cards = buckets.get(key);
      if (cards?.length)
        groups.push({ label: key === '6+' ? 'CMC 6+' : `CMC ${key}`, key: `cmc-${key}`, cards, totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0) });
    }
    if (lands.length)
      groups.push({ label: 'Lands', key: 'lands', cards: lands, totalCount: lands.reduce((s, c) => s + this.cardCount(c), 0) });
    return groups;
  }

  expandCards(cards: CollectionCardDto[]): CollectionCardDto[] {
    return cards.flatMap(c => Array(this.cardCount(c)).fill(c));
  }

  getStackCards(groupKey: string, cards: CollectionCardDto[]): CollectionCardDto[] {
    if (!this.stackOrders.has(groupKey)) {
      this.stackOrders.set(groupKey, [...this.expandCards(cards)].reverse().map(c => c.id));
    } else {
      // Reconcile order with current quantities, preserving user-arranged positions
      const quota = new Map<string, number>(cards.map(c => [c.id, this.cardCount(c)]));
      const used = new Map<string, number>();
      const kept: string[] = [];
      for (const id of this.stackOrders.get(groupKey)!) {
        const u = used.get(id) ?? 0;
        if (u < (quota.get(id) ?? 0)) { kept.push(id); used.set(id, u + 1); }
      }
      // Prepend slots for cards whose quantity increased (new copies go to visual top)
      for (const [id, q] of quota) {
        for (let i = (used.get(id) ?? 0); i < q; i++) kept.unshift(id);
      }
      this.stackOrders.set(groupKey, kept);
    }
    return this.stackOrders.get(groupKey)!
      .map(id => cards.find(c => c.id === id))
      .filter((c): c is CollectionCardDto => c != null);
  }

  onStackPointerDown(groupKey: string, idx: number, card: CollectionCardDto, event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let overCommander = false;

    const d = card.cardDetails;
    const isCommanderEligible = !!d &&
      (d.supertypes?.includes('Legendary') ?? false) &&
      ((d.cardTypes?.includes(CardType.Creature) ?? false) || (d.cardTypes?.includes(CardType.Planeswalker) ?? false));

    const cleanup = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragging && drop) {
        if (overCommander && isCommanderEligible) {
          this.deck$.pipe(take(1)).subscribe(deck => {
            if (deck) this.setCommander(card.oracleId, deck);
          });
        } else {
          const srcIdx = this.stackDragFromIdx;
          const dstIdx = this.stackDragOverIdx;
          if (srcIdx != null && dstIdx != null && srcIdx !== dstIdx) {
            const order = [...(this.stackOrders.get(groupKey) ?? [])];
            const [moved] = order.splice(srcIdx, 1);
            order.splice(dstIdx, 0, moved);
            this.stackOrders.set(groupKey, order);
          }
        }
      }
      document.body.style.removeProperty('cursor');
      this.stackDragGroupKey = null;
      this.stackDragFromIdx = null;
      this.stackDragOverIdx = null;
      if (this.cpSlotDragOver) { this.cpSlotDragOver = false; }
      if (dragging) this.cdr.markForCheck();
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        dragging = true;
        this.stackDragGroupKey = groupKey;
        this.stackDragFromIdx = idx;
        document.body.style.setProperty('cursor', 'grabbing', 'important');
        this.cdr.markForCheck();
      }

      // Check hover over commander slot (only relevant for eligible cards in commander decks)
      if (isCommanderEligible) {
        const cpEl = document.querySelector<HTMLElement>('.cp-portrait-wrap');
        if (cpEl) {
          const r = cpEl.getBoundingClientRect();
          const nowOver = e.clientX >= r.left && e.clientX <= r.right &&
                          e.clientY >= r.top  && e.clientY <= r.bottom;
          if (nowOver !== overCommander) {
            overCommander = nowOver;
            this.cpSlotDragOver = nowOver;
            this.cdr.markForCheck();
          }
          if (nowOver) return; // don't update stack hover while over commander slot
        }
      }

      const listEl = document.querySelector<HTMLElement>(`.visual-stack[data-group-key="${groupKey}"]`);
      if (!listEl) return;
      const cards = Array.from(listEl.querySelectorAll<HTMLElement>('.visual-card:not(.is-stack-dragging)'));
      let dstIdx = cards.length;
      for (let i = 0; i < cards.length; i++) {
        if (e.clientY < cards[i].getBoundingClientRect().top + 16) { dstIdx = i; break; }
      }
      if (this.stackDragOverIdx !== dstIdx) {
        this.stackDragOverIdx = dstIdx;
        this.cdr.markForCheck();
      }
    };

    const onUp = () => cleanup(true);
    const onCancel = () => cleanup(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  trackByIdx(index: number): number { return index; }
  trackByGroupKey(_index: number, group: CmcGroup): string { return group.key; }

  filteredCards(deck: DeckDetailDto): CollectionCardDto[] {
    const cards = deck.commanderOracleId
      ? deck.cards.filter(c => c.oracleId !== deck.commanderOracleId)
      : deck.cards;
    if (!this.filterQuery.trim()) return cards;
    const q = this.filterQuery.toLowerCase();
    return cards.filter(c => c.cardDetails?.name.toLowerCase().includes(q));
  }

  getDeckStats(deck: DeckDetailDto): DeckStats {
    const cards = deck.cards;
    const total = cards.reduce((s, c) => s + this.cardCount(c), 0);
    const countOf = (type: CardType) =>
      cards.filter(c => c.cardDetails?.cardTypes.includes(type)).reduce((s, c) => s + this.cardCount(c), 0);

    const lands        = countOf(CardType.Land);
    const creatures    = countOf(CardType.Creature);
    const instants     = countOf(CardType.Instant);
    const sorceries    = countOf(CardType.Sorcery);
    const enchantments = countOf(CardType.Enchantment);
    const artifacts    = countOf(CardType.Artifact);
    const planeswalkers = countOf(CardType.Planeswalker);
    const other = Math.max(0, total - lands - creatures - instants - sorceries - enchantments - artifacts - planeswalkers);

    const nonLandCards = cards.filter(c => !this.isLand(c));
    const totalNL = nonLandCards.reduce((s, c) => s + this.cardCount(c), 0);
    const avgCmcSum = nonLandCards.reduce((s, c) => s + (c.cardDetails?.manaValue ?? 0) * this.cardCount(c), 0);
    const avgCmc = totalNL > 0 ? Math.round((avgCmcSum / totalNL) * 10) / 10 : 0;

    const curveData = new Map<number, number>();
    for (const c of nonLandCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      curveData.set(cmc, (curveData.get(cmc) ?? 0) + this.cardCount(c));
    }
    const curve = [1, 2, 3, 4, 5, 6, 7].map(cmc => ({ cmc, count: curveData.get(cmc) ?? 0, label: cmc === 7 ? '7+' : String(cmc) }));
    const curveMax = Math.max(...curve.map(b => b.count), 1);

    return { total, lands, creatures, instants, sorceries, enchantments, artifacts, planeswalkers, other, avgCmc, curve, curveMax };
  }

  // ---- Side panel / Search panel ----------------------------

  toggleSidePanel(): void {
    this.showSidePanel = !this.showSidePanel;
    this.cdr.markForCheck();
  }

  toggleSearchPanel(): void {
    this.showSearchPanel = !this.showSearchPanel;
    if (this.showSearchPanel) {
      this.showManaSuggestPanel = false;
      this.showSuggestionsPanel = false;
    } else {
      this.commanderSearchMode = false;
    }
  }

  openCommanderSearch(): void {
    this.commanderSearchMode = true;
    this.showSearchPanel = true;
    this.cdr.markForCheck();
  }

  onPanelCardAdd(event: { oracleId: string; scryfallId: string; isCommanderEligible?: boolean }): void {
    this.store.dispatch(DeckActions.addCard({
      deckId: this.deckId,
      request: { oracleId: event.oracleId, quantity: 1, scryfallId: event.scryfallId },
    }));
    if (this.commanderSearchMode) {
      if (event.isCommanderEligible) {
        this.deck$.pipe(take(1)).subscribe(deck => {
          if (deck) this.setCommander(event.oracleId, deck);
        });
      }
      this.commanderSearchMode = false;
      this.showSearchPanel = false;
    }
  }

  onFitRequested(event: { card: CardDto; commanderCard: CardDto }): void {
    const { card, commanderCard } = event;

    const cmdColors = new Set((commanderCard.colorIdentity ?? []).map(c => String(c)));
    const isColorViolation = (card.colorIdentity ?? []).some(c => !cmdColors.has(String(c)));

    if (isColorViolation) {
      this.searchPanel?.setSynergyScore(card.oracleId, {
        score: 0,
        reason: `Color identity violation — cannot be played in a ${commanderCard.name} deck.`,
      });
      return;
    }

    this.deck$.pipe(
      take(1),
      switchMap(deck => {
        const deckCardNames = (deck?.cards ?? [])
          .filter(c => c.cardDetails?.oracleId !== card.oracleId &&
                       c.cardDetails?.oracleId !== commanderCard.oracleId)
          .map(c => c.cardDetails?.name)
          .filter((n): n is string => !!n);

        return this.deckApi.analyzeSynergy({
          commanderOracleId: commanderCard.oracleId,
          commanderName:     commanderCard.name,
          commanderText:     commanderCard.oracleText,
          cardOracleId:      card.oracleId,
          cardName:          card.name,
          cardText:          card.oracleText,
          deckCardNames,
        });
      }),
      takeUntil(this.destroy$),
      catchError(() => of({ score: 0, reason: 'Failed to get synergy score.' })),
    ).subscribe(result => {
      this.searchPanel?.setSynergyScore(card.oracleId, result);
    });
  }

  addSuggestedCard(event: { oracleId: string; scryfallId: string }): void {
    this.store.dispatch(DeckActions.addCard({
      deckId: this.deckId,
      request: { oracleId: event.oracleId, scryfallId: event.scryfallId, quantity: 1, quantityFoil: 0 },
    }));
  }

  removeSuggestedCard(oracleId: string): void {
    this.deck$.pipe(take(1)).subscribe(deck => {
      const card = deck?.cards.find(c => c.cardDetails?.oracleId === oracleId);
      if (card) this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
    });
  }

  // ---- Card quantity controls --------------------------------

  increment(card: CollectionCardDto): void {
    this.store.dispatch(DeckActions.updateCard({
      deckId: this.deckId, cardId: card.id,
      request: { quantity: card.quantity + 1, quantityFoil: card.quantityFoil },
    }));
  }

  decrement(card: CollectionCardDto): void {
    if (this.cardCount(card) <= 1) {
      this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
    } else if (card.quantity > 0) {
      this.store.dispatch(DeckActions.updateCard({
        deckId: this.deckId, cardId: card.id,
        request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
      }));
    } else {
      this.store.dispatch(DeckActions.updateCard({
        deckId: this.deckId, cardId: card.id,
        request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
      }));
    }
  }

  freeIncrement(card: CollectionCardDto, colId: string): void {
    const col = this.freeColumns.find(c => c.id === colId);
    if (col) { col.cardIds.push(card.id); this.freeLayoutDirty = true; }
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
      const col = this.freeColumns.find(c => c.id === colId);
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
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  closeCard(): void { this.selectedCard = null; this.modalSlotKey = null; this.cdr.markForCheck(); }

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
    const front = card.cardDetails?.imageUriNormal ?? null;
    const back  = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(slotKey) && back ? back : front;
  }

  tileHasBack(card: CollectionCardDto): boolean { return !!card.cardDetails?.imageUriNormalBack; }

  getAlsoOwnedIds(deck: DeckDetailDto): string[] {
    if (!this.selectedCard) return [];
    return deck.cards
      .filter(c => c.oracleId === this.selectedCard!.oracleId
                && c.scryfallId && c.scryfallId !== this.selectedCard!.scryfallId)
      .map(c => c.scryfallId!);
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
      this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name, coverUri: deck.coverUri ?? null, format: deck.format ?? null, commanderOracleId: deck.commanderOracleId ?? null, tags: deck.tags ?? [] }));
    }
    this.isRenaming = false;
    this.cdr.markForCheck();
  }

  cancelRename(): void { this.isRenaming = false; this.cdr.markForCheck(); }

  addTag(deck: DeckDetailDto, tag: string): void {
    const t = tag.trim().toLowerCase();
    if (!t || (deck.tags ?? []).includes(t)) return;
    const tags = [...(deck.tags ?? []), t];
    this.store.dispatch(DeckActions.updateDeckMeta({ id: deck.id, name: deck.name, coverUri: deck.coverUri ?? null, format: deck.format ?? null, commanderOracleId: deck.commanderOracleId ?? null, tags }));
  }

  removeTag(deck: DeckDetailDto, tag: string): void {
    const tags = (deck.tags ?? []).filter(t => t !== tag);
    this.store.dispatch(DeckActions.updateDeckMeta({ id: deck.id, name: deck.name, coverUri: deck.coverUri ?? null, format: deck.format ?? null, commanderOracleId: deck.commanderOracleId ?? null, tags }));
  }

  commitTagInput(deck: DeckDetailDto): void {
    const tag = this.tagDraft.trim();
    if (tag) { this.addTag(deck, tag); this.tagDraft = ''; }
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
    this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name: deck.name, coverUri: uri, format: deck.format ?? null, commanderOracleId: deck.commanderOracleId ?? null, tags: deck.tags ?? [] }));
    this.closeDetailCoverPicker();
  }

  // ---- Format / Commander -------------------------------------------------

  showFormatMenu      = false;
  showCommanderPicker = false;
  cpSlotDragOver      = false;
  commanderSearchMode = false;

  toggleFormatMenu(): void {
    this.showFormatMenu = !this.showFormatMenu;
    this.cdr.markForCheck();
  }

  setFormat(format: string | null, deck: DeckDetailDto): void {
    this.showFormatMenu = false;
    // Clearing format also clears the commander
    const commanderOracleId = format === 'commander' ? (deck.commanderOracleId ?? null) : null;
    this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name: deck.name, coverUri: deck.coverUri ?? null, format, commanderOracleId, tags: deck.tags ?? [] }));
    this.cdr.markForCheck();
  }

  setCommander(oracleId: string | null, deck: DeckDetailDto): void {
    this.showCommanderPicker = false;
    this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name: deck.name, coverUri: deck.coverUri ?? null, format: deck.format ?? null, commanderOracleId: oracleId, tags: deck.tags ?? [] }));
    this.cdr.markForCheck();
  }

  onCpSlotDragOver(event: DragEvent, deck: DeckDetailDto): void {
    const hasCommanderCard = event.dataTransfer?.types.includes('application/x-commander-card') ?? false;
    const draggedCard = this.dragCardId ? deck.cards.find(c => c.id === this.dragCardId) : null;
    const isEligible  = draggedCard ? this.eligibleCommanders(deck).some(c => c.id === draggedCard.id) : false;
    if (!hasCommanderCard && !isEligible) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = hasCommanderCard ? 'copy' : 'move';
    if (!this.cpSlotDragOver) { this.cpSlotDragOver = true; this.cdr.markForCheck(); }
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
      this.store.dispatch(DeckActions.addCard({
        deckId: this.deckId,
        request: { oracleId: searchCard.oracleId, quantity: 1, scryfallId: searchCard.scryfallId },
      }));
      this.setCommander(searchCard.oracleId, deck);
      return;
    }

    if (this.dragCardId) {
      const card = deck.cards.find(c => c.id === this.dragCardId);
      if (card && this.eligibleCommanders(deck).some(c => c.id === card.id)) {
        this.setCommander(card.oracleId, deck);
      }
      this.onDragEnd();
    }
    this.cdr.markForCheck();
  }

  /** Cards eligible to be commander: legendary creatures or planeswalkers. */
  eligibleCommanders(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(c => {
      const d = c.cardDetails;
      if (!d) return false;
      const legendary = d.supertypes?.includes('Legendary') ?? false;
      const creature   = d.cardTypes?.includes(CardType.Creature) ?? false;
      const pw         = d.cardTypes?.includes(CardType.Planeswalker) ?? false;
      return legendary && (creature || pw);
    });
  }

  commanderCard(deck: DeckDetailDto): CollectionCardDto | null {
    if (!deck.commanderOracleId) return null;
    return deck.cards.find(c => c.oracleId === deck.commanderOracleId) ?? null;
  }

  /** Cards that are banned in Commander. */
  bannedInCommander(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(c => c.cardDetails?.legalities?.['commander'] === 'banned');
  }

  bannedViolationNames(deck: DeckDetailDto): string {
    return this.bannedInCommander(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  /** Cards on the Commander game changers list (legal but flagged as highly impactful). */
  gameChangerCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(c => c.cardDetails?.gameChanger === true);
  }

  gameChangerNames(deck: DeckDetailDto): string {
    return this.gameChangerCards(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  /** Cards that grant an extra turn. */
  extraTurnCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(c => /takes? an extra turn/i.test(c.cardDetails?.oracleText ?? ''));
  }

  /** Cards that destroy or exile all (or all nonbasic) lands. */
  mldCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(c => {
      const text = c.cardDetails?.oracleText ?? '';
      return /destroy all (?:nonbasic )?lands/i.test(text)
          || /exile all (?:\w+, )*lands/i.test(text)
          || /destroy all permanents/i.test(text)
          || /exile all permanents/i.test(text);
    });
  }

  /** True if the deck can chain extra turns (2+ extra-turn spells, or 1 + graveyard recursion). */
  hasChainingExtraTurns(deck: DeckDetailDto): boolean {
    const etCards = this.extraTurnCards(deck);
    if (etCards.length === 0) return false;
    if (etCards.length >= 2) return true;
    return deck.cards.some(c => {
      const text = c.cardDetails?.oracleText ?? '';
      return /return target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(text)
          || /cast target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(text)
          || /you may cast (?:a card|target (?:instant or sorcery|instant|sorcery)) from your graveyard/i.test(text);
    });
  }

  /** Estimated Commander Bracket (1–4). Bracket 5 is intent-based and not computed. */
  commanderBracket(deck: DeckDetailDto): number {
    const gcCount = this.gameChangerCards(deck).length;
    const mld     = this.mldCards(deck).length > 0;
    const chain   = this.hasChainingExtraTurns(deck);
    if (gcCount > 3 || mld || chain) return 4;
    if (gcCount > 0) return 3;
    if (this.extraTurnCards(deck).length > 0) return 2;
    return 1;
  }

  commanderBracketTooltip(deck: DeckDetailDto): string {
    const reasons: string[] = [];
    const gcCount = this.gameChangerCards(deck).length;
    if (gcCount > 0) reasons.push(`${gcCount} Game Changer${gcCount > 1 ? 's' : ''}: ${this.gameChangerNames(deck)}`);
    const mld = this.mldCards(deck);
    if (mld.length > 0) reasons.push(`MLD: ${mld.map(c => c.cardDetails?.name ?? '').join(', ')}`);
    const et = this.extraTurnCards(deck);
    if (et.length > 0) {
      const label = this.hasChainingExtraTurns(deck) ? 'Chaining extra turns' : 'Extra turn';
      reasons.push(`${label}: ${et.map(c => c.cardDetails?.name ?? '').join(', ')}`);
    }
    return reasons.length ? reasons.join(' | ') : 'No power-level flags detected';
  }

  mldCardNames(deck: DeckDetailDto): string {
    return this.mldCards(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  extraTurnCardNames(deck: DeckDetailDto): string {
    return this.extraTurnCards(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  bracketInfoOpen = false;

  toggleBracketInfo(e: MouseEvent): void {
    e.stopPropagation();
    this.violationPanelType = null;
    this.bracketInfoOpen = !this.bracketInfoOpen;
  }

  closeBracketInfo(): void { this.bracketInfoOpen = false; }

  // ---- Violation detail panel ------------------------------------

  violationPanelType: 'banned' | 'singleton' | 'color-id' | null = null;

  openViolationPanel(type: 'banned' | 'singleton' | 'color-id', e: MouseEvent): void {
    e.stopPropagation();
    this.bracketInfoOpen = false;
    this.violationPanelType = this.violationPanelType === type ? null : type;
  }

  closeViolationPanel(): void { this.violationPanelType = null; }

  violationPanelCards(deck: DeckDetailDto): CollectionCardDto[] {
    switch (this.violationPanelType) {
      case 'banned':    return this.bannedInCommander(deck);
      case 'singleton': return this.singletonViolations(deck);
      case 'color-id':  return this.colorIdentityViolations(deck);
      default: return [];
    }
  }

  violationPanelTitle(): string {
    switch (this.violationPanelType) {
      case 'banned':    return 'Banned Cards';
      case 'singleton': return 'Singleton Violations';
      case 'color-id':  return 'Color Identity Violations';
      default: return '';
    }
  }

  colorIdViolationColors(card: CollectionCardDto, deck: DeckDetailDto): string {
    const cmdr = this.commanderCard(deck);
    if (!cmdr?.cardDetails) return '';
    const allowed = new Set(cmdr.cardDetails.colorIdentity ?? []);
    return (card.cardDetails?.colorIdentity ?? [])
      .filter(col => !allowed.has(col))
      .join('');
  }

  cardTypeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  removeViolatingCard(card: CollectionCardDto): void {
    this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
  }

  /** Non-basic cards with more than one total copy — violates singleton.
   *  Counts across all records sharing the same oracleId (different printings
   *  of the same card each contribute their quantity). */
  singletonViolations(deck: DeckDetailDto): CollectionCardDto[] {
    const totalByOracle = new Map<string, number>();
    for (const c of deck.cards) {
      if (!this.isBasicLand(c))
        totalByOracle.set(c.oracleId, (totalByOracle.get(c.oracleId) ?? 0) + this.cardCount(c));
    }
    return deck.cards.filter(c =>
      !this.isBasicLand(c) && (totalByOracle.get(c.oracleId) ?? 0) > 1
    );
  }

  /** Total copies of a card across all records with the same oracleId. */
  totalOracleCount(card: CollectionCardDto, deck: DeckDetailDto): number {
    return deck.cards
      .filter(c => c.oracleId === card.oracleId)
      .reduce((sum, c) => sum + this.cardCount(c), 0);
  }

  /** Cards whose color identity falls outside the commander's. */
  colorIdentityViolations(deck: DeckDetailDto): CollectionCardDto[] {
    const cmdr = this.commanderCard(deck);
    if (!cmdr?.cardDetails) return [];
    const allowed = new Set(cmdr.cardDetails.colorIdentity ?? []);
    return deck.cards.filter(c => {
      if (c.oracleId === cmdr.oracleId) return false;
      return (c.cardDetails?.colorIdentity ?? []).some(col => !allowed.has(col));
    });
  }

  singletonViolationNames(deck: DeckDetailDto): string {
    return this.singletonViolations(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  colorIdentityViolationNames(deck: DeckDetailDto): string {
    return this.colorIdentityViolations(deck).map(c => c.cardDetails?.name ?? '').join(', ');
  }

  formatLabel(format: string | null): string {
    const labels: Record<string, string> = {
      commander: 'CMDR', brawl: 'BRAWL', oathbreaker: 'OATH',
      standard: 'STD', pioneer: 'PIO', modern: 'MOD',
      legacy: 'LEG', vintage: 'VIN', pauper: 'PAU',
    };
    return format ? (labels[format] ?? format.toUpperCase()) : 'FORMAT';
  }

  hasFormatViolations(deck: DeckDetailDto): boolean {
    return this.hasCommanderViolations(deck) || this.formatViolations(deck).length > 0;
  }

  formatViolations(deck: DeckDetailDto): CollectionCardDto[] {
    const fmt = deck.format;
    if (!fmt || fmt === 'commander') return [];
    return deck.cards.filter(c => {
      const leg = c.cardDetails?.legalities?.[fmt];
      return leg && leg !== 'legal';
    });
  }

  hasCommanderViolations(deck: DeckDetailDto): boolean {
    if (deck.format !== 'commander') return false;
    return this.totalCount(deck) !== 100
      || !deck.commanderOracleId
      || this.singletonViolations(deck).length > 0
      || this.colorIdentityViolations(deck).length > 0
      || this.bannedInCommander(deck).length > 0;
  }

  /** Returns 'banned', 'singleton', 'color-id', 'both', or null. Banned takes highest priority. */
  cardViolationType(card: CollectionCardDto, deck: DeckDetailDto): string | null {
    if (deck.format !== 'commander') return null;
    if (card.cardDetails?.legalities?.['commander'] === 'banned') return 'banned';
    const isSingleton = this.singletonViolations(deck).some(c => c.id === card.id);
    const isColorId   = this.colorIdentityViolations(deck).some(c => c.id === card.id);
    if (isSingleton && isColorId) return 'both';
    if (isSingleton) return 'singleton';
    if (isColorId)   return 'color-id';
    return null;
  }

  cardViolationClass(card: CollectionCardDto, deck: DeckDetailDto): string {
    const classes: string[] = [];
    const type = this.cardViolationType(card, deck);
    if (type) classes.push(`violation-${type}`);
    if (deck.format === 'commander' && card.cardDetails?.gameChanger) classes.push('is-game-changer');
    return classes.join(' ');
  }

  private isBasicLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.supertypes?.includes('Basic') ?? false;
  }

  manaColorSymbol(color: string): string {
    const map: Record<string, string> = { W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌲', C: '◇' };
    return map[color] ?? color;
  }

  targetCount(deck: DeckDetailDto): number {
    if (deck.format === 'commander') return 100;
    if (deck.format === 'brawl' || deck.format === 'oathbreaker') return 60;
    return 60;
  }
}
