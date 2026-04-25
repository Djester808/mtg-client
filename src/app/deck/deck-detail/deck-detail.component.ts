import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  Observable, Subject, mergeMap, takeUntil, of, catchError, map, filter, take,
} from 'rxjs';
import { AppState } from '../../store';
import { DeckActions } from '../../store/deck/deck.actions';
import { selectActiveDeck, selectDeckLoading } from '../../store/deck/deck.selectors';
import { CollectionCardDto, PrintingDto, CardType } from '../../models/game.models';
import { DeckDetailDto } from '../../services/deck-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CardSearchPanelComponent } from '../../components/card-search-panel/card-search-panel.component';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';

export type SortMode = 'cmc' | 'name' | 'type';
export type ViewMode = 'list' | 'visual' | 'free';

export interface FreeColumn {
  id: string;
  label: string;
  cardIds: string[];
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
  imports: [CommonModule, FormsModule, ManaCostComponent, CardModalComponent, CardSearchPanelComponent, CoverPickerModalComponent],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetailComponent implements OnInit, OnDestroy {
  deck$: Observable<DeckDetailDto | null>;
  loading$: Observable<boolean>;

  filterQuery     = '';
  sortMode: SortMode = 'cmc';
  viewMode: ViewMode = 'list';
  showSearchPanel = false;

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

  showDetailCoverPicker = false;

  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
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
  private multiDragCards: { colId: string; cardId: string }[] = [];
  private dragSelectOrigin = { x: 0, y: 0 };
  private dragSelectListEl: HTMLElement | null = null;
  private dragSelectJustEnded = false;

  private pendingNavigation: (() => void) | null = null;
  private pendingSortMode: SortMode | null = null;
  private pendingSortDeck: DeckDetailDto | null = null;

  stackOrders = new Map<string, string[]>();
  stackDragGroupKey: string | null = null;
  stackDragFromIdx: number | null = null;
  stackDragOverIdx: number | null = null;

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  private deckId = '';
  private printingsLoad$ = new Subject<string>();
  printingsCache = new Map<string, PrintingDto[]>();
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private collectionApi: CollectionApiService,
    private cdr: ChangeDetectorRef,
  ) {
    this.deck$ = this.store.select(selectActiveDeck);
    this.loading$ = this.store.select(selectDeckLoading);
  }

