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
import { DeckActions } from '../../store/deck/deck.actions';
import { selectActiveDeck, selectDeckLoading } from '../../store/deck/deck.selectors';
import {
  CollectionDetailDto, CollectionCardDto, CardDto, PrintingDto, CardType,
} from '../../models/game.models';
import { parseDeckMeta } from '../../models/deck.models';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';

export type SortMode = 'cmc' | 'name' | 'type';

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
  imports: [CommonModule, FormsModule, ManaCostComponent, OracleSymbolsPipe, CardModalComponent],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetailComponent implements OnInit, OnDestroy {
  deck$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;

  readonly SEARCH_PAGE = 20;

  filterQuery = '';
  sortMode: SortMode = 'cmc';

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

  searchSelectedScryfallId = new Map<string, string>();
  addErrors = new Set<string>();
  searchFlippedIds = new Set<string>();

  // Card modal
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  flippedCardIds = new Set<string>();

  // Cover card hover
  hoveredCoverCardId: string | null = null;

  // Rename
  isRenaming = false;
  renameDraft = '';

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  private deckId = '';
  private searchInput$ = new Subject<string>();
  private searchLoadMore$ = new Subject<void>();
  private searchLoadSubject$ = new Subject<string>();
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
    this.deck$ = this.store.select(selectActiveDeck);
    this.loading$ = this.store.select(selectDeckLoading);
  }

  ngOnInit(): void {
    this.deckId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(DeckActions.loadDeck({ id: this.deckId }));

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
        return this.gameApi.searchCards(
          q.trim(), this.SEARCH_PAGE, 0, 'name', 'asc',
          this.searchMatchCase, this.searchMatchWord, this.searchUseRegex,
        ).pipe(catchError(() => of([] as CardDto[])));
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

    this.searchLoadMore$.pipe(
      concatMap(() => {
        if (!this.lastSearchQuery || this.searchLoadingMore) return of([] as CardDto[]);
        this.searchLoadingMore = true;
        this.searchOffset += this.SEARCH_PAGE;
        this.cdr.markForCheck();
        return this.gameApi.searchCards(
          this.lastSearchQuery, this.SEARCH_PAGE, this.searchOffset, 'name', 'asc',
          this.searchMatchCase, this.searchMatchWord, this.searchUseRegex,
        ).pipe(catchError(() => of([] as CardDto[])));
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
      if (this.selectedCard?.oracleId === oracleId && !this.modalViewScryfallId && printings.length)
        this.modalViewScryfallId = printings[0].scryfallId;
      if (printings.length === 1 && !this.searchSelectedScryfallId.has(oracleId))
        this.searchSelectedScryfallId.set(oracleId, printings[0].scryfallId);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void { this.router.navigate(['/deck']); }

  // ---- Sort & filter ----------------------------------------

  setSortMode(mode: SortMode): void {
    this.sortMode = mode;
    this.cdr.markForCheck();
  }

  totalCount(deck: CollectionDetailDto): number {
    return deck.cards.reduce((s, c) => s + c.quantity + c.quantityFoil, 0);
  }

  cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  private isLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.cardTypes.includes(CardType.Land) ?? false;
  }

  getGroups(deck: CollectionDetailDto): CmcGroup[] {
    const filtered = this.filteredCards(deck);

    if (this.sortMode === 'name') {
      const sorted = [...filtered].sort((a, b) =>
        (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
      return [{
        label: 'All Cards',
        key: 'all',
        cards: sorted,
        totalCount: sorted.reduce((s, c) => s + this.cardCount(c), 0),
      }];
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
        if (cards.length) {
          groups.push({
            label: CardType[type] + 's',
            key: `type-${type}`,
            cards,
            totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
          });
        }
      }
      // uncategorised
      const typed = new Set(groups.flatMap(g => g.cards.map(c => c.id)));
      const rest = filtered.filter(c => !typed.has(c.id));
      if (rest.length) {
        groups.push({ label: 'Other', key: 'type-other', cards: rest, totalCount: rest.reduce((s, c) => s + this.cardCount(c), 0) });
      }
      return groups;
    }

    // default: CMC
    const nonLands = filtered
      .filter(c => !this.isLand(c))
      .sort((a, b) => (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0)
                    || (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
    const lands = filtered
      .filter(c => this.isLand(c))
      .sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));

    const groups: CmcGroup[] = [];
    const buckets: Map<string, CollectionCardDto[]> = new Map();
    for (const c of nonLands) {
      const cmc = c.cardDetails?.manaValue ?? 0;
      const key = cmc >= 6 ? '6+' : String(cmc);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    const cmcOrder = ['0', '1', '2', '3', '4', '5', '6+'];
    for (const key of cmcOrder) {
      const cards = buckets.get(key);
      if (cards?.length) {
        groups.push({
          label: key === '6+' ? 'CMC 6+' : `CMC ${key}`,
          key: `cmc-${key}`,
          cards,
          totalCount: cards.reduce((s, c) => s + this.cardCount(c), 0),
        });
      }
    }
    if (lands.length) {
      groups.push({
        label: 'Lands',
        key: 'lands',
        cards: lands,
        totalCount: lands.reduce((s, c) => s + this.cardCount(c), 0),
      });
    }
    return groups;
  }

  filteredCards(deck: CollectionDetailDto): CollectionCardDto[] {
    if (!this.filterQuery.trim()) return deck.cards;
    const q = this.filterQuery.toLowerCase();
    return deck.cards.filter(c => c.cardDetails?.name.toLowerCase().includes(q));
  }

  getDeckStats(deck: CollectionDetailDto): DeckStats {
    const cards = deck.cards;
    const total = cards.reduce((s, c) => s + this.cardCount(c), 0);
    const countOf = (type: CardType) =>
      cards.filter(c => c.cardDetails?.cardTypes.includes(type))
           .reduce((s, c) => s + this.cardCount(c), 0);

    const lands = countOf(CardType.Land);
    const creatures = countOf(CardType.Creature);
    const instants = countOf(CardType.Instant);
    const sorceries = countOf(CardType.Sorcery);
    const enchantments = countOf(CardType.Enchantment);
    const artifacts = countOf(CardType.Artifact);
    const planeswalkers = countOf(CardType.Planeswalker);
    const other = total - lands - creatures - instants - sorceries - enchantments - artifacts - planeswalkers;

    const nonLandCards = cards.filter(c => !this.isLand(c));
    const totalNonLandCopies = nonLandCards.reduce((s, c) => s + this.cardCount(c), 0);
    let avgCmcSum = 0;
    for (const c of nonLandCards) {
      avgCmcSum += (c.cardDetails?.manaValue ?? 0) * this.cardCount(c);
    }
    const avgCmc = totalNonLandCopies > 0 ? Math.round((avgCmcSum / totalNonLandCopies) * 10) / 10 : 0;

    const curveData: Map<number, number> = new Map();
    for (const c of nonLandCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      curveData.set(cmc, (curveData.get(cmc) ?? 0) + this.cardCount(c));
    }
    const curve = [1, 2, 3, 4, 5, 6, 7].map(cmc => ({
      cmc,
      count: curveData.get(cmc) ?? 0,
      label: cmc === 7 ? '7+' : String(cmc),
    }));
    const curveMax = Math.max(...curve.map(b => b.count), 1);

    return { total, lands, creatures, instants, sorceries, enchantments, artifacts, planeswalkers, other: Math.max(0, other), avgCmc, curve, curveMax };
  }

  // ---- Search panel ----------------------------------------

  toggleSearchPanel(): void {
    this.showSearchPanel = !this.showSearchPanel;
    if (!this.showSearchPanel) {
      this.searchQuery = '';
      this.searchResults = [];
      this.searchSelectedScryfallId.clear();
      this.searchFlippedIds.clear();
    }
  }

  onSearchInput(value: string): void { this.searchInput$.next(value); }
  loadMoreSearch(): void { this.searchLoadMore$.next(); }

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

  onSearchSelectFocus(oracleId: string): void {
    if (!this.printingsCache.has(oracleId)) this.searchLoadSubject$.next(oracleId);
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

  addCard(card: CardDto): void {
    const scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) { this.addErrors.add(card.oracleId); this.cdr.markForCheck(); return; }
    this.addErrors.delete(card.oracleId);
    this.store.dispatch(DeckActions.addCard({
      deckId: this.deckId,
      request: { oracleId: card.oracleId, quantity: 1, scryfallId },
    }));
  }

  ownedEntry(deck: CollectionDetailDto, oracleId: string): CollectionCardDto | undefined {
    return deck.cards.find(c => c.oracleId === oracleId);
  }

  highlightParts(text: string, query: string): { text: string; match: boolean }[] {
    const q = query.trim();
    if (!q) return [{ text, match: false }];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    const testRe = new RegExp(`^${escaped}$`, 'i');
    return parts.filter(p => p.length > 0).map(p => ({ text: p, match: testRe.test(p) }));
  }

  // ---- Card quantity controls ------------------------------

  increment(card: CollectionCardDto): void {
    this.store.dispatch(DeckActions.updateCard({
      deckId: this.deckId,
      cardId: card.id,
      request: { quantity: card.quantity + 1, quantityFoil: card.quantityFoil },
    }));
  }

  decrement(card: CollectionCardDto): void {
    if (this.cardCount(card) <= 1) {
      this.store.dispatch(DeckActions.removeCard({ deckId: this.deckId, cardId: card.id }));
    } else if (card.quantity > 0) {
      this.store.dispatch(DeckActions.updateCard({
        deckId: this.deckId,
        cardId: card.id,
        request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
      }));
    } else {
      this.store.dispatch(DeckActions.updateCard({
        deckId: this.deckId,
        cardId: card.id,
        request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
      }));
    }
  }

  // ---- Cover card selection --------------------------------

  setCover(deck: CollectionDetailDto, card: CollectionCardDto): void {
    const uri = card.cardDetails?.imageUriArtCrop ?? card.cardDetails?.imageUriNormal ?? null;
    const meta = parseDeckMeta(deck.description);
    const alreadyCover = meta.coverUri === uri;
    this.store.dispatch(DeckActions.updateDeckMeta({
      id: this.deckId,
      name: deck.name,
      coverUri: alreadyCover ? null : uri,
    }));
  }

  isCover(deck: CollectionDetailDto, card: CollectionCardDto): boolean {
    const uri = card.cardDetails?.imageUriArtCrop ?? card.cardDetails?.imageUriNormal ?? null;
    return parseDeckMeta(deck.description).coverUri === uri;
  }

  // ---- Card modal ------------------------------------------

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.searchLoadSubject$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  openSearchCard(card: CardDto): void {
    this.openCard({
      id: '', oracleId: card.oracleId, scryfallId: null,
      quantity: 0, quantityFoil: 0, notes: null, addedAt: '',
      cardDetails: card,
    });
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

  getAlsoOwnedIds(deck: CollectionDetailDto): string[] {
    if (!this.selectedCard) return [];
    return deck.cards
      .filter(c => c.oracleId === this.selectedCard!.oracleId
                && c.scryfallId && c.scryfallId !== this.selectedCard!.scryfallId)
      .map(c => c.scryfallId!);
  }

  typeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  // ---- Rename ----------------------------------------------

  startRename(deck: CollectionDetailDto): void {
    this.renameDraft = deck.name;
    this.isRenaming = true;
    this.cdr.markForCheck();
  }

  commitRename(deck: CollectionDetailDto): void {
    const name = this.renameDraft.trim();
    if (name && name !== deck.name) {
      const meta = parseDeckMeta(deck.description);
      this.store.dispatch(DeckActions.updateDeckMeta({
        id: this.deckId,
        name,
        coverUri: meta.coverUri ?? null,
      }));
    }
    this.isRenaming = false;
    this.cdr.markForCheck();
  }

  cancelRename(): void { this.isRenaming = false; this.cdr.markForCheck(); }
}
