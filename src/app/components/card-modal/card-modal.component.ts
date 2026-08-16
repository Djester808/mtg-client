import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardDto,
  CardPricesDto,
  CardType,
  CollectionCardDto,
  PrintingDto,
  RulingDto,
} from '../../models/game.models';
import { CardHistoryPanelComponent } from '../card-history-panel/card-history-panel.component';
import { CardPricesPanelComponent } from '../card-prices-panel/card-prices-panel.component';
import { SetIconComponent } from '../set-icon/set-icon.component';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { GameApiService } from '../../services/game-api.service';
import { ToBodyDirective } from '../../shared/to-body.directive';
import { cardArtWindow } from '../../shared/fly-card';

/** Today's price measured against what a copy cost when it was added. */
export interface PriceDelta {
  then: number;
  now: number;
  diff: number;
  /** Null when the add-time price was zero — a percentage change would be meaningless. */
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
}

@Component({
  selector: 'app-card-modal',
  standalone: true,
  imports: [
    CommonModule,
    ManaCostComponent,
    OracleSymbolsPipe,
    CardHistoryPanelComponent,
    CardPricesPanelComponent,
    SetIconComponent,
  ],
  templateUrl: './card-modal.component.html',
  styleUrls: ['./card-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Re-parent to <body> so the fixed overlay escapes .detail-body's stacking context and
  // paints above the app header instead of behind it.
  hostDirectives: [ToBodyDirective],
})
export class CardModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() card: CardDto | null = null;
  @Input() printings: PrintingDto[] = [];

  /** Two-way: which printing is being viewed. */
  @Input() viewedScryfallId: string | null = null;
  @Output() viewedScryfallIdChange = new EventEmitter<string | null>();

  /** Two-way: whether the back face is showing. */
  @Input() flipped = false;
  @Output() flippedChange = new EventEmitter<boolean>();

  @Output() closed = new EventEmitter<void>();

  /** Optional: scryfallId of the card entry the user owns (shows gold "Owned" banner). */
  @Input() primaryScryfallId: string | null = null;
  /** Optional: scryfallIds of other printings the user also owns (shows blue "Owned" banner). */
  @Input() alsoOwnedIds: string[] = [];

  /** Optional: copies of this card the viewer owns (deck or collection) — shown beside the name. */
  @Input() countBadge: number | null = null;

  /**
   * Optional: the collection/deck entry this card was opened from. Supplies when it was
   * added and what it cost then, which the Details tab compares against today's price.
   */
  @Input() ownedEntry: CollectionCardDto | null = null;

  /** Optional: foil copies owned — a gold companion badge to countBadge (collections). */
  @Input() foilCountBadge: number | null = null;

  /**
   * Optional: label for a host-provided extra info tab (projected via [info-tab]),
   * e.g. a collection's Notes. Details and Rulings tabs are always present.
   */
  @Input() infoTabLabel: string | null = null;

  /** Which info tab is showing; snaps back to details when the card changes. */
  infoTab: 'details' | 'rulings' | 'prices' | 'history' | 'extra' = 'details';

  @Input() isGameChanger = false;
  /** Set to false to suppress the full-screen backdrop overlay (e.g. when the modal is embedded
   *  in a panel and click-outside is handled by the parent). */
  @Input() showOverlay = true;
  @Input() isBanned = false;

  // Position / size — managed internally, centred on first render
  modalX = 0;
  modalY = 0;
  modalWidth = 860;
  modalHeight = 600;
  isDragging = false;
  isResizing = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartW = 0;
  private resizeStartH = 0;

  rulings: RulingDto[] = [];
  rulingsLoading = false;
  private rulingsCache = new Map<string, RulingDto[]>();

  // Magnifier lens
  lensVisible = false;
  lensX = 0;
  lensY = 0;
  lensBgX = 0;
  lensBgY = 0;
  lensBgW = 0;
  lensBgH = 0;
  private readonly LENS_SIZE = 220;
  private readonly ZOOM = 3;

  readonly CAROUSEL_PAGE = 5;
  carouselStart = 0;

  /**
   * True once a close has been requested: the template adds `.is-closing`, which plays the
   * exit animation, and only after it finishes do we emit `closed` so the parent unmounts us.
   * Driving it here (rather than Angular's :leave) keeps the exit reliable despite the host
   * being re-parented to <body> by ToBodyDirective, which was cancelling the :leave.
   */
  closing = false;
  /** Must match the .card-modal.is-closing animation duration in the SCSS. */
  private static readonly CLOSE_MS = 240;

  constructor(
    private gameApi: GameApiService,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
  ) {}

  /**
   * Screen rect of the card's art window (not the whole frame), for callers that fly a
   * ghost of the artwork (e.g. add-to-deck).
   */
  artRect(): DOMRect | null {
    const img = this.host.nativeElement.querySelector('.modal-card-img');
    return img ? cardArtWindow(img.getBoundingClientRect()) : null;
  }

  /** The artwork image for that ghost; falls back to the full card when no crop exists. */
  get artImageUrl(): string | null {
    return this.card?.imageUriArtCrop ?? this.modalImage;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['card']) {
      this.infoTab = 'details';
      const oracleId = this.card?.oracleId;
      if (!oracleId) {
        this.rulings = [];
        return;
      }
      if (this.rulingsCache.has(oracleId)) {
        this.rulings = this.rulingsCache.get(oracleId)!;
        return;
      }
      this.rulingsLoading = true;
      this.rulings = [];
      this.gameApi.getCardRulings(oracleId).subscribe({
        next: (r) => {
          this.rulingsCache.set(oracleId, r);
          this.rulings = r;
          this.rulingsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.rulingsLoading = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  ngOnInit(): void {
    this.modalWidth = Math.min(900, Math.floor(window.innerWidth * 0.92));
    this.modalHeight = Math.max(560, Math.min(680, Math.floor(window.innerHeight * 0.85)));
    this.modalX = Math.max(0, (window.innerWidth - this.modalWidth) / 2);
    this.modalY = Math.max(0, (window.innerHeight - this.modalHeight) / 2);
  }

  // ---- Carousel -------------------------------------------------------

  private carouselMemo: { printings: PrintingDto[]; start: number; value: PrintingDto[] } | null =
    null;

  get carouselSlice(): PrintingDto[] {
    const m = this.carouselMemo;
    if (m && m.printings === this.printings && m.start === this.carouselStart) return m.value;
    const value = this.printings.slice(this.carouselStart, this.carouselStart + this.CAROUSEL_PAGE);
    this.carouselMemo = { printings: this.printings, start: this.carouselStart, value };
    return value;
  }
  get carouselCanPrev(): boolean {
    return this.carouselStart > 0;
  }
  get carouselCanNext(): boolean {
    return this.carouselStart + this.CAROUSEL_PAGE < this.printings.length;
  }
  carouselPrev(): void {
    this.carouselStart = Math.max(0, this.carouselStart - this.CAROUSEL_PAGE);
  }
  carouselNext(): void {
    this.carouselStart = Math.min(
      Math.max(0, this.printings.length - this.CAROUSEL_PAGE),
      this.carouselStart + this.CAROUSEL_PAGE,
    );
  }

  // ---- Derived card data ----------------------------------------------

  // The template reads currentPrinting/effectiveCard 20+ times per change-detection
  // pass; without memoization each read was a linear scan plus (for effectiveCard) a
  // fresh object whose new identity forced child bindings to re-render every pass.
  private printingMemo: {
    printings: PrintingDto[];
    id: string | null;
    value: PrintingDto | undefined;
  } | null = null;

  get currentPrinting(): PrintingDto | undefined {
    const m = this.printingMemo;
    if (m && m.printings === this.printings && m.id === this.viewedScryfallId) return m.value;
    const value = this.printings.find((p) => p.scryfallId === this.viewedScryfallId);
    this.printingMemo = { printings: this.printings, id: this.viewedScryfallId, value };
    return value;
  }

  private effectiveMemo: {
    card: CardDto | null;
    printing: PrintingDto | undefined;
    value: CardDto | null;
  } | null = null;

  /** Base card merged with printing-specific overrides. */
  get effectiveCard(): CardDto | null {
    const p = this.currentPrinting;
    const m = this.effectiveMemo;
    if (m && m.card === this.card && m.printing === p) return m.value;
    let value: CardDto | null;
    if (!this.card) value = null;
    else if (!p) value = this.card;
    else
      value = {
        ...this.card,
        oracleText: p.oracleText ?? this.card.oracleText,
        flavorText: p.flavorText ?? null,
        artist: p.artist ?? this.card.artist,
        manaCost: p.manaCost ?? this.card.manaCost,
        setCode: p.setCode ?? this.card.setCode,
      };
    this.effectiveMemo = { card: this.card, printing: p, value };
    return value;
  }

  /** Prices for the printing being viewed; falls back to the base card's printing. */
  get currentPrices(): CardPricesDto | null {
    return this.currentPrinting?.prices ?? this.card?.prices ?? null;
  }

  // ---- Price movement since the card was added -------------------------

  private deltaMemo: {
    entry: CollectionCardDto | null;
    prices: CardPricesDto | null;
    value: PriceDelta | null;
  } | null = null;

  /**
   * Today's price against the price when this copy was added. Null when the card was
   * not opened from a collection, the entry predates price tracking, or the printing
   * has no current price — all cases where a comparison would be invented.
   */
  get priceDelta(): PriceDelta | null {
    const entry = this.ownedEntry;
    const prices = this.currentPrices;
    const m = this.deltaMemo;
    if (m && m.entry === entry && m.prices === prices) return m.value;

    let value: PriceDelta | null = null;
    const then = entry?.priceUsdAtAdd ?? null;
    const now = prices?.usd ?? null;
    if (then != null && now != null) {
      const diff = now - then;
      value = {
        then,
        now,
        diff,
        // A card added at zero (unpriced then, priced now) has no meaningful percentage.
        percent: then > 0 ? (diff / then) * 100 : null,
        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
      };
    }
    this.deltaMemo = { entry, prices, value };
    return value;
  }

  /**
   * Changes whenever this card's stored copies or pinned printing do, so the History tab
   * refetches after a change made from inside the modal. A plain string, not an object:
   * Angular propagates it to the child only when the value actually differs, so a card
   * sitting still costs nothing.
   *
   * The host store updates optimistically and then again when the server value
   * reconciles, so this fires twice on a change — the second is what guarantees the tab
   * ends up showing the event even if the write was slow.
   */
  get historyReloadKey(): string {
    return `${this.countBadge ?? 0}:${this.foilCountBadge ?? 0}:${this.ownedEntry?.scryfallId ?? ''}`;
  }

  get hasBack(): boolean {
    const p = this.currentPrinting;
    return !!(p?.imageUriNormalBack ?? this.card?.imageUriNormalBack);
  }

  get modalImage(): string | null {
    const p = this.currentPrinting;
    const front =
      p?.imageUriLarge ??
      p?.imageUriNormal ??
      this.card?.imageUriLarge ??
      this.card?.imageUriNormal ??
      null;
    const back = p?.imageUriNormalBack ?? this.card?.imageUriNormalBack ?? null;
    return this.flipped && back ? back : front;
  }

  /** Active face name — handles DFC "Front // Back" format. */
  get displayName(): string {
    const name = this.card?.name ?? '';
    if (!this.hasBack) return name;
    const parts = name.split(' // ');
    return this.flipped && parts.length > 1 ? parts[1] : parts[0];
  }

  /** Active face oracle text — handles DFC split. */
  get displayOracleText(): string | null {
    const text = this.effectiveCard?.oracleText ?? null;
    if (!text || !this.hasBack) return text;
    const parts = text.split('\n//\n');
    return this.flipped && parts.length > 1 ? parts[1] : parts[0];
  }

  get typeLine(): string {
    const c = this.effectiveCard;
    return c ? buildTypeLine(c) : '';
  }

  get isLand(): boolean {
    return this.effectiveCard?.cardTypes.includes(CardType.Land) ?? false;
  }

  readonly FORMAT_ORDER = [
    { key: 'standard', label: 'Standard' },
    { key: 'pioneer', label: 'Pioneer' },
    { key: 'modern', label: 'Modern' },
    { key: 'legacy', label: 'Legacy' },
    { key: 'vintage', label: 'Vintage' },
    { key: 'commander', label: 'Commander' },
    { key: 'oathbreaker', label: 'Oathbreaker' },
    { key: 'pauper', label: 'Pauper' },
    { key: 'explorer', label: 'Explorer' },
    { key: 'historic', label: 'Historic' },
    { key: 'alchemy', label: 'Alchemy' },
    { key: 'brawl', label: 'Brawl' },
  ];

  get hasLegalities(): boolean {
    const leg = this.card?.legalities;
    return !!leg && Object.keys(leg).length > 0;
  }

  private formatsMemo: {
    card: CardDto | null;
    legal: { label: string; status: string }[];
    illegal: { label: string; status: string }[];
  } | null = null;

  private formats(): NonNullable<typeof this.formatsMemo> {
    if (this.formatsMemo?.card === this.card) return this.formatsMemo;
    const leg = this.card?.legalities ?? {};
    const all = this.FORMAT_ORDER.map((f) => ({
      label: f.label,
      status: leg[f.key] ?? 'not_legal',
    }));
    this.formatsMemo = {
      card: this.card,
      legal: all.filter((f) => f.status !== 'not_legal'),
      illegal: all.filter((f) => f.status === 'not_legal'),
    };
    return this.formatsMemo;
  }

  get legalFormats(): { label: string; status: string }[] {
    return this.formats().legal;
  }

  get illegalFormats(): { label: string; status: string }[] {
    return this.formats().illegal;
  }

  // ---- User actions ---------------------------------------------------

  close(): void {
    // Play the exit animation first, then tell the parent to unmount. Guard re-entry so a
    // second click (or Escape during the fade) doesn't stack timers.
    if (this.closing) return;
    this.closing = true;
    setTimeout(() => this.closed.emit(), CardModalComponent.CLOSE_MS);
  }

  selectPrinting(p: PrintingDto): void {
    this.viewedScryfallId = p.scryfallId;
    this.viewedScryfallIdChange.emit(p.scryfallId);
    this.flipped = false;
    this.flippedChange.emit(false);
  }

  flipToPrintingBack(p: PrintingDto, e: MouseEvent): void {
    e.stopPropagation();
    if (this.viewedScryfallId === p.scryfallId) {
      this.flipped = !this.flipped;
      this.flippedChange.emit(this.flipped);
    } else {
      this.viewedScryfallId = p.scryfallId;
      this.viewedScryfallIdChange.emit(p.scryfallId);
      this.flipped = true;
      this.flippedChange.emit(true);
    }
  }

  toggleFlip(): void {
    this.flipped = !this.flipped;
    this.flippedChange.emit(this.flipped);
  }

  onImageMouseEnter(): void {
    this.lensVisible = true;
  }
  onImageMouseLeave(): void {
    this.lensVisible = false;
  }

  onImageMouseMove(e: MouseEvent): void {
    const img = e.target as HTMLImageElement;
    const imgRect = img.getBoundingClientRect();
    const artRect = img.parentElement!.getBoundingClientRect();
    const half = this.LENS_SIZE / 2;
    const x = e.clientX - imgRect.left;
    const y = e.clientY - imgRect.top;
    this.lensX = e.clientX - artRect.left - half;
    this.lensY = e.clientY - artRect.top - half;
    this.lensBgW = imgRect.width * this.ZOOM;
    this.lensBgH = imgRect.height * this.ZOOM;
    this.lensBgX = -(x * this.ZOOM - half);
    this.lensBgY = -(y * this.ZOOM - half);
  }

  // ---- Drag / resize --------------------------------------------------

  onDragStart(e: MouseEvent): void {
    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.modalX;
    this.dragOffsetY = e.clientY - this.modalY;
    this.attachMoveListener();
    e.preventDefault();
  }

  onResizeStart(e: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartW = this.modalWidth;
    this.resizeStartH = this.modalHeight;
    this.attachMoveListener();
    e.preventDefault();
    e.stopPropagation();
  }

  // The move listener exists only between mousedown and mouseup. A permanent
  // document:mousemove host listener ran change detection for the whole app on
  // every pointer movement while the modal was open.
  private readonly onDocMouseMove = (e: MouseEvent): void => {
    if (this.isDragging) {
      this.modalX = Math.max(0, e.clientX - this.dragOffsetX);
      this.modalY = Math.max(0, e.clientY - this.dragOffsetY);
    }
    if (this.isResizing) {
      const d = (e.clientX - this.resizeStartX + (e.clientY - this.resizeStartY)) / 2;
      this.modalWidth = Math.max(
        680,
        Math.min(Math.floor(window.innerWidth * 0.96), this.resizeStartW + d),
      );
      this.modalHeight = Math.max(
        520,
        Math.min(Math.floor(window.innerHeight * 0.94), this.resizeStartH + d),
      );
    }
    this.cdr.markForCheck();
  };

  private attachMoveListener(): void {
    document.addEventListener('mousemove', this.onDocMouseMove);
  }

  private detachMoveListener(): void {
    document.removeEventListener('mousemove', this.onDocMouseMove);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isDragging || this.isResizing) this.detachMoveListener();
    this.isDragging = false;
    this.isResizing = false;
  }

  ngOnDestroy(): void {
    this.detachMoveListener();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
