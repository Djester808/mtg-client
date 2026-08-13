import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, takeUntil, take } from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import {
  selectActiveCollection,
  selectCollectionLoading,
} from '../../store/collection/collection.selectors';
import {
  CollectionDetailDto,
  CollectionCardDto,
  PrintingDto,
  CardDto,
} from '../../models/game.models';
import { buildTypeLine } from '../../utils/card.utils';
import { PrintingsService } from '../../services/printings.service';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CardSearchPanelComponent } from '../../components/card-search-panel/card-search-panel.component';
import { CardSideListComponent } from '../../components/card-side-list/card-side-list.component';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';
import { flyCardGhost, FlightSource } from '../../shared/fly-card';
import { CardScannerComponent } from '../../components/card-scanner/card-scanner.component';
import {
  SelectMenuComponent,
  SelectMenuOption,
} from '../../components/select-menu/select-menu.component';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ManaCostComponent,
    OracleSymbolsPipe,
    CardModalComponent,
    CardSearchPanelComponent,
    CardSideListComponent,
    CoverPickerModalComponent,
    CardScannerComponent,
    SelectMenuComponent,
  ],
  templateUrl: './collection-detail.component.html',
  styleUrls: ['./collection-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  collection$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;

  filterQuery = '';
  /** Arena-style swap: search browser fills the grid area, collection becomes a side list. */
  swapMode = false;
  showSearchPanel = false;
  showDetailCoverPicker = false;
  showScanner = false;
  zoomLevel = 1.0;

  zoomIn(): void {
    this.zoomLevel = Math.min(2.0, +(this.zoomLevel + 0.25).toFixed(2));
    localStorage.setItem('collection-zoom', String(this.zoomLevel));
  }
  zoomOut(): void {
    this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2));
    localStorage.setItem('collection-zoom', String(this.zoomLevel));
  }
  get zoomLabel(): string {
    return Math.round(this.zoomLevel * 100) + '%';
  }

  hoveredCard: CollectionCardDto | null = null;
  printingsLoading = false;

  // ---- Card detail modal ----------------------------------------
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  flippedCardIds = new Set<string>();
  private noteDraft = new Map<string, string>();

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printings.cached(this.selectedCard.oracleId) ?? []) : [];
  }

  tileImage(card: CollectionCardDto): string | null {
    const front = card.cardDetails?.imageUriNormal ?? null;
    const back = card.cardDetails?.imageUriNormalBack ?? null;
    return this.flippedCardIds.has(card.id) && back ? back : front;
  }

  tileHasBack(card: CollectionCardDto): boolean {
    return !!card.cardDetails?.imageUriNormalBack;
  }

  private collectionId = '';
  private destroy$ = new Subject<void>();

  @ViewChild(CardSideListComponent) sideList?: CardSideListComponent;

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private printings: PrintingsService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {
    this.collection$ = this.store.select(selectActiveCollection);
    this.loading$ = this.store.select(selectCollectionLoading);
  }

  /**
   * Loads printings through the shared cache, driving the hover spinner and the
   * modal's default-printing selection when the load lands on the relevant card.
   */
  private loadPrintings(oracleId: string): void {
    this.printings
      .get(oracleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((printings) => {
        if (this.hoveredCard?.oracleId === oracleId) this.printingsLoading = false;
        if (
          this.selectedCard?.oracleId === oracleId &&
          !this.modalViewScryfallId &&
          printings.length
        )
          this.modalViewScryfallId = printings[0].scryfallId;
        this.cdr.markForCheck();
      });
  }

  ngOnInit(): void {
    this.collectionId = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(CollectionActions.loadCollection({ id: this.collectionId }));
    const savedZoom = localStorage.getItem('collection-zoom');
    if (savedZoom) this.zoomLevel = Math.max(0.5, Math.min(2.0, parseFloat(savedZoom) || 1.0));

    // Swap mode keeps the search browser as the grid area; the search panel must be
    // open from the start or the restored layout would show an empty main area.
    this.swapMode = localStorage.getItem('collection-swap-mode') === '1';
    if (this.swapMode) this.showSearchPanel = true;
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

  // ---- Swap mode (Arena-style) ----------------------------------
  //
  // Swaps the two surfaces: the search browser takes over the grid area and the
  // collection collapses into a compact side list. The search panel stays open for the
  // whole time — its close button exits swap mode instead of leaving an empty main area.

  toggleSwapMode(): void {
    this.swapMode = !this.swapMode;
    this.showSearchPanel = this.swapMode;
    localStorage.setItem('collection-swap-mode', this.swapMode ? '1' : '0');
    this.cdr.markForCheck();
  }

  onSearchPanelClose(): void {
    if (this.swapMode) this.toggleSwapMode();
    else this.toggleSearchPanel();
  }

  /**
   * A landing target must actually be laid out on screen — elements hidden by a
   * collapsed panel keep a degenerate rect that would strand the ghost mid-screen.
   */
  private visibleRect(el: Element | null): DOMRect | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? r : null;
  }

  /**
   * Swap-mode add acknowledgment: the card's ghost flies onto its own side-list row
   * (pulsing it as it lands), or onto the list header while the row does not exist yet.
   */
  private flyIntoSideList(flight: FlightSource | undefined, oracleId: string): void {
    if (!this.swapMode) return;
    const row = this.visibleRect(
      this.host.nativeElement.querySelector(`.side-list-row[data-oracle-id="${oracleId}"]`),
    );
    const to = row ?? this.visibleRect(this.host.nativeElement.querySelector('.side-list-header'));
    if (!to) return;
    const land = () => {
      if (row) this.sideList?.pulse(oracleId);
    };
    if (!flight) {
      land();
      return;
    }
    flyCardGhost({ from: flight.from, to, imageUrl: flight.imageUrl }).then(land);
  }

  // ---- Search panel event handler -----------------------------------

  onPanelCardRemove(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe((col) => {
      if (!col) return;
      const card = col.cards.find((c) => c.oracleId === oracleId);
      if (!card) return;
      this.store.dispatch(
        CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }),
      );
    });
  }

  onPanelDecrementNormal(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe((col) => {
      if (!col) return;
      const card = col.cards.find((c) => c.oracleId === oracleId);
      if (!card || card.quantity <= 0) return;
      if (card.quantity === 1 && card.quantityFoil === 0) {
        this.store.dispatch(
          CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }),
        );
      } else {
        this.store.dispatch(
          CollectionActions.updateCard({
            collectionId: this.collectionId,
            cardId: card.id,
            request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
          }),
        );
      }
    });
  }

  onPanelDecrementFoil(oracleId: string): void {
    this.collection$.pipe(take(1)).subscribe((col) => {
      if (!col) return;
      const card = col.cards.find((c) => c.oracleId === oracleId);
      if (!card || card.quantityFoil <= 0) return;
      if (card.quantityFoil === 1 && card.quantity === 0) {
        this.store.dispatch(
          CollectionActions.removeCard({ collectionId: this.collectionId, cardId: card.id }),
        );
      } else {
        this.store.dispatch(
          CollectionActions.updateCard({
            collectionId: this.collectionId,
            cardId: card.id,
            request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
          }),
        );
      }
    });
  }

  onPanelCardAdd(event: {
    oracleId: string;
    scryfallId: string;
    foil?: boolean;
    flight?: FlightSource;
  }): void {
    this.flyIntoSideList(event.flight, event.oracleId);
    this.store.dispatch(
      CollectionActions.addCard({
        collectionId: this.collectionId,
        request: {
          oracleId: event.oracleId,
          scryfallId: event.scryfallId,
          quantity: event.foil ? 0 : 1,
          quantityFoil: event.foil ? 1 : 0,
        },
      }),
    );
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
    } catch {
      /* ignore */
    }
  }

  // ---- Card-grid hover -------------------------------------------
  //
  // Hover still prefetches printings (for the set picker and modal), but the info
  // overlay is click-toggled to match the deck grid: single click shows the card's
  // description, a second quick click opens the modal.

  onCardHover(card: CollectionCardDto): void {
    this.hoveredCard = card;
    this.printingsLoading = !this.printings.has(card.oracleId);
    this.cdr.markForCheck();
    this.loadPrintings(card.oracleId);
  }

  onCardLeave(): void {
    this.hoveredCard = null;
    this.printingsLoading = false;
    this.cdr.markForCheck();
  }

  tileInfoId: string | null = null;
  private lastTileClick: { id: string; time: number } | null = null;

  onTileClick(card: CollectionCardDto, e: MouseEvent): void {
    e.stopPropagation();
    const now = performance.now();
    if (this.lastTileClick?.id === card.id && now - this.lastTileClick.time < 350) {
      this.lastTileClick = null;
      this.tileInfoId = null;
      this.openCard(card);
      return;
    }
    this.lastTileClick = { id: card.id, time: now };
    this.tileInfoId = this.tileInfoId === card.id ? null : card.id;
    this.cdr.markForCheck();
  }

  // ---- Card-grid set dropdown ------------------------------------

  onSelectFocus(card: CollectionCardDto): void {
    if (!this.printings.has(card.oracleId)) this.loadPrintings(card.oracleId);
  }

  onSetChange(card: CollectionCardDto, scryfallId: string): void {
    const printing = this.printings.cached(card.oracleId)?.find((p) => p.scryfallId === scryfallId);
    if (printing) this.selectPrinting(card, printing);
  }

  selectPrinting(card: CollectionCardDto, printing: PrintingDto): void {
    if (card.scryfallId === printing.scryfallId) return;
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: card.id,
        request: {
          quantity: card.quantity,
          quantityFoil: card.quantityFoil,
          scryfallId: printing.scryfallId,
        },
      }),
    );
  }

  /** Printings as select-menu options, memoized per cached printings array. */
  private printingOptionsCache = new Map<
    string,
    { src: PrintingDto[]; opts: SelectMenuOption[] }
  >();

  printingOptions(card: CollectionCardDto): SelectMenuOption[] {
    const printings = this.printings.cached(card.oracleId);
    if (!printings) {
      // Not loaded yet — show the owned printing so the button has a label.
      return [
        {
          value: card.scryfallId ?? '',
          label: card.cardDetails?.setCode?.toUpperCase() ?? '···',
        },
      ];
    }
    const hit = this.printingOptionsCache.get(card.oracleId);
    if (hit && hit.src === printings) return hit.opts;
    const opts = printings.map((p) => ({
      value: p.scryfallId,
      label: `${p.setCode.toUpperCase()} #${p.collectorNumber}`,
      title: p.setName,
    }));
    this.printingOptionsCache.set(card.oracleId, { src: printings, opts });
    return opts;
  }

  // ---- Filter suggestions --------------------------------------------

  filterSuggOpen = false;

  filterSuggestions(collection: CollectionDetailDto): string[] {
    const q = this.filterQuery.trim().toLowerCase();
    const pool = this.collectionCardNames(collection);
    return (q ? pool.filter((n) => n.toLowerCase().includes(q)) : pool).slice(0, 8);
  }

  selectFilterSuggestion(name: string): void {
    this.filterQuery = name;
    this.filterSuggOpen = false;
    this.cdr.markForCheck();
  }

  /** Delayed so a mousedown on a suggestion wins the race against the input's blur. */
  closeFilterSuggSoon(): void {
    setTimeout(() => {
      this.filterSuggOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  // ---- Card list helpers -----------------------------------------

  collectionCardNames(collection: CollectionDetailDto): string[] {
    return [
      ...new Set(collection.cards.map((c) => c.cardDetails?.name).filter((n): n is string => !!n)),
    ].sort();
  }

  filteredCards(collection: CollectionDetailDto): CollectionCardDto[] {
    if (!this.filterQuery.trim()) return collection.cards;
    const q = this.filterQuery.toLowerCase();
    return collection.cards.filter(
      (c) => c.cardDetails?.name.toLowerCase().includes(q) || c.oracleId.toLowerCase().includes(q),
    );
  }

  ownedEntry(collection: CollectionDetailDto, oracleId: string): CollectionCardDto | undefined {
    return collection.cards.find((c) => c.oracleId === oracleId);
  }

  // ---- Card mutations --------------------------------------------

  incrementNormal(card: CollectionCardDto): void {
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: card.id,
        request: { quantity: card.quantity + 1, quantityFoil: card.quantityFoil },
      }),
    );
  }

  decrementNormal(card: CollectionCardDto): void {
    if (card.quantity <= 0) return;
    if (card.quantity === 1 && card.quantityFoil === 0) {
      this.removeCard(card);
      return;
    }
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: card.id,
        request: { quantity: card.quantity - 1, quantityFoil: card.quantityFoil },
      }),
    );
  }

  incrementFoil(card: CollectionCardDto): void {
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: card.id,
        request: { quantity: card.quantity, quantityFoil: card.quantityFoil + 1 },
      }),
    );
  }

  decrementFoil(card: CollectionCardDto): void {
    if (card.quantityFoil <= 0) return;
    if (card.quantityFoil === 1 && card.quantity === 0) {
      this.removeCard(card);
      return;
    }
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: card.id,
        request: { quantity: card.quantity, quantityFoil: card.quantityFoil - 1 },
      }),
    );
  }

  removeCard(card: CollectionCardDto): void {
    this.store.dispatch(
      CollectionActions.removeCard({
        collectionId: this.collectionId,
        cardId: card.id,
      }),
    );
  }

  // ---- Display helpers ------------------------------------------

  typeLine(card: CollectionCardDto): string {
    return card.cardDetails ? buildTypeLine(card.cardDetails) : '';
  }

  // ---- Card detail modal ----------------------------------------

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printings.cached(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.loadPrintings(card.oracleId);
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
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: entry.id,
          request: { quantity: entry.quantity + 1, quantityFoil: entry.quantityFoil },
        }),
      );
    } else if (this.modalViewScryfallId) {
      this.store.dispatch(
        CollectionActions.addCard({
          collectionId: this.collectionId,
          request: { oracleId: card.oracleId, scryfallId: this.modalViewScryfallId, quantity: 1 },
        }),
      );
    }
  }

  modalDecrementNormal(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id || entry.quantity <= 0) return;
    if (entry.quantity === 1 && entry.quantityFoil === 0) {
      this.store.dispatch(
        CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }),
      );
    } else {
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: entry.id,
          request: { quantity: entry.quantity - 1, quantityFoil: entry.quantityFoil },
        }),
      );
    }
  }

  modalIncrementFoil(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (entry?.id) {
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: entry.id,
          request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil + 1 },
        }),
      );
    } else if (this.modalViewScryfallId) {
      this.store.dispatch(
        CollectionActions.addCard({
          collectionId: this.collectionId,
          request: {
            oracleId: card.oracleId,
            scryfallId: this.modalViewScryfallId,
            quantity: 0,
            quantityFoil: 1,
          },
        }),
      );
    }
  }

  modalDecrementFoil(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id || entry.quantityFoil <= 0) return;
    if (entry.quantityFoil === 1 && entry.quantity === 0) {
      this.store.dispatch(
        CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }),
      );
    } else {
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: entry.id,
          request: { quantity: entry.quantity, quantityFoil: entry.quantityFoil - 1 },
        }),
      );
    }
  }

  modalRemoveCard(col: CollectionDetailDto, card: CollectionCardDto): void {
    const entry = this.viewedEntry(col, card);
    if (!entry?.id) return;
    this.store.dispatch(
      CollectionActions.removeCard({ collectionId: this.collectionId, cardId: entry.id }),
    );
    this.closeCard();
  }

  getAlsoOwnedIds(col: CollectionDetailDto): string[] {
    if (!this.selectedCard) return [];
    return col.cards
      .filter(
        (c) =>
          c.oracleId === this.selectedCard!.oracleId &&
          c.scryfallId &&
          c.scryfallId !== this.selectedCard!.scryfallId,
      )
      .map((c) => c.scryfallId!);
  }

  viewedEntry(col: CollectionDetailDto, card: CollectionCardDto): CollectionCardDto | null {
    if (!this.modalViewScryfallId) return null;
    return (
      col.cards.find(
        (c) => c.oracleId === card.oracleId && c.scryfallId === this.modalViewScryfallId,
      ) ?? null
    );
  }

  // ---- Modal notes -----------------------------------------------

  noteDraftValue(entry: CollectionCardDto): string {
    const stored = entry.notes ?? '';
    if (!this.noteDraft.has(entry.id)) return stored;
    const draft = this.noteDraft.get(entry.id)!;
    if (draft === stored) {
      this.noteDraft.delete(entry.id);
      return stored;
    }
    return draft;
  }

  setNoteDraft(entryId: string, value: string): void {
    this.noteDraft.set(entryId, value);
  }

  saveNotes(entry: CollectionCardDto): void {
    const draft = this.noteDraft.has(entry.id)
      ? this.noteDraft.get(entry.id)!
      : (entry.notes ?? '');
    const stored = entry.notes ?? '';
    if (draft === stored) {
      this.noteDraft.delete(entry.id);
      return;
    }
    this.store.dispatch(
      CollectionActions.updateCard({
        collectionId: this.collectionId,
        cardId: entry.id,
        request: {
          quantity: entry.quantity,
          quantityFoil: entry.quantityFoil,
          notes: draft || null,
        },
      }),
    );
  }

  // ---- Card scanner ----------------------------------------

  onCardScanned(card: CardDto): void {
    this.showScanner = false;
    this.store.dispatch(
      CollectionActions.addCard({
        collectionId: this.collectionId,
        request: { oracleId: card.oracleId, quantity: 1, quantityFoil: 0 },
      }),
    );
    this.cdr.markForCheck();
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
    this.store.dispatch(
      CollectionActions.updateCollectionMeta({
        id: this.collectionId,
        name: col.name,
        description: col.description ?? null,
        coverUri: uri,
      }),
    );
    this.closeDetailCoverPicker();
  }
}