  ngOnInit(): void {
    this.deckId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(DeckActions.loadDeck({ id: this.deckId }));

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
      if (mode === 'free' && deck) this.enterFreeMode(deck);
      this.cdr.markForCheck();
    };
    if (this.viewMode === 'free' && mode !== 'free') {
      this.checkUnsaved(doSwitch);
    } else {
      doSwitch();
    }
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
    this.cdr.markForCheck();
  }

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
    const cards = col.cardIds
      .map(id => deck.cards.find(c => c.id === id))
      .filter((c): c is CollectionCardDto => c != null);
    const targetId = this.selectedFreeColId ?? this.freeColumns[0]?.id;
    if (col.id === targetId) {
      // Count explicit assignments across all columns
      const assignedCounts = new Map<string, number>();
      for (const fc of this.freeColumns)
        for (const id of fc.cardIds)
          assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);
      // Append one tile per unassigned copy
      const unassigned: CollectionCardDto[] = [];
      for (const card of deck.cards) {
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
    if (this.selectedFreeColId && this.selectedFreeColId !== colId) {
      const fromIdx = this.freeColumns.findIndex(c => c.id === this.selectedFreeColId);
      const cols = [...this.freeColumns];
      const [moved] = cols.splice(fromIdx, 1);
      const insertAt = cols.findIndex(c => c.id === colId);
      cols.splice(insertAt, 0, moved);
      this.freeColumns = cols;
      this.freeLayoutDirty = true;
      this.selectedFreeColId = null;
    } else {
      this.selectedFreeColId = this.selectedFreeColId === colId ? null : colId;
    }
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
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.dragSelectListEl) return;
    if (this.isDragSelecting) this.dragSelectJustEnded = true;
    this.isDragSelecting = false;
    this.dragSelectBox = null;
    this.dragSelectListEl = null;
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
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
    }

    if (isMulti) {
      this.isDraggingMultiCards = true;
      this.multiDragCards = Array.from(this.selectedCardSlots.entries()).map(([slot, cid]) => {
        const slashIdx = slot.lastIndexOf('/');
        return { colId: slot.slice(0, slashIdx), cardId: cid };
      });
    } else {
      this.isDraggingMultiCards = false;
      this.multiDragCards = [];
    }

    setTimeout(() => { this.dragCardId = card.id; this.cdr.markForCheck(); });
  }

  onColDragOver(colId: string, event: DragEvent): void {
    if (this.dragColId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

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
    }

    this.freeLayoutDirty = true;
    this.onDragEnd();
  }

  private executeMultiCardDrop(targetColId: string, dropIdx: number): void {
    // Build removal counts per column per cardId
    const removals = new Map<string, Map<string, number>>();
    const toInsert: string[] = [];

    for (const { colId, cardId } of this.multiDragCards) {
      if (!removals.has(colId)) removals.set(colId, new Map());
      const m = removals.get(colId)!;
      m.set(cardId, (m.get(cardId) ?? 0) + 1);
      toInsert.push(cardId);
    }

    let adjustedDropIdx = dropIdx;
    const cols = this.freeColumns.map(col => {
      const removeMap = removals.get(col.id);
      if (!removeMap) return col;

      const counts = new Map(removeMap);
      const remaining: string[] = [];
      for (let i = 0; i < col.cardIds.length; i++) {
        const cid = col.cardIds[i];
        const toRemove = counts.get(cid) ?? 0;
        if (toRemove > 0) {
          counts.set(cid, toRemove - 1);
          if (col.id === targetColId && i < adjustedDropIdx) adjustedDropIdx--;
        } else {
          remaining.push(cid);
        }
      }
      return { ...col, cardIds: remaining };
    });

    const ti = cols.findIndex(c => c.id === targetColId);
    if (ti >= 0) {
      const adj = Math.max(0, Math.min(adjustedDropIdx, cols[ti].cardIds.length));
      cols[ti] = {
        ...cols[ti],
        cardIds: [...cols[ti].cardIds.slice(0, adj), ...toInsert, ...cols[ti].cardIds.slice(adj)],
      };
    }

    this.freeColumns = cols;
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
    if (!this.dragColId) return;
    const rel = event.relatedTarget as HTMLElement | null;
    if (!rel || !(event.currentTarget as HTMLElement).contains(rel)) {
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

  onStackPointerDown(groupKey: string, idx: number, event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const cleanup = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragging && drop) {
        const srcIdx = this.stackDragFromIdx;
        const dstIdx = this.stackDragOverIdx;
        if (srcIdx != null && dstIdx != null && srcIdx !== dstIdx) {
          const order = [...(this.stackOrders.get(groupKey) ?? [])];
          const [moved] = order.splice(srcIdx, 1);
          order.splice(dstIdx, 0, moved);
          this.stackOrders.set(groupKey, order);
        }
      }
      document.body.style.removeProperty('cursor');
      this.stackDragGroupKey = null;
      this.stackDragFromIdx = null;
      this.stackDragOverIdx = null;
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
    if (!this.filterQuery.trim()) return deck.cards;
    const q = this.filterQuery.toLowerCase();
    return deck.cards.filter(c => c.cardDetails?.name.toLowerCase().includes(q));
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

  // ---- Search panel ------------------------------------------

  toggleSearchPanel(): void { this.showSearchPanel = !this.showSearchPanel; }

  onPanelCardAdd(event: { oracleId: string; scryfallId: string }): void {
    this.store.dispatch(DeckActions.addCard({
      deckId: this.deckId,
      request: { oracleId: event.oracleId, quantity: 1, scryfallId: event.scryfallId },
    }));
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

  // ---- Card modal --------------------------------------------

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  closeCard(): void { this.selectedCard = null; this.cdr.markForCheck(); }

  toggleTileFlip(slotKey: string, card: CollectionCardDto, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedCardIds.has(slotKey)) this.flippedCardIds.delete(slotKey);
    else this.flippedCardIds.add(slotKey);
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
      this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name, coverUri: deck.coverUri ?? null }));
    }
    this.isRenaming = false;
    this.cdr.markForCheck();
  }

  cancelRename(): void { this.isRenaming = false; this.cdr.markForCheck(); }

  // ---- Detail cover picker ----------------------------------

  openDetailCoverPicker(deck: DeckDetailDto): void {
    this.showDetailCoverPicker = true;
    this.cdr.markForCheck();
  }

  closeDetailCoverPicker(): void {
    this.showDetailCoverPicker = false;
    this.cdr.markForCheck();
  }

  onDetailCoverSelected(deck: DeckDetailDto, uri: string | null): void {
    this.store.dispatch(DeckActions.updateDeckMeta({ id: this.deckId, name: deck.name, coverUri: uri }));
    this.closeDetailCoverPicker();
  }
}
