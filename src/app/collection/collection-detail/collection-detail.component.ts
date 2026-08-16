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
import { Observable, Subject, takeUntil, take, map } from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import {
  selectActiveCollection,
  selectCollectionLoading,
  selectCollections,
} from '../../store/collection/collection.selectors';
import {
  CollectionDetailDto,
  CollectionCardDto,
  CollectionDto,
  PrintingDto,
  CardDto,
} from '../../models/game.models';
import { CollectionPickerDialogComponent } from '../../components/collection-picker-dialog/collection-picker-dialog.component';
import { SetIconComponent } from '../../components/set-icon/set-icon.component';
import { CardGridFiltersComponent } from '../../components/card-grid-filters/card-grid-filters.component';
import { CardTileComponent } from '../../components/card-tile/card-tile.component';
import { buildTypeLine } from '../../utils/card.utils';
import { PrintingsService } from '../../services/printings.service';
import {
  CARD_GROUP_OPTIONS,
  CardGridFilterService,
  CardGroupMode,
  CardSection,
} from '../../services/card-grid-filter.service';
import { PreferencesApiService } from '../../services/preferences-api.service';
import { CardFilters } from '../../models/card-filters';
import {
  printingOption,
  printingOptions as buildPrintingOptions,
  setCodeOption,
} from '../../utils/printing-options';
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

/**
 * Rows with a thumbnail, or a grid of card tiles. The deck's third mode (free arrange)
 * carries per-deck saved positions and has no collection equivalent.
 */
export type CollectionLayout = 'list' | 'visual';

/**
 * How much of each card a visual tile shows. Note this is tile *size*, not the deck's
 * overlapping stacks — those exist so a column of cards can be drag-reordered, and the
 * collection grid has no ordering to drag.
 */
