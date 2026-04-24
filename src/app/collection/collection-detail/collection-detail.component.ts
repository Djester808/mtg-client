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
  Observable, Subject, debounceTime, distinctUntilChanged,
  switchMap, mergeMap, takeUntil, of, catchError, map,
} from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectActiveCollection, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDetailDto, CollectionCardDto, CardDto, PrintingDto, CardType } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ManaCostComponent, OracleSymbolsPipe],
  templateUrl: './collection-detail.component.html',
  styleUrls: ['./collection-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  collection$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;

  filterQuery = '';
  searchQuery = '';
  searchResults: CardDto[] = [];
  searchLoading = false;
  showSearchPanel = false;

  hoveredCard: CollectionCardDto | null = null;
  hoveredCardPrintings: PrintingDto[] = [];
  printingsLoading = false;

  /** oracleId → selected scryfallId for search-panel result rows */
  searchSelectedScryfallId = new Map<string, string>();
  addErrors = new Set<string>();

  // ---- Card detail modal ----------------------------------------
  selectedCard: CollectionCardDto | null = null;
  /** scryfallId of the printing whose art is shown in the modal (not necessarily the owned one) */
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  /** Set of collection card IDs currently showing their back face in the grid */
  flippedCardIds = new Set<string>();
  modalX = 120;
  modalY = 80;
  modalWidth = 760;
  modalHeight = 580;
  isDragging = false;
  isResizing = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartW = 0;
  private resizeStartH = 0;

  readonly CAROUSEL_PAGE = 5;
  carouselStart = 0;

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  get carouselPrintings(): PrintingDto[] {
    return this.modalPrintings.slice(this.carouselStart, this.carouselStart + this.CAROUSEL_PAGE);
  }

  get carouselEnd(): number {
    return Math.min(this.carouselStart + this.CAROUSEL_PAGE, this.modalPrintings.length);
  }

  get carouselCanPrev(): boolean { return this.carouselStart > 0; }

  get carouselCanNext(): boolean {
    return this.carouselStart + this.CAROUSEL_PAGE < this.modalPrintings.length;
  }

  carouselPrev(): void {
    this.carouselStart = Math.max(0, this.carouselStart - this.CAROUSEL_PAGE);
    this.cdr.markForCheck();
  }

  carouselNext(): void {
    this.carouselStart = Math.min(
      Math.max(0, this.modalPrintings.length - this.CAROUSEL_PAGE),
      this.carouselStart + this.CAROUSEL_PAGE,
    );
    this.cdr.markForCheck();
  }

  get modalImage(): string | null {
    if (!this.selectedCard) return null;
    const p = this.modalPrintings.find(x => x.scryfallId === this.modalViewScryfallId);
    const front = p?.imageUriNormal ?? this.selectedCard.cardDetails?.imageUriNormal ?? null;
    const back  = p?.imageUriNormalBack ?? this.selectedCard.cardDetails?.imageUriNormalBack ?? null;
    return this.modalFlipped && back ? back : front;
  }

  get modalIsLand(): boolean {
    return this.modalCardDetails?.cardTypes.includes(CardType.Land) ?? false;
  }

  get modalHasBack(): boolean {
    if (!this.selectedCard) return false;
    const p = this.modalPrintings.find(x => x.scryfallId === this.modalViewScryfallId);
    return !!(p?.imageUriNormalBack ?? this.selectedCard.cardDetails?.imageUriNormalBack);
  }

  /** For DFC cards the name is stored as "Front // Back". Returns the active face's name. */
  get modalDisplayName(): string {
    const name = this.modalCardDetails?.name ?? this.selectedCard?.oracleId ?? '';
    if (!this.modalHasBack) return name;
    const parts = name.split(' // ');
    return this.modalFlipped && parts.length > 1 ? parts[1] : parts[0];
  }

  /** For DFC cards oracle text is joined with \n//\n. Returns the active face's text. */
  get modalOracleText(): string | null {
    const text = this.modalCardDetails?.oracleText ?? null;
    if (!text || !this.modalHasBack) return text;
    const parts = text.split('\n//\n');
    return this.modalFlipped && parts.length > 1 ? parts[1] : parts[0];
  }

  tileImage(card: CollectionCardDto): string | null {
    const front = card.cardDetails?.imageUriNormal ?? null;
    const back  = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(card.id) && back ? back : front;
  }

  tileHasBack(card: CollectionCardDto): boolean {
    return !!card.cardDetails?.imageUriNormalBack;
  }

  get modalCurrentPrinting(): PrintingDto | null {
    const id = this.modalViewScryfallId ?? this.selectedCard?.scryfallId;
    return this.modalPrintings.find(p => p.scryfallId === id) ?? null;
  }

  /** Returns a CardDto-shaped object merging printing-specific text with base oracle data. Instant — no extra API call. */
  get modalCardDetails(): CardDto | null {
    const base = this.selectedCard?.cardDetails ?? null;
    const p = this.modalViewScryfallId
      ? this.modalPrintings.find(x => x.scryfallId === this.modalViewScryfallId) ?? null
      : null;
    if (!p || !base) return base;
    return {
      ...base,
      oracleText: p.oracleText ?? base.oracleText,
      flavorText: p.flavorText ?? null,
      artist:     p.artist     ?? base.artist,
      manaCost:   p.manaCost   ?? base.manaCost,
      setCode:    p.setCode    ?? base.setCode,
    };
  }

  private collectionId = '';
  private searchInput$ = new Subject<string>();
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
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) {
          this.searchResults = [];
          this.searchLoading = false;
          this.cdr.markForCheck();
          return of([] as CardDto[]);
        }
        this.searchLoading = true;
        this.cdr.markForCheck();
        return this.gameApi.searchCards(q, 20);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: results => {
        this.searchResults = results;
        this.searchSelectedScryfallId.clear();
        this.addErrors.clear();
        this.searchLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.searchLoading = false;
        this.cdr.markForCheck();
      },
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
    }
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
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
    if (!card.cardDetails) return '';
    const types = card.cardDetails.cardTypes.join(' ');
    const sub   = card.cardDetails.subtypes?.length ? ` — ${card.cardDetails.subtypes.join(' ')}` : '';
    const sup   = card.cardDetails.supertypes?.length ? `${card.cardDetails.supertypes.join(' ')} ` : '';
    return `${sup}${types}${sub}`;
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
    this.carouselStart = 0;
    this.modalWidth  = Math.min(900, Math.floor(window.innerWidth  * 0.92));
    this.modalHeight = Math.max(580, Math.min(680, Math.floor(window.innerHeight * 0.85)));
    this.modalX = Math.max(0, (window.innerWidth - this.modalWidth) / 2);
    this.modalY = Math.max(0, Math.min(60, window.innerHeight * 0.06));
    // For search results scryfallId is null; fall back to first cached printing if available
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached)
      this.searchLoadSubject$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  onResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartW = this.modalWidth;
    this.resizeStartH = this.modalHeight;
    event.preventDefault();
    event.stopPropagation();
  }

  closeCard(): void {
    this.selectedCard = null;
    this.isDragging = false;
    this.cdr.markForCheck();
  }

  onModalDragStart(event: MouseEvent): void {
    this.isDragging = true;
    this.dragOffsetX = event.clientX - this.modalX;
    this.dragOffsetY = event.clientY - this.modalY;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      this.modalX = Math.max(0, event.clientX - this.dragOffsetX);
      this.modalY = Math.max(0, event.clientY - this.dragOffsetY);
      this.cdr.markForCheck();
    }
    if (this.isResizing) {
      const dx = event.clientX - this.resizeStartX;
      const dy = event.clientY - this.resizeStartY;
      const delta = (dx + dy) / 2;
      this.modalWidth  = Math.max(680, Math.min(Math.floor(window.innerWidth  * 0.96), this.resizeStartW + delta));
      this.modalHeight = Math.max(580, Math.min(Math.floor(window.innerHeight * 0.92), this.resizeStartH + delta));
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    this.isDragging = false;
    this.isResizing = false;
  }

  onModalPrintingClick(printing: PrintingDto): void {
    this.modalViewScryfallId = printing.scryfallId;
    this.modalFlipped = false;
    this.cdr.markForCheck();
  }

  toggleModalFlip(): void {
    this.modalFlipped = !this.modalFlipped;
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

  modalTypeLineFor(card: CollectionCardDto): string {
    return this.typeLine(card);
  }

  isAlsoOwned(col: CollectionDetailDto, card: CollectionCardDto, scryfallId: string): boolean {
    return scryfallId !== card.scryfallId &&
      col.cards.some(c => c.oracleId === card.oracleId && c.scryfallId === scryfallId);
  }

  viewedEntry(col: CollectionDetailDto, card: CollectionCardDto): CollectionCardDto | null {
    if (!this.modalViewScryfallId) return null;
    return col.cards.find(
      c => c.oracleId === card.oracleId && c.scryfallId === this.modalViewScryfallId
    ) ?? null;
  }

}

