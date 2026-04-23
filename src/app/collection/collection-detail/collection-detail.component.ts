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
  Observable, Subject, debounceTime, distinctUntilChanged,
  switchMap, mergeMap, takeUntil, of, catchError, map,
} from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectActiveCollection, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDetailDto, CollectionCardDto, CardDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
}
