import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  Observable, Subject, mergeMap, takeUntil, of, catchError, map,
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
export type ViewMode = 'list' | 'visual' | 'stack' | 'free';

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

  goBack(): void { this.router.navigate(['/deck']); }

  // ---- Sort & filter ----------------------------------------

  setSortMode(mode: SortMode): void { this.sortMode = mode; this.cdr.markForCheck(); }

  setViewMode(mode: ViewMode, deck?: DeckDetailDto): void {
    this.viewMode = mode;
    if (mode === 'free' && deck) this.enterFreeMode(deck);
    this.cdr.markForCheck();
  }

  // ---- Free mode layout ------------------------------------

  private enterFreeMode(deck: DeckDetailDto): void {
    const saved = localStorage.getItem(`deck-free-${this.deckId}`);
    if (saved) {
      try {
        const parsed: FreeColumn[] = JSON.parse(saved);
        if (parsed.length) {
          this.freeColumns = parsed;
          this.syncFreeColumns(deck);
          return;
        }
      } catch { /* fall through */ }
    }
    const prevFilter = this.filterQuery;
    this.filterQuery = '';
    this.freeColumns = this.getGroups(deck).map(g => ({
      id: crypto.randomUUID(),
      label: g.label,
      cardIds: g.cards.flatMap(c => Array(this.cardCount(c)).fill(c.id)),
    }));
    this.filterQuery = prevFilter;
    this.saveFreeLayout();
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
      this.freeColumns = [
        { ...this.freeColumns[0], cardIds: [...this.freeColumns[0].cardIds, ...extra] },
        ...this.freeColumns.slice(1),
      ];
      this.saveFreeLayout();
    }
  }

  saveFreeLayout(): void {
    localStorage.setItem(`deck-free-${this.deckId}`, JSON.stringify(this.freeColumns));
  }

  resetFreeLayout(deck: DeckDetailDto): void {
    localStorage.removeItem(`deck-free-${this.deckId}`);
    this.freeColumns = [];
    this.enterFreeMode(deck);
    this.cdr.markForCheck();
  }

  getCardsForColumn(col: FreeColumn, deck: DeckDetailDto): CollectionCardDto[] {
    const cards = col.cardIds
      .map(id => deck.cards.find(c => c.id === id))
      .filter((c): c is CollectionCardDto => c != null);
    if (this.freeColumns[0]?.id === col.id) {
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

  addFreeColumn(): void {
    this.freeColumns = [...this.freeColumns, {
      id: crypto.randomUUID(), label: 'New Column', cardIds: [],
    }];
    this.saveFreeLayout();
    this.cdr.markForCheck();
  }

  removeColumn(colId: string): void {
    if (this.freeColumns.length <= 1) return;
    const col = this.freeColumns.find(c => c.id === colId);
    if (!col) return;
    const remaining = this.freeColumns.filter(c => c.id !== colId);
    remaining[0] = { ...remaining[0], cardIds: [...remaining[0].cardIds, ...col.cardIds] };
    this.freeColumns = remaining;
    this.saveFreeLayout();
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
      this.saveFreeLayout();
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
    this.dragSourceColId = colId;
    this.dragSrcRenderedIdx = renderedIdx;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
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

    const cardId = this.dragCardId;
    const dropIdx = this.dragOverIndex ?? 0;

    // Remove exactly one copy from the source column (handles duplicates correctly)
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
    this.saveFreeLayout();
    this.onDragEnd();
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
    setTimeout(() => { this.dragColId = col.id; this.cdr.markForCheck(); });
  }

  onColDragEnd(): void {
    this.dragColId = null;
    this.dragOverColInsertIdx = null;
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
    this.executeColumnDrop();
    this.dragColId = null;
    this.dragOverColInsertIdx = null;
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
    this.saveFreeLayout();
  }

  onDragEnd(): void {
    this.dragCardId = null;
    this.dragSrcRenderedIdx = null;
    this.dragSourceColId = null;
    this.dragOverColId = null;
    this.dragOverIndex = null;
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

  toggleTileFlip(card: CollectionCardDto, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedCardIds.has(card.id)) this.flippedCardIds.delete(card.id);
    else this.flippedCardIds.add(card.id);
    this.cdr.markForCheck();
  }

  tileImage(card: CollectionCardDto): string | null {
    const front = card.cardDetails?.imageUriNormal ?? null;
    const back  = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(card.id) && back ? back : front;
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
