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
  Observable, Subject, switchMap, mergeMap, takeUntil, take, of, catchError, map,
} from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectActiveCollection, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDetailDto, CollectionCardDto, PrintingDto } from '../../models/game.models';
import { buildTypeLine } from '../../utils/card.utils';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CardSearchPanelComponent } from '../../components/card-search-panel/card-search-panel.component';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ManaCostComponent, OracleSymbolsPipe, CardModalComponent, CardSearchPanelComponent, CoverPickerModalComponent],
  templateUrl: './collection-detail.component.html',
  styleUrls: ['./collection-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  collection$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;

  filterQuery      = '';
  showSearchPanel  = false;
  showDetailCoverPicker = false;
  zoomLevel = 1.0;

  zoomIn():  void { this.zoomLevel = Math.min(2.0, +(this.zoomLevel + 0.25).toFixed(2)); localStorage.setItem('collection-zoom', String(this.zoomLevel)); }
  zoomOut(): void { this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2)); localStorage.setItem('collection-zoom', String(this.zoomLevel)); }
  get zoomLabel(): string { return Math.round(this.zoomLevel * 100) + '%'; }

  hoveredCard: CollectionCardDto | null = null;
  printingsLoading = false;

  // ---- Card detail modal ----------------------------------------
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
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
  private hoverSubject$ = new Subject<string>();
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
    this.collection$ = this.store.select(selectActiveCollection);
    this.loading$ = this.store.select(selectCollectionLoading);
  }

  ngOnInit(): void {
    this.collectionId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(CollectionActions.loadCollection({ id: this.collectionId }));
    const savedZoom = localStorage.getItem('collection-zoom');
    if (savedZoom) this.zoomLevel = Math.max(0.5, Math.min(2.0, parseFloat(savedZoom) || 1.0));

    // Card-grid hover: switchMap cancels in-flight when user moves quickly
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
        this.printingsLoading = false;
      }
      this.cdr.markForCheck();
    });

    // Modal printings loader: mergeMap (one card at a time, but parallel-safe)
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

  goBack(): void {
    this.router.navigate(['/collection']);
  }

  toggleSearchPanel(): void {
    this.showSearchPanel = !this.showSearchPanel;
  }

  // ---- Search panel event handler -----------------------------------

  onPanelCardRemove(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe(col => {
      if (!col) return;
      const card = col.cards.find(c => c.oracleId === oracleId);
      if (!card) return;
      this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }));
    });
  }

  onPanelDecrementNormal(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe(col => {
      if (!col) return;
      const card = col.cards.find(c => c.oracleId === oracleId);
      if (!card || card.quantity <= 0) return;
      if (card.quantity === 1 && card.quantityFoil === 0) {
        this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }));
      } else {
        this.store.dispatch(CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: card.id,
          request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
        }));
      }
    });
  }

  onPanelDecrementFoil(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe(col => {
      if (!col) return;
      const card = col.cards.find(c => c.oracleId === oracleId);
      if (!card || card.quantityFoil <= 0) return;
      if (card.quantityFoil === 1 && card.quantity === 0) {
        this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }));
      } else {
        this.store.dispatch(CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: card.id,
          request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
        }));
      }
    });
  }

  onPanelCardAdd(event: { oracleId: string; scryfallId: string; foil?: boolean }): void {
    this.store.dispatch(CollectionActions.addCard({
      collectionId: this.collectionId,
      request: {
        oracleId: event.oracleId,
        scryfallId: event.scryfallId,
        quantity: event.foil ? 0 : 1,
        quantityFoil: event.foil ? 1 : 0,
      },
    }));
  }

  onAreaDragOver(event: DragEvent): void {
    const isSearch = event.dataTransfer?.types.includes('application/x-search-card');
    if (isSearch) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  }

  onAreaDrop(event: DragEvent): void {
    try {
      const raw = event.dataTransfer?.getData('application/x-search-card');
      if (!raw) return;
      event.preventDefault();
      const { oracleId, scryfallId } = JSON.parse(raw) as { oracleId: string; scryfallId: string };
      this.onPanelCardAdd({ oracleId, scryfallId });
    } catch { /* ignore */ }
  }

  // ---- Card-grid hover -------------------------------------------

  onCardHover(card: CollectionCardDto): void {
    this.hoveredCard = card;
    this.printingsLoading = !this.printingsCache.has(card.oracleId);
    this.cdr.markForCheck();
    this.hoverSubject$.next(card.oracleId);
  }

  onCardLeave(): void {
    this.hoveredCard = null;
    this.printingsLoading = false;
    this.cdr.markForCheck();
  }

  // ---- Card-grid set dropdown ------------------------------------

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

  // ---- Card list helpers -----------------------------------------

  collectionCardNames(collection: CollectionDetailDto): string[] {
    return [...new Set(
      collection.cards.map(c => c.cardDetails?.name).filter((n): n is string => !!n)
    )].sort();
  }

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

  // ---- Card mutations --------------------------------------------

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

  // ---- Display helpers ------------------------------------------

  typeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  // ---- Card detail modal ----------------------------------------

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
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

  // ---- Modal quantity controls ----------------------------------

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

  modalRemoveCard(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id) return;
    this.store.dispatch(CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }));
    this.closeCard();
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

  // ---- Modal notes -----------------------------------------------

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
    const draft  = this.noteDraft.has(entry.id) ? this.noteDraft.get(entry.id)! : (entry.notes ?? '');
    const stored = entry.notes ?? '';
    if (draft === stored) { this.noteDraft.delete(entry.id); return; }
    this.store.dispatch(CollectionActions.updateCard({
      collectionId: this.collectionId,
      cardId: entry.id,
      request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil, notes: draft || null },
    }));
  }

  // ---- Detail cover picker ----------------------------------

  openDetailCoverPicker(): void {
    this.showDetailCoverPicker = true;
    this.cdr.markForCheck();
  }

  closeDetailCoverPicker(): void {
    this.showDetailCoverPicker = false;
    this.cdr.markForCheck();
  }

  onDetailCoverSelected(col: CollectionDetailDto, uri: string | null): void {
    this.store.dispatch(CollectionActions.updateCollectionMeta({
      id: this.collectionId,
      name: col.name,
      description: col.description ?? null,
      coverUri: uri,
    }));
    this.closeDetailCoverPicker();
  }
}