export type CollectionDensity = 'full' | 'half' | 'name';

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
    CollectionPickerDialogComponent,
    SetIconComponent,
    CardGridFiltersComponent,
    CardTileComponent,
  ],
  templateUrl: './collection-detail.component.html',
  styleUrls: ['./collection-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  collection$: Observable<CollectionDetailDto | null>;
  loading$: Observable<boolean>;
  /** Every other collection — where a card from this one can be moved. */
  moveTargets$!: Observable<CollectionDto[]>;

  /** The entry being moved, or null when the move dialog is closed. */
  moveCard: CollectionCardDto | null = null;
  moveTargetId: string | null = null;

  /** Multi-select: tiles become checkable and the bulk bar appears. */
  selectMode = false;
  selectedIds = new Set<string>();
  /** True while the bulk dialog is open, so it can share the picker with single moves. */
  bulkMoveOpen = false;

  /** Arena-style swap: search browser fills the grid area, collection becomes a side list. */
  swapMode = false;
  showSearchPanel = false;
  showDetailCoverPicker = false;
  showScanner = false;
  zoomLevel = 1.0;

  // ---- Display: grouping, layout, density --------------------------
  //
  // The same three controls the deck grid carries, over the same CardGridFilterService.
  // The collection rendered one flat unlabelled grid until now; a large collection is the
  // case that most needs sections, so the options are shared rather than deck-only.

  /**
   * Which sections the grid is cut into. Defaults to none: the collection was a flat
   * sorted grid before it had sections, and every other mode re-orders inside its own
   * section, which would silently override the Sort chips.
   */
  groupMode: CardGroupMode = 'none';
  readonly groupModeOptions = CARD_GROUP_OPTIONS;

  /** Rows with a thumbnail, or full tiles. */
  layout: CollectionLayout = 'visual';

  /** Visual layout only: how much of each card the tile shows. */
  density: CollectionDensity = 'half';

  /** Either layout can render as plain text rows instead of art. */
  textStyle = false;

  setGroupMode(mode: CardGroupMode): void {
    this.groupMode = mode;
    this.persistDisplay();
    this.cdr.markForCheck();
  }

  setLayout(mode: CollectionLayout): void {
    this.layout = mode;
    // Text style is a property of the rows, not of the page: carrying it across a layout
    // switch leaves the user on a text list after asking for cards.
    this.textStyle = false;
    this.persistDisplay();
    this.cdr.markForCheck();
  }

  setDensity(value: CollectionDensity): void {
    this.density = value;
    this.textStyle = false;
    this.cdr.markForCheck();
  }

  setTextStyle(on: boolean): void {
    this.textStyle = on;
    this.cdr.markForCheck();
  }

  /** Sections for the grid, memoized by the service on (cards identity, mode). */
  getGroups(collection: CollectionDetailDto): CardSection[] {
    return this.filterRules.sections(this.filteredCards(collection), this.groupMode);
  }

  private persistDisplay(): void {
    this.prefs.save({ collectionLayout: this.layout, collectionGroup: this.groupMode });
  }

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
    const front = card.cardDetails?.imageUriNormal ?? card.cardDetails?.imageUriSmall ?? null;
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
    private filterRules: CardGridFilterService,
    private prefs: PreferencesApiService,
  ) {
    this.collection$ = this.store.select(selectActiveCollection);
    this.loading$ = this.store.select(selectCollectionLoading);
  }

  // ---- Moving a card to another collection ----------------------

  trackByCollectionId = (_: number, col: CollectionDto): string => col.id;
  /** Stable tile identity so a moved card's tile leaves without re-rendering the rest. */
  trackByCardId = (_: number, card: CollectionCardDto): string => card.id;
  /** Sections are re-cut on every filter change; the key keeps a surviving one in place. */
  trackByGroupKey = (_: number, section: CardSection): string => section.key;

  openMove(entry: CollectionCardDto): void {
    this.moveCard = entry;
    this.moveTargetId = null;
    this.cdr.markForCheck();
  }

  closeMove(): void {
    this.moveCard = null;
    this.moveTargetId = null;
    this.cdr.markForCheck();
  }

  /** The dialog's explanatory line, naming the card and how many copies travel. */
  moveLead(entry: CollectionCardDto): string {
    const name = entry.cardDetails?.name ?? 'this card';
    const copies =
      entry.quantity + entry.quantityFoil > 1
        ? ` (${entry.quantity} normal${entry.quantityFoil ? `, ${entry.quantityFoil} foil` : ''})`
        : '';
    return `Move ${name}${copies} to another collection. It keeps when you added it and what it cost then.`;
  }

  /**
   * Moves the whole row. The copies land in a collection that isn't on screen, so the
   * ghost flies to the Collection nav link — the way back to where they went — and the
   * toast names the destination.
   */
  confirmMove(entry: CollectionCardDto, targetId: string): void {
    this.moveTargets$.pipe(take(1)).subscribe((targets) => {
      const target = targets.find((t) => t.id === targetId);
      if (!target) return;

      const from = this.tileArtRect(entry.id);
      this.store.dispatch(
        CollectionActions.moveCard({
          collectionId: this.collectionId,
          cardId: entry.id,
          request: { targetCollectionId: target.id },
          targetName: target.name,
        }),
      );
      this.closeMove();
      this.closeCard();

      const to = this.visibleRect(
        document.querySelector('.nav-link[href="/collection"], .nav-link'),
      );
      if (!from || !to) return;
      void flyCardGhost({
        from,
        to,
        imageUrl:
          entry.cardDetails?.imageUriArtCrop ??
          entry.cardDetails?.imageUriSmall ??
          entry.cardDetails?.imageUriNormal ??
          null,
      });
    });
  }

  // ---- Multi-select ---------------------------------------------

  toggleSelectMode(): void {
    this.selectMode = !this.selectMode;
    if (!this.selectMode) this.selectedIds.clear();
    this.cdr.markForCheck();
  }

  toggleSelected(card: CollectionCardDto, event: Event): void {
    event.stopPropagation();
    if (this.selectedIds.has(card.id)) this.selectedIds.delete(card.id);
    else this.selectedIds.add(card.id);
    // A Set mutates in place, so OnPush needs telling explicitly.
    this.cdr.markForCheck();
  }

  isSelected(card: CollectionCardDto): boolean {
    return this.selectedIds.has(card.id);
  }

  selectAll(col: CollectionDetailDto): void {
    // Only what is on screen — selecting cards hidden by the filter would move things
    // the user cannot see.
    for (const c of this.filteredCards(col)) this.selectedIds.add(c.id);
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.cdr.markForCheck();
  }

  openBulkMove(): void {
    if (this.selectedIds.size === 0) return;
    this.bulkMoveOpen = true;
    this.cdr.markForCheck();
  }

  closeBulkMove(): void {
    this.bulkMoveOpen = false;
    this.cdr.markForCheck();
  }

  get bulkMoveLead(): string {
    const n = this.selectedIds.size;
    return `Move ${n} selected ${n === 1 ? 'card' : 'cards'} to another collection. Each keeps when you added it and what it cost then.`;
  }

  confirmBulkMove(targetId: string): void {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;

    this.moveTargets$.pipe(take(1)).subscribe((targets) => {
      const target = targets.find((t) => t.id === targetId);
      if (!target) return;

      // Capture every rect before the rows leave the DOM.
      const flights = ids
        .map((id) => ({ from: this.tileArtRect(id), img: this.tileImageFor(id) }))
        .filter((f): f is { from: DOMRect; img: string | null } => f.from !== null);

      this.store.dispatch(
        CollectionActions.moveCards({
          collectionId: this.collectionId,
          cardIds: ids,
          targetCollectionId: target.id,
          targetName: target.name,
        }),
      );
      this.closeBulkMove();
      this.selectMode = false;
      this.selectedIds.clear();

      const to = this.visibleRect(
        document.querySelector('.nav-link[href="/collection"], .nav-link'),
      );
      if (!to) return;
      // Stagger so the batch reads as several cards travelling, not one blur.
      flights.slice(0, 12).forEach((f, i) => {
        setTimeout(() => void flyCardGhost({ from: f.from, to, imageUrl: f.img }), i * 70);
      });
    });
  }

  private tileImageFor(cardId: string): string | null {
    const el = this.host.nativeElement.querySelector<HTMLElement>(
      `.card-wrap[data-card-id="${cardId}"] .ct-art`,
    );
    const bg = el?.style.backgroundImage ?? '';
    const match = /url\(["']?(.*?)["']?\)/.exec(bg);
    return match ? match[1] : null;
  }

  /** The art rect of a card's tile in the grid, for the flight's starting point. */
  private tileArtRect(cardId: string): DOMRect | null {
    return this.visibleRect(
      this.host.nativeElement.querySelector(`.card-wrap[data-card-id="${cardId}"] .ct-art`),
    );
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
    // The list is needed for the move dialog's destinations; it also keeps the counts
    // fresh after a move lands.
    this.store.dispatch(CollectionActions.loadCollections());
    this.moveTargets$ = this.store
      .select(selectCollections)
      .pipe(map((cols) => cols.filter((c) => c.id !== this.collectionId)));
    const savedZoom = localStorage.getItem('collection-zoom');
    if (savedZoom) this.zoomLevel = Math.max(0.5, Math.min(2.0, parseFloat(savedZoom) || 1.0));

    // Swap mode keeps the search browser as the grid area; the search panel must be
    // open from the start or the restored layout would show an empty main area.
    this.swapMode = localStorage.getItem('collection-swap-mode') === '1';
    if (this.swapMode) this.showSearchPanel = true;

    // Layout and grouping follow the user across devices, the way the deck's do. The
    // service falls back to localStorage when the request fails, so this still restores
    // offline; take(1) because a preferences change elsewhere must not reset the grid the
    // user is looking at.
    this.prefs
      .load()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((p) => {
        this.layout = p.collectionLayout ?? 'visual';
        if (p.collectionGroup) this.groupMode = p.collectionGroup as CardGroupMode;
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
    // Grouped: picking a set only changes which of your copies the tile shows (the value
    // is a row id, not a printing). Re-pinning the row here would silently rewrite what
    // set you own, which is not what was asked.
    if (this.usesGroupedPicker(card.oracleId)) {
      this.groupChoice.set(card.oracleId, scryfallId);
      this.cdr.markForCheck();
      return;
    }
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
    // Grouped: the choice is which owned printing to show, so only those are offered.
    if (this.usesGroupedPicker(card.oracleId)) return this.groupPrintingOptions(card.oracleId);

    // Ungrouped, a tile *is* one row — one printing you own — so the same rule applies as
    // when grouped: the picker offers what you own, not the whole catalogue. One option
    // means singlePrintingLabel renders it as static text. Listing every printing in
    // existence here made a card you own in one set look like a five-way choice.
    return this.ownedPrintingOption(card);
  }

  private ownedOptionCache = new Map<
    string,
    { row: CollectionCardDto; printings: PrintingDto[] | null; opts: SelectMenuOption[] }
  >();

  private ownedPrintingOption(card: CollectionCardDto): SelectMenuOption[] {
    const cached = this.printings.cached(card.oracleId);
    const hit = this.ownedOptionCache.get(card.id);
    if (hit && hit.row === card && hit.printings === cached) return hit.opts;

    const p = card.scryfallId ? cached?.find((x) => x.scryfallId === card.scryfallId) : undefined;
    const value = card.scryfallId ?? card.id;
    const opts: SelectMenuOption[] = p
      ? [printingOption(p, { value })]
      : card.cardDetails?.setCode
        ? [setCodeOption(value, card.cardDetails.setCode)]
        : [];
    this.ownedOptionCache.set(card.id, { row: card, printings: cached, opts });
    return opts;
  }

  private allPrintingOptions(card: CollectionCardDto): SelectMenuOption[] {
    const printings = this.printings.cached(card.oracleId);
    if (!printings) {
      // Not loaded yet. Return nothing rather than a stand-in for the owned printing:
      // a one-entry menu is indistinguishable from "this card has one printing", so a
      // card with several looked like it had only the one you already own. The empty
      // list makes the menu show its loading label instead, and the button keeps its
      // placeholder (the owned set code).
      return [];
    }
    const hit = this.printingOptionsCache.get(card.oracleId);
    if (hit && hit.src === printings) return hit.opts;
    const opts = buildPrintingOptions(printings);
    this.printingOptionsCache.set(card.oracleId, { src: printings, opts });
    return opts;
  }

  /**
   * The label for a card with exactly one printing, or null when a picker is warranted.
   * Only reports once the printings have actually loaded — the placeholder list built
   * above is a single entry too, and treating that as "only one printing" would freeze
   * the picker away before the real list arrived. Mirrors the search panel's helper.
   */
  /**
   * The label for a card with nothing to choose between, or null when a picker is
   * warranted. One rule for both modes, read off the option list the picker would be
   * given: exactly one option is plain text, anything else is a menu. Deriving it from
   * the options rather than from a second, parallel condition is what stops the two
   * from disagreeing — which is how a grouped card with two printings ended up rendering
   * as static text with no way to reach the other one.
   *
   * Zero options is a menu on purpose: that is the not-yet-loaded state, and freezing it
   * to text would strand the card on whatever printing happened to be showing.
   */
  singlePrintingLabel(card: CollectionCardDto): string | null {
    const opts = this.printingOptions(card);
    return opts.length === 1 ? opts[0].label : null;
  }

  // ---- Filter suggestions --------------------------------------------

  private nameMemo: { cards: CollectionCardDto[]; query: string; value: string[] } | null = null;

  /**
   * Names offered under the filter box. Memoized: the bar binds this, so it runs on every
   * change-detection pass and used to re-map and re-sort the whole collection each time.
   */
  filterSuggestions(collection: CollectionDetailDto): string[] {
    const query = this.filters.query;
    const m = this.nameMemo;
    if (m && m.cards === collection.cards && m.query === query) return m.value;

    const q = query.trim().toLowerCase();
    const pool = this.collectionCardNames(collection);
    const value = (q ? pool.filter((n) => n.toLowerCase().includes(q)) : pool).slice(0, 8);
    this.nameMemo = { cards: collection.cards, query, value };
    return value;
  }

  // ---- Card list helpers -----------------------------------------

  collectionCardNames(collection: CollectionDetailDto): string[] {
    return [
      ...new Set(collection.cards.map((c) => c.cardDetails?.name).filter((n): n is string => !!n)),
    ].sort();
  }

  // One shared vocabulary with the card search panel — see models/card-filters.ts. The
  // *controls* are app-card-grid-filters and the *rules* (what matches, how it sorts, how
  // copies group) are CardGridFilterService; this component owns neither, only the state.
  readonly filters = new CardFilters();

  /** The bar mutated `filters` in place — OnPush needs the explicit mark. */
  onFiltersChanged(): void {
    this.cdr.markForCheck();
  }

  /** Sets represented in this collection — the deck grid asks the same question. */
  setFilterOptions(col: CollectionDetailDto): SelectMenuOption[] {
    return this.filterRules.setOptions(col.cards);
  }

  filteredCards(collection: CollectionDetailDto): CollectionCardDto[] {
    const matching = this.filterRules.apply(collection.cards, this.filters.toState());
    if (!this.groupSameCard) return matching;
    const { rows, members } = this.filterRules.group(matching, this.groupChoice);
    this.groupMembers = members;
    return rows;
  }

  // ---- Grouping the same card across sets --------------------------
  //
  // Off, one entry per printing: two sets of the same card are two tiles. On, they
  // collapse into one tile whose count is every copy you own, and the set picker
  // chooses which of those printings the tile shows. That choice is display-only —
  // it never rewrites which printing a row is pinned to.

  /** Whether copies of one card from different sets share a single tile. */
  groupSameCard = false;

  /** Grouped mode only: the printing the user picked to represent a card. */
  private groupChoice = new Map<string, string>();
  /** Every owned row per card, keyed by oracleId — the rows behind a grouped tile. */
  private groupMembers = new Map<string, CollectionCardDto[]>();

  toggleGroupSameCard(): void {
    this.groupSameCard = !this.groupSameCard;
    // Stale group state would otherwise survive a round-trip through ungrouped mode
    // and resurrect a display choice for a printing that has since been moved away.
    this.groupMembers = new Map();
    this.cdr.markForCheck();
  }

  /** True when this card actually has copies in more than one set. */
  isGrouped(oracleId: string): boolean {
    return this.groupSameCard && (this.groupMembers.get(oracleId)?.length ?? 0) > 1;
  }

  /**
   * Whether the tile's picker is offering owned rows rather than every printing. True
   * for any card the grouping pass has seen, including one owned in a single set — the
   * picker must not silently switch meaning between "your copies" and "all printings"
   * depending on how many you happen to own.
   */
  private usesGroupedPicker(oracleId: string): boolean {
    return this.groupSameCard && this.groupMembers.has(oracleId);
  }

  private groupOptionsCache = new Map<
    string,
    { rows: CollectionCardDto[]; printings: PrintingDto[] | null; opts: SelectMenuOption[] }
  >();

  /**
   * The owned printings of a grouped card. Unlike the ungrouped picker — which lists
   * every printing in existence so you can re-pin a row — this lists only what you own,
   * because the choice here is "which of mine do I want to look at".
   *
   * Keyed by row id, not printing id: a row that pins no printing still represents copies
   * you own, and keying on the printing dropped those rows out of the list entirely.
   */
  private groupPrintingOptions(oracleId: string): SelectMenuOption[] {
    const rows = this.groupMembers.get(oracleId) ?? [];
    const cached = this.printings.cached(oracleId);
    const hit = this.groupOptionsCache.get(oracleId);
    // Keyed on the printings too. Keying on the rows alone meant options built before the
    // printings finished loading were never rebuilt, so they kept the degraded label
    // ("DBL" with no collector number) for the life of the page.
    if (hit && hit.rows === rows && hit.printings === cached) return hit.opts;

    const opts = rows.map((r) => {
      const p = r.scryfallId ? cached?.find((x) => x.scryfallId === r.scryfallId) : undefined;
      // The copy count only earns its place when there is more than one row to compare.
      const suffix = rows.length > 1 ? ` ×${r.quantity + r.quantityFoil}` : '';
      return p
        ? printingOption(p, { value: r.id, suffix })
        : setCodeOption(r.id, r.cardDetails?.setCode, suffix);
    });
    this.groupOptionsCache.set(oracleId, { rows, printings: cached, opts });
    return opts;
  }

  /** What the tile's picker is currently set to — the row when grouped, else the printing. */
  pickerValue(card: CollectionCardDto): string | null {
    return this.groupSameCard ? card.id : card.scryfallId;
  }

  /** Combined copies behind a grouped tile, or null when the card isn't grouped. */
  groupedTotals(oracleId: string): { quantity: number; quantityFoil: number } | null {
    return this.groupSameCard ? this.filterRules.totals(this.groupMembers, oracleId) : null;
  }

  /** Copies to show beside the name in the modal — the group total when grouped. */
  modalCount(col: CollectionDetailDto, card: CollectionCardDto): number | null {
    return (
      this.groupedTotals(card.oracleId)?.quantity ?? this.viewedEntry(col, card)?.quantity ?? null
    );
  }

  modalFoilCount(col: CollectionDetailDto, card: CollectionCardDto): number | null {
    return (
      this.groupedTotals(card.oracleId)?.quantityFoil ??
      this.viewedEntry(col, card)?.quantityFoil ??
      null
    );
  }

  // ---- Card mutations --------------------------------------------

  /**
   * Quantities are read from the store at dispatch time, not the template binding:
   * the reducer applies updates optimistically, so rapid clicks each build on the
   * previous click's value instead of racing on a stale snapshot.
   */
  private withCurrent(card: CollectionCardDto, fn: (cur: CollectionCardDto) => void): void {
    this.collection$.pipe(take(1)).subscribe((col) => {
      // Fall back to the binding when the store doesn't know the card; the store
      // copy wins when both exist.
      fn(col?.cards.find((c) => c.id === card.id) ?? card);
    });
  }

  incrementNormal(card: CollectionCardDto): void {
    this.withCurrent(card, (cur) =>
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: cur.id,
          request: { quantity: cur.quantity + 1, quantityFoil: cur.quantityFoil },
        }),
      ),
    );
  }

  decrementNormal(card: CollectionCardDto): void {
    this.withCurrent(card, (cur) => {
      if (cur.quantity <= 0) return;
      if (cur.quantity === 1 && cur.quantityFoil === 0) {
        this.removeCard(cur);
        return;
      }
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: cur.id,
          request: { quantity: cur.quantity - 1, quantityFoil: cur.quantityFoil },
        }),
      );
    });
  }

  incrementFoil(card: CollectionCardDto): void {
    this.withCurrent(card, (cur) =>
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: cur.id,
          request: { quantity: cur.quantity, quantityFoil: cur.quantityFoil + 1 },
        }),
      ),
    );
  }

  decrementFoil(card: CollectionCardDto): void {
    this.withCurrent(card, (cur) => {
      if (cur.quantityFoil <= 0) return;
      if (cur.quantityFoil === 1 && cur.quantity === 0) {
        this.removeCard(cur);
        return;
      }
      this.store.dispatch(
        CollectionActions.updateCard({
          collectionId: this.collectionId,
          cardId: cur.id,
          request: { quantity: cur.quantity, quantityFoil: cur.quantityFoil - 1 },
        }),
      );
    });
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

  private viewedEntryMemo: {
    cards: CollectionCardDto[];
    oracleId: string;
    scryfallId: string | null;
    value: CollectionCardDto | null;
  } | null = null;

  /**
   * The owned row behind the open modal: the one pinning the printing on screen, else
   * the collection's *unpinned* row for the card.
   *
   * That fallback is the point. An unpinned row means "owned, printing unspecified", but
   * the modal always views a concrete printing — `openCard` substitutes the newest one
   * when a row pins nothing. Matching on printing alone therefore found no row for an
   * unpinned entry, so a card the grid showed as owned opened with no count badge, no
   * ownership box and no −/+ buttons.
   *
   * Memoized per CLAUDE.md: the template reads this ~6 times per change-detection pass
   * and each read scans the collection.
   */
  viewedEntry(col: CollectionDetailDto, card: CollectionCardDto): CollectionCardDto | null {
    const m = this.viewedEntryMemo;
    if (
      m &&
      m.cards === col.cards &&
      m.oracleId === card.oracleId &&
      m.scryfallId === this.modalViewScryfallId
    ) {
      return m.value;
    }

    const sameCard = (c: CollectionCardDto): boolean => c.oracleId === card.oracleId;
    const rows = col.cards.filter(sameCard);
    const pinned = this.modalViewScryfallId
      ? rows.find((c) => c.scryfallId === this.modalViewScryfallId)
      : undefined;

    // The unpinned row stands in only when *nothing* is pinned. Falling back to it
    // whenever the viewed printing wasn't owned meant switching printings in the modal
    // and pressing + incremented the row you already had instead of adding the printing
    // you were looking at.
    const value = pinned ?? (rows.some((c) => c.scryfallId) ? null : (rows[0] ?? null));

    this.viewedEntryMemo = {
      cards: col.cards,
      oracleId: card.oracleId,
      scryfallId: this.modalViewScryfallId,
      value,
    };
    return value;
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
