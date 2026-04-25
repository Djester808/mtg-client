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
  Observable, Subject, debounceTime,
  switchMap, mergeMap, concatMap, takeUntil, of, catchError, map,
} from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectActiveCollection, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDetailDto, CollectionCardDto, CardDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { buildTypeLine } from '../../utils/card.utils';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ManaCostComponent, OracleSymbolsPipe, CardModalComponent],
  templateUrl: './collection-detail.component.html',
  styleUrls: ['./collection-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  collection$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;

  readonly SEARCH_PAGE = 20;

  filterQuery = '';
  searchQuery = '';
  searchResults: CardDto[] = [];
  searchLoading = false;
  searchLoadingMore = false;
  searchHasMore = false;
  showSearchPanel = false;

  searchMatchCase = false;
  searchMatchWord = false;
  searchUseRegex  = false;

  private searchOffset = 0;
  private lastSearchQuery = '';

  hoveredCard: CollectionCardDto | null = null;
  hoveredCardPrintings: PrintingDto[] = [];
  printingsLoading = false;

  /** oracleId → selected scryfallId for search-panel result rows */
  searchSelectedScryfallId = new Map<string, string>();
  addErrors = new Set<string>();
  searchFlippedIds = new Set<string>();

  // ---- Card detail modal ----------------------------------------
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  /** Set of collection card IDs currently showing their back face in the grid */
  flippedCardIds = new Set<string>();
  private noteDraft = new Map<string, string>();

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  tileImage(card: CollectionCardDto): string | null {
    const front = card.cardDetails?.imageUriNormal ?? null;
    const back  = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(card.id) && back ? back : front;
  }

  tileHasBack(card: CollectionCardDto): boolean {
    return !!card.cardDetails?.imageUriNormalBack;
  }

  private collectionId = '';
  private searchInput$ = new Subject<string>();
  private searchLoadMore$ = new Subject<void>();
  /** Card-grid hover/select: switchMap cancels in-flight when user moves quickly */
  private hoverSubject$ = new Subject<string>();           // emits oracleId
  /** Search-panel set dropdowns: mergeMap so multiple rows load in parallel */
  private searchLoadSubject$ = new Subject<string>();      // emits oracleId
  printingsCache = new Map<string, PrintingDto[]>();
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private gameApi: GameApiService,
    private collectionApi: CollectionApiService,
    private cdr: ChangeDetectorRef,
  ) {
    this.collection$ = this.store.select(selectActiveCollection);
    this.loading$ = this.store.select(selectCollectionLoading);
  }

  ngOnInit(): void {
    this.collectionId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(CollectionActions.loadCollection({ id: this.collectionId }));

    // Debounced card search
    this.searchInput$.pipe(
      debounceTime(180),
      switchMap(q => {
        if (q.trim().length < 2) {
          this.searchResults = [];
          this.searchLoading = false;
          this.searchHasMore = false;
          this.cdr.markForCheck();
          return of([] as CardDto[]);
        }
        this.searchLoading = true;
        this.searchOffset = 0;
        this.lastSearchQuery = q.trim();
        this.cdr.markForCheck();
        return this.gameApi.searchCards(q.trim(), this.SEARCH_PAGE, 0, 'name', 'asc', this.searchMatchCase, this.searchMatchWord, this.searchUseRegex).pipe(
          catchError(() => of([] as CardDto[])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(results => {
      this.searchResults = results;
      this.searchHasMore = results.length === this.SEARCH_PAGE;
      this.searchSelectedScryfallId.clear();
      this.searchFlippedIds.clear();
      this.addErrors.clear();
      this.searchLoading = false;
      results.forEach(c => {
        if (!this.printingsCache.has(c.oracleId)) this.searchLoadSubject$.next(c.oracleId);
      });
      this.cdr.markForCheck();
    });

    // Load more search results
    this.searchLoadMore$.pipe(
      concatMap(() => {
        if (!this.lastSearchQuery || this.searchLoadingMore) return of([] as CardDto[]);
        this.searchLoadingMore = true;
        this.searchOffset += this.SEARCH_PAGE;
        this.cdr.markForCheck();
        return this.gameApi.searchCards(this.lastSearchQuery, this.SEARCH_PAGE, this.searchOffset, 'name', 'asc', this.searchMatchCase, this.searchMatchWord, this.searchUseRegex).pipe(
          catchError(() => of([] as CardDto[])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(results => {
      this.searchResults = [...this.searchResults, ...results];
      this.searchHasMore = results.length === this.SEARCH_PAGE;
      this.searchLoadingMore = false;
      results.forEach(c => {
        if (!this.printingsCache.has(c.oracleId)) this.searchLoadSubject$.next(c.oracleId);
      });
      this.cdr.markForCheck();
    });

    // Card-grid printings: switchMap cancels in-flight on fast hover/select
    this.hoverSubject$.pipe(
      switchMap(oracleId => {
        const cached = this.printingsCache.get(oracleId);
        if (cached) return of({ oracleId, printings: cached });
        this.printingsLoading = true;
        this.cdr.markForCheck();
        return this.collectionApi.getPrintings(oracleId).pipe(
          map(printings => ({ oracleId, printings })),
          catchError(() => of({ oracleId, printings: [] as PrintingDto[] })),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(({ oracleId, printings }) => {
      this.printingsCache.set(oracleId, printings);
      if (this.hoveredCard?.oracleId === oracleId) {
        this.hoveredCardPrintings = printings;
        this.printingsLoading = false;
      }
      this.cdr.markForCheck();
    });

    // Search-panel printings: mergeMap loads multiple rows in parallel
    this.searchLoadSubject$.pipe(
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
      // If this modal is open for the same oracle ID and no printing is selected yet, select the first
      if (this.selectedCard?.oracleId === oracleId && !this.modalViewScryfallId && printings.length)
        this.modalViewScryfallId = printings[0].scryfallId;
      // Auto-select the only printing so Add works without user interaction
      if (printings.length === 1 && !this.searchSelectedScryfallId.has(oracleId))
        this.searchSelectedScryfallId.set(oracleId, printings[0].scryfallId);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void {
    this.router.navigate(['/collection']);
  }

  toggleSearchPanel(): void {
    this.showSearchPanel = !this.showSearchPanel;
    if (!this.showSearchPanel) {
      this.searchQuery = '';
      this.searchResults = [];
      this.searchSelectedScryfallId.clear();
      this.searchFlippedIds.clear();
    }
  }

  toggleSearchFlip(oracleId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.searchFlippedIds.has(oracleId)) this.searchFlippedIds.delete(oracleId);
    else this.searchFlippedIds.add(oracleId);
    this.cdr.markForCheck();
  }

  searchCardImage(card: CardDto): string | null {
    if (this.searchFlippedIds.has(card.oracleId) && card.imageUriNormalBack)
      return card.imageUriNormalBack;
    return card.imageUriSmall;
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  loadMoreSearch(): void {
    this.searchLoadMore$.next();
  }

  toggleSearchMatchCase(): void {
    this.searchMatchCase = !this.searchMatchCase;
    if (this.searchQuery.length >= 2) this.searchInput$.next(this.searchQuery);
  }

  toggleSearchMatchWord(): void {
    this.searchMatchWord = !this.searchMatchWord;
    if (this.searchQuery.length >= 2) this.searchInput$.next(this.searchQuery);
  }

  toggleSearchUseRegex(): void {
    this.searchUseRegex = !this.searchUseRegex;
    if (this.searchQuery.length >= 2) this.searchInput$.next(this.searchQuery);
  }

  // ---- Card-grid hover (for info panel) --------------------

  onCardHover(card: CollectionCardDto): void {
    this.hoveredCard = card;
    this.hoveredCardPrintings = this.printingsCache.get(card.oracleId) ?? [];
    this.printingsLoading = !this.printingsCache.has(card.oracleId);
    this.cdr.markForCheck();
    this.hoverSubject$.next(card.oracleId);
  }

  onCardLeave(): void {
    this.hoveredCard = null;
    this.hoveredCardPrintings = [];
    this.printingsLoading = false;
    this.cdr.markForCheck();
  }

  // ---- Card-grid set dropdown ------------------------------

  onSelectFocus(card: CollectionCardDto): void {
    if (!this.printingsCache.has(card.oracleId))
      this.hoverSubject$.next(card.oracleId);
  }

  onSetChange(card: CollectionCardDto, scryfallId: string): void {
    const printing = this.printingsCache.get(card.oracleId)?.find(p => p.scryfallId === scryfallId);
    if (printing) this.selectPrinting(card, printing);
  }

  selectPrinting(card: CollectionCardDto, printing: PrintingDto): void {
    if (card.scryfallId === printing.scryfallId) return;
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: card.id,
      request: { quantity: card.quantity, quantityFoil: card.quantityFoil, scryfallId: printing.scryfallId },
    }));
  }

  currentSetTooltip(card: CollectionCardDto): string {
    const p = this.printingsCache.get(card.oracleId)?.find(x => x.scryfallId === card.scryfallId);
    if (p) return `${p.setName}${p.collectorNumber ? ' #' + p.collectorNumber : ''}`;
    return card.cardDetails?.setCode?.toUpperCase() ?? '';
  }

  // ---- Search-panel set dropdown ---------------------------

  onSearchSelectFocus(oracleId: string): void {
    if (!this.printingsCache.has(oracleId))
      this.searchLoadSubject$.next(oracleId);
  }

  onSearchSetChange(oracleId: string, scryfallId: string): void {
    this.searchSelectedScryfallId.set(oracleId, scryfallId);
    this.addErrors.delete(oracleId);
  }

  searchSetTooltip(oracleId: string): string {
    const scryfallId = this.searchSelectedScryfallId.get(oracleId);
    const p = this.printingsCache.get(oracleId)?.find(x => x.scryfallId === scryfallId);
    return p ? `${p.setName}${p.collectorNumber ? ' #' + p.collectorNumber : ''}` : 'Select a printing';
  }

  // ---- Card list helpers -----------------------------------

  filteredCards(collection: CollectionDetailDto): CollectionCardDto[] {
    if (!this.filterQuery.trim()) return collection.cards;
    const q = this.filterQuery.toLowerCase();
    return collection.cards.filter(c =>
      c.cardDetails?.name.toLowerCase().includes(q) || c.oracleId.toLowerCase().includes(q)
    );
  }

  ownedEntry(collection: CollectionDetailDto, oracleId: string): CollectionCardDto | undefined {
    return collection.cards.find(c => c.oracleId === oracleId);
  }

  // ---- Card mutations --------------------------------------

  addCard(card: CardDto): void {
    const scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) {
      this.addErrors.add(card.oracleId);
      this.cdr.markForCheck();
      return;
    }
    this.addErrors.delete(card.oracleId);
    this.store.dispatch(CollectionActions.addCard({
      collectionId: this.collectionId,
      request: { oracleId: card.oracleId, quantity: 1, scryfallId },
    }));
  }

  incrementNormal(card: CollectionCardDto): void {
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: card.id,
      request: { quantity: card.quantity + 1, quantityFoil: card.quantityFoil },
    }));
  }

  decrementNormal(card: CollectionCardDto): void {
    if (card.quantity <= 0) return;
    if (card.quantity === 1 && card.quantityFoil === 0) { this.removeCard(card); return; }
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: card.id,
      request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
    }));
  }

  incrementFoil(card: CollectionCardDto): void {
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: card.id,
      request: { quantity: card.quantity, quantityFoil: card.quantityFoil + 1 },
    }));
  }

  decrementFoil(card: CollectionCardDto): void {
    if (card.quantityFoil <= 0) return;
    if (card.quantityFoil === 1 && card.quantity === 0) { this.removeCard(card); return; }
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: card.id,
      request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
    }));
  }

  removeCard(card: CollectionCardDto): void {
    this.store.dispatch(CollectionActions.removeCard({
      collectionId: this.collectionId,
      cardId: card.id,
    }));
  }

  // ---- Display helpers -------------------------------------

  typeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  highlightParts(text: string, query: string): { text: string; match: boolean }[] {
    const q = query.trim();
    if (!q) return [{ text, match: false }];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    const testRe = new RegExp(`^${escaped}$`, 'i');
    return parts
      .filter(p => p.length > 0)
      .map(p => ({ text: p, match: testRe.test(p) }));
  }

  // ---- Card detail modal ---------------------------------------

  openSearchCard(card: CardDto): void {
    const synthetic: CollectionCardDto = {
      id: '',
      oracleId: card.oracleId,
      scryfallId: null,
      quantity: 0,
      quantityFoil: 0,
      notes: null,
      addedAt: '',
      cardDetails: card,
    };
    this.openCard(synthetic);
  }

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.searchLoadSubject$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  closeCard(): void {
    this.selectedCard = null;
    this.cdr.markForCheck();
  }

  toggleTileFlip(card: CollectionCardDto, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedCardIds.has(card.id)) this.flippedCardIds.delete(card.id);
    else this.flippedCardIds.add(card.id);
    this.cdr.markForCheck();
  }

  // ---- Modal quantity controls --------------------------------

  modalIncrementNormal(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (entry?.id) {
      this.store.dispatch(CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: entry.id,
        request: { quantity: entry.quantity + 1, quantityFoil: entry.quantityFoil },
      }));
    } else if (this.modalViewScryfallId) {
      this.store.dispatch(CollectionActions.addCard({
        collectionId: this.collectionId,
        request: { oracleId: card.oracleId, scryfallId: this.modalViewScryfallId, quantity: 1 },
      }));
    }
  }

  modalDecrementNormal(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id || entry.quantity <= 0) return;
    if (entry.quantity === 1 && entry.quantityFoil === 0) {
      this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }));
    } else {
      this.store.dispatch(CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: entry.id,
        request: { quantity: entry.quantity - 1, quantityFoil: entry.quantityFoil },
      }));
    }
  }

  modalIncrementFoil(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (entry?.id) {
      this.store.dispatch(CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: entry.id,
        request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil + 1 },
      }));
    } else if (this.modalViewScryfallId) {
      this.store.dispatch(CollectionActions.addCard({
        collectionId: this.collectionId,
        request: { oracleId: card.oracleId, scryfallId: this.modalViewScryfallId, quantity: 0, quantityFoil: 1 },
      }));
    }
  }

  modalDecrementFoil(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id || entry.quantityFoil <= 0) return;
    if (entry.quantityFoil === 1 && entry.quantity === 0) {
      this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }));
    } else {
      this.store.dispatch(CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: entry.id,
        request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil - 1 },
      }));
    }
  }

  getAlsoOwnedIds(col: CollectionDetailDto): string[] {
    if (!this.selectedCard) return [];
    return col.cards
      .filter(c => c.oracleId === this.selectedCard!.oracleId
                && c.scryfallId
                && c.scryfallId !== this.selectedCard!.scryfallId)
      .map(c => c.scryfallId!);
  }

  viewedEntry(col: CollectionDetailDto, card: CollectionCardDto): CollectionCardDto | null {
    if (!this.modalViewScryfallId) return null;
    return col.cards.find(
      c => c.oracleId === card.oracleId && c.scryfallId === this.modalViewScryfallId
    ) ?? null;
  }

  // ---- Modal notes ----------------------------------------

  noteDraftValue(entry: CollectionCardDto): string {
    const stored = entry.notes ?? '';
    if (!this.noteDraft.has(entry.id)) return stored;
    const draft = this.noteDraft.get(entry.id)!;
    if (draft === stored) { this.noteDraft.delete(entry.id); return stored; }
    return draft;
  }

  setNoteDraft(entryId: string, value: string): void {
    this.noteDraft.set(entryId, value);
  }

  saveNotes(entry: CollectionCardDto): void {
    const draft = this.noteDraft.has(entry.id) ? this.noteDraft.get(entry.id)! : (entry.notes ?? '');
    const stored = entry.notes ?? '';
    if (draft === stored) { this.noteDraft.delete(entry.id); return; }
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: entry.id,
      request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil, notes: draft || null },
    }));
  }

}

