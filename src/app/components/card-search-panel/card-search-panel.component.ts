import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  startWith,
  map,
  takeUntil,
  of,
  concatMap,
} from 'rxjs';
import {
  CardDto,
  CollectionCardDto,
  PrintingDto,
  SetSummaryDto,
  SynergyScore,
} from '../../models/game.models';
import { CardType } from '../../models/enums';
import { buildTypeLine, colorIdentityViolations } from '../../utils/card.utils';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { GameApiService } from '../../services/game-api.service';
import { PrintingsService } from '../../services/printings.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { SelectMenuComponent, SelectMenuOption } from '../select-menu/select-menu.component';
import { FlightSource } from '../../shared/fly-card';

type RarityCode = 'common' | 'uncommon' | 'rare' | 'mythic';
type CmcOption = '0' | '1' | '2' | '3' | '4' | '5' | '6+';
type SortBy = 'name' | 'cmc';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-card-search-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ManaCostComponent,
    CardModalComponent,
    SelectMenuComponent,
    OracleSymbolsPipe,
  ],
  templateUrl: './card-search-panel.component.html',
  styleUrls: ['./card-search-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchPanelComponent implements OnInit, OnDestroy {
  @Input() ownedCards: CollectionCardDto[] = [];
  @Input() deckCards: CollectionCardDto[] = [];
  @Input() isDeckContext = false;
  @Input() deckFormat: string | null = null;

  /** Pass the commander's CardDto to enable the "Fit?" analysis button. */
  @Input() commanderCard: CardDto | null = null;

  @Output() fitRequested = new EventEmitter<{ card: CardDto; commanderCard: CardDto }>();
  @Output() cardRemove = new EventEmitter<string>(); // emits oracleId
  @Output() cardDecrementNormal = new EventEmitter<string>(); // emits oracleId
  @Output() cardDecrementFoil = new EventEmitter<string>(); // emits oracleId

  // ---- Synergy scores per oracle ID --------------------------------
  synergyScores = new Map<string, SynergyScore | 'loading'>();

  requestFit(card: CardDto, e: MouseEvent): void {
    e.stopPropagation();
    if (!this.commanderCard) return;
    this.synergyScores.set(card.oracleId, 'loading');
    this.cdr.markForCheck();
    this.fitRequested.emit({ card, commanderCard: this.commanderCard });
  }

  setSynergyScore(oracleId: string, result: SynergyScore): void {
    this.synergyScores.set(oracleId, result);
    this.cdr.markForCheck();
  }

  isSynergyLoading(oracleId: string): boolean {
    return this.synergyScores.get(oracleId) === 'loading';
  }

  getSynergyScore(oracleId: string): SynergyScore | null {
    const s = this.synergyScores.get(oracleId);
    return s && s !== 'loading' ? s : null;
  }

  private _commanderFilter = false;
  get commanderFilter(): boolean {
    return this._commanderFilter;
  }
  @Input() set commanderFilter(v: boolean) {
    this._commanderFilter = v;
    this.results = [];
    this.searched = false;
    this.filterChange$.next();
  }

  @Input()
  set isOpen(value: boolean) {
    this._isOpen = value;
    if (!value) this.resetPanel();
  }
  get isOpen(): boolean {
    return this._isOpen;
  }
  private _isOpen = false;

  @HostBinding('class.is-open') get openClass() {
    return this._isOpen;
  }

  /**
   * Swap mode: the panel takes over the board area (flex: 1) instead of sliding in
   * as a fixed-width drawer, and the results tile into a responsive grid.
   */
  @Input() boardMode = false;

  @HostBinding('class.is-board') get boardClass() {
    return this.boardMode;
  }

  @Output() cardAdd = new EventEmitter<{
    oracleId: string;
    scryfallId: string;
    isCommanderEligible: boolean;
    foil?: boolean;
    /** Where the add was clicked, so a deck-context parent can fly the card into its deck. */
    flight?: FlightSource;
  }>();
  @Output() panelClose = new EventEmitter<void>();

  // ---- Search & filter state ----------------------------------------

  searchText = new FormControl('');

  selectedColors = new Set<string>();
  selectedTypes = new Set<string>();
  selectedRarities = new Set<RarityCode>();
  selectedCmc: CmcOption | null = null;
  activeSet: string | null = null;
  sortBy: SortBy = 'name';
  sortDir: SortDir = 'asc';
  matchCase = false;
  matchWord = false;
  useRegex = false;

  // ---- Results state ------------------------------------------------

  readonly PAGE_SIZE = 20;

  results: CardDto[] = [];
  loading = false;
  loadingMore = false;
  searched = false;
  hasMore = false;
  flippedIds = new Set<string>();
  private currentOffset = 0;
  private lastQuery = '';

  // ---- Set dropdown -------------------------------------------------

  allSets: SetSummaryDto[] = [];
  setQuery = '';
  setDropOpen = false;

  get filteredSets(): SetSummaryDto[] {
    const q = this.setQuery.trim().toLowerCase();
    if (!q) return this.allSets;
    return this.allSets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }

  get activeSetName(): string {
    return (
      this.allSets.find((s) => s.code.toLowerCase() === this.activeSet?.toLowerCase())?.name ?? ''
    );
  }

  get hasFilters(): boolean {
    return (
      this.selectedColors.size > 0 ||
      this.selectedTypes.size > 0 ||
      this.selectedRarities.size > 0 ||
      this.selectedCmc !== null ||
      this.activeSet !== null ||
      this.sortBy !== 'name' ||
      this.sortDir !== 'asc'
    );
  }

  // ---- Filter option lists ------------------------------------------

  readonly colorOptions = [
    { code: 'W', symbol: 'w', title: 'White' },
    { code: 'U', symbol: 'u', title: 'Blue' },
    { code: 'B', symbol: 'b', title: 'Black' },
    { code: 'R', symbol: 'r', title: 'Red' },
    { code: 'G', symbol: 'g', title: 'Green' },
    { code: 'C', symbol: 'c', title: 'Colorless' },
    { code: 'M', symbol: 'multicolor', title: 'Multicolor' },
  ];

  readonly typeOptions = [
    'Creature',
    'Instant',
    'Sorcery',
    'Enchantment',
    'Artifact',
    'Land',
    'Planeswalker',
    'Token',
    'Other',
  ];

  readonly rarityOptions: { code: RarityCode; label: string; title: string }[] = [
    { code: 'common', label: 'C', title: 'Common' },
    { code: 'uncommon', label: 'U', title: 'Uncommon' },
    { code: 'rare', label: 'R', title: 'Rare' },
    { code: 'mythic', label: 'M', title: 'Mythic' },
  ];

  readonly cmcOptions: CmcOption[] = ['0', '1', '2', '3', '4', '5', '6+'];

  // ---- Search history -----------------------------------------------

  searchHistory: string[] = [];

  private loadSearchHistory(): void {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('mtg-search-history') || '[]');
      this.searchHistory = Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
    } catch {
      this.searchHistory = [];
    }
  }

  private saveSearchTerm(name: string): void {
    if (!name) return;
    this.searchHistory = [...new Set([name, ...this.searchHistory])].slice(0, 200);
    localStorage.setItem('mtg-search-history', JSON.stringify(this.searchHistory));
  }

  // ---- Per-result state ---------------------------------------------

  searchSelectedScryfallId = new Map<string, string>();
  addErrors = new Set<string>();

  // ---- Preview modal ------------------------------------------------

  previewCard: CardDto | null = null;
  previewPrintings: PrintingDto[] = [];
  previewScryfallId: string | null = null;
  previewFlipped = false;
  previewFoil = false;

  // ---- Internal -----------------------------------------------------

  private filterChange$ = new BehaviorSubject<void>(undefined);
  private loadMore$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private api: GameApiService,
    private printings: PrintingsService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  /** Loads printings through the shared cache and applies this panel's post-load hooks. */
  private loadPrintings(oracleId: string): void {
    this.printings
      .get(oracleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((printings) => {
        if (this.previewCard?.oracleId === oracleId) {
          this.previewPrintings = printings;
          if (!this.previewScryfallId && printings.length)
            this.previewScryfallId = printings[0].scryfallId;
        }
        this.applyDefaultPrinting(oracleId);
        this.cdr.markForCheck();
      });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (
      this.setDropOpen &&
      !this.elRef.nativeElement.querySelector('.set-dropdown-wrap')?.contains(e.target)
    )
      this.setDropOpen = false;
    if (this.previewCard && !this.elRef.nativeElement.contains(e.target as Node))
      this.closePreview();
  }

  ngOnInit(): void {
    this.loadSearchHistory();
    // Load sets (filtered by current non-set query)
    combineLatest([this.searchText.valueChanges.pipe(startWith('')), this.filterChange$])
      .pipe(
        debounceTime(350),
        map(([text]) => this.buildNonSetQuery(text ?? '')),
        distinctUntilChanged(),
        switchMap((q) =>
          this.api.getSets(q || undefined).pipe(catchError(() => of<SetSummaryDto[]>([]))),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((sets) => {
        this.allSets = sets;
        this.cdr.markForCheck();
      });

    // Main search pipeline
    combineLatest([this.searchText.valueChanges.pipe(startWith('')), this.filterChange$])
      .pipe(
        debounceTime(350),
        map(([text]) => ({
          query: this.buildQuery(text ?? ''),
          sortBy: this.sortBy,
          sortDir: this.sortDir,
          matchCase: this.matchCase,
          matchWord: this.matchWord,
          useRegex: this.useRegex,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.query === b.query &&
            a.sortBy === b.sortBy &&
            a.sortDir === b.sortDir &&
            a.matchCase === b.matchCase &&
            a.matchWord === b.matchWord &&
            a.useRegex === b.useRegex,
        ),
        switchMap(({ query, sortBy, sortDir, matchCase, matchWord, useRegex }) => {
          if (!query.trim()) {
            this.loading = false;
            this.searched = false;
            this.results = [];
            this.hasMore = false;
            this.currentOffset = 0;
            this.lastQuery = '';
            this.cdr.markForCheck();
            return of(null);
          }
          this.loading = true;
          this.searched = true;
          this.currentOffset = 0;
          this.lastQuery = query;
          this.cdr.markForCheck();
          return this.api
            .searchCards(query, this.PAGE_SIZE, 0, sortBy, sortDir, matchCase, matchWord, useRegex)
            .pipe(catchError(() => of<CardDto[]>([])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((res) => {
        if (res !== null) {
          this.results = res;
          this.hasMore = res.length === this.PAGE_SIZE;
          this.loading = false;
          this.flippedIds.clear();
          this.searchSelectedScryfallId.clear();
          this.addErrors.clear();
          res.forEach((c) => this.loadPrintings(c.oracleId));
        }
        this.cdr.markForCheck();
      });

    // Load more
    this.loadMore$
      .pipe(
        concatMap(() => {
          if (!this.lastQuery || this.loadingMore) return of<CardDto[]>([]);
          this.loadingMore = true;
          this.currentOffset += this.PAGE_SIZE;
          this.cdr.markForCheck();
          return this.api
            .searchCards(
              this.lastQuery,
              this.PAGE_SIZE,
              this.currentOffset,
              this.sortBy,
              this.sortDir,
              this.matchCase,
              this.matchWord,
              this.useRegex,
            )
            .pipe(catchError(() => of<CardDto[]>([])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((res) => {
        this.results = [...this.results, ...res];
        this.hasMore = res.length === this.PAGE_SIZE;
        this.loadingMore = false;
        res.forEach((c) => this.loadPrintings(c.oracleId));
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---- Filter toggles -----------------------------------------------

  toggleColor(code: string): void {
    this.selectedColors.has(code)
      ? this.selectedColors.delete(code)
      : this.selectedColors.add(code);
    this.filterChange$.next();
  }

  toggleType(type: string): void {
    this.selectedTypes.has(type) ? this.selectedTypes.delete(type) : this.selectedTypes.add(type);
    this.filterChange$.next();
  }

  toggleRarity(code: RarityCode): void {
    this.selectedRarities.has(code)
      ? this.selectedRarities.delete(code)
      : this.selectedRarities.add(code);
    this.filterChange$.next();
  }

  toggleCmc(opt: CmcOption): void {
    this.selectedCmc = this.selectedCmc === opt ? null : opt;
    this.filterChange$.next();
  }

  openSetDrop(): void {
    this.setQuery = '';
    this.setDropOpen = true;
  }

  selectSetFromDrop(code: string): void {
    this.activeSet = this.activeSet === code ? null : code;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  clearSet(): void {
    this.activeSet = null;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  setSortBy(field: SortBy): void {
    this.sortBy = field;
    this.filterChange$.next();
  }
  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.filterChange$.next();
  }

  toggleMatchCase(): void {
    this.matchCase = !this.matchCase;
    this.filterChange$.next();
  }
  toggleMatchWord(): void {
    this.matchWord = !this.matchWord;
    this.filterChange$.next();
  }
  toggleUseRegex(): void {
    this.useRegex = !this.useRegex;
    this.filterChange$.next();
  }

  clearFilters(): void {
    this.selectedColors.clear();
    this.selectedTypes.clear();
    this.selectedRarities.clear();
    this.selectedCmc = null;
    this.activeSet = null;
    this.setDropOpen = false;
    this.sortBy = 'name';
    this.sortDir = 'asc';
    this.matchCase = false;
    this.matchWord = false;
    this.useRegex = false;
    this.searchText.setValue('', { emitEvent: false });
    this.results = [];
    this.searched = false;
    this.flippedIds.clear();
    this.filterChange$.next();
  }

  // ---- Result helpers -----------------------------------------------

  loadMore(): void {
    this.loadMore$.next();
  }

  toggleFlip(oracleId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedIds.has(oracleId)) this.flippedIds.delete(oracleId);
    else this.flippedIds.add(oracleId);
    this.cdr.markForCheck();
  }

  cardImage(card: CardDto): string | null {
    if (this.flippedIds.has(card.oracleId) && card.imageUriNormalBack)
      return card.imageUriNormalBack;
    return card.imageUriSmall;
  }

  /** Full-resolution art for the board-mode tiles; the small image is thumbnail-only. */
  tileImage(card: CardDto): string | null {
    if (this.flippedIds.has(card.oracleId) && card.imageUriNormalBack)
      return card.imageUriNormalBack;
    return card.imageUriNormal ?? card.imageUriSmall;
  }

  /** Stable identity so appended pages never replay the earlier tiles' entrances. */
  trackResult(_i: number, card: CardDto): string {
    return card.oracleId;
  }

  // ---- Board-mode tile clicks -------------------------------------
  //
  // The same click language as the deck and collection grids: a single click toggles
  // the card's description overlay, a quick second click opens the preview modal.

  tileInfoId: string | null = null;
  private lastTileClick: { id: string; time: number } | null = null;

  onTileClick(card: CardDto, e: MouseEvent): void {
    e.stopPropagation();
    const now = performance.now();
    if (this.lastTileClick?.id === card.oracleId && now - this.lastTileClick.time < 350) {
      this.lastTileClick = null;
      this.tileInfoId = null;
      this.openPreview(card);
      return;
    }
    this.lastTileClick = { id: card.oracleId, time: now };
    this.tileInfoId = this.tileInfoId === card.oracleId ? null : card.oracleId;
    this.cdr.markForCheck();
  }

  typeLine(card: CardDto): string {
    return buildTypeLine(card);
  }

  /**
   * Default a row to its first cached printing — the server orders them newest set first —
   * so Add works immediately; the dropdown stays there to change it.
   */
  private applyDefaultPrinting(oracleId: string): void {
    const printings = this.printings.cached(oracleId);
    if (printings?.length && !this.searchSelectedScryfallId.has(oracleId))
      this.searchSelectedScryfallId.set(oracleId, printings[0].scryfallId);
  }

  onSelectFocus(oracleId: string): void {
    if (!this.printings.has(oracleId)) this.loadPrintings(oracleId);
  }

  /**
   * Printings mapped to select-menu options, memoized per cached printings array so
   * change detection reuses the same reference instead of rebuilding every pass.
   */
  private printingOptionsCache = new Map<
    string,
    { src: PrintingDto[]; opts: SelectMenuOption[] }
  >();

  printingOptions(oracleId: string): SelectMenuOption[] {
    const printings = this.printings.cached(oracleId) ?? [];
    const hit = this.printingOptionsCache.get(oracleId);
    if (hit && hit.src === printings) return hit.opts;
    const opts = printings.map((p) => ({
      value: p.scryfallId,
      label: `${p.setCode.toUpperCase()} #${p.collectorNumber}`,
      title: p.setName,
    }));
    this.printingOptionsCache.set(oracleId, { src: printings, opts });
    return opts;
  }

  // ---- Search history suggestions ------------------------------------

  histOpen = false;

  get histSuggestions(): string[] {
    const q = (this.searchText.value ?? '').trim().toLowerCase();
    return this.searchHistory.filter((h) => !q || h.toLowerCase().includes(q)).slice(0, 8);
  }

  pickHistory(h: string): void {
    this.searchText.setValue(h);
    this.histOpen = false;
    this.cdr.markForCheck();
  }

  closeHistSoon(): void {
    setTimeout(() => {
      this.histOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  onSetChange(oracleId: string, scryfallId: string): void {
    this.searchSelectedScryfallId.set(oracleId, scryfallId);
    this.addErrors.delete(oracleId);
  }

  ownedEntry(oracleId: string): CollectionCardDto | undefined {
    return this.ownedCards.find((c) => c.oracleId === oracleId);
  }

  isInDeck(card: CardDto): boolean {
    return this.deckCards.some((c) => c.oracleId === card.oracleId);
  }

  deckCount(oracleId: string): number {
    return this.deckCards
      .filter((c) => c.oracleId === oracleId)
      .reduce((sum, c) => sum + c.quantity + c.quantityFoil, 0);
  }

  removeFromDeck(card: CardDto): void {
    this.cardRemove.emit(card.oracleId);
  }

  isColorViolation(card: CardDto): boolean {
    if (!this.isDeckContext || !this.commanderCard?.colorIdentity?.length) return false;
    return colorIdentityViolations(card.colorIdentity, this.commanderCard.colorIdentity).length > 0;
  }

  isSingletonViolation(card: CardDto): boolean {
    if (!this.isDeckContext || this.deckFormat !== 'commander') return false;
    const isBasic =
      (card.supertypes?.includes('Basic') && card.cardTypes?.includes(CardType.Land)) ?? false;
    return !isBasic && this.deckCount(card.oracleId) >= 1;
  }

  addCard(card: CardDto, e?: Event, foil = false): void {
    let scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) {
      const printings = this.printings.cached(card.oracleId);
      if (printings?.length === 1) scryfallId = printings[0].scryfallId;
    }
    if (!scryfallId) {
      this.addErrors.add(card.oracleId);
      this.cdr.markForCheck();
      return;
    }
    this.addErrors.delete(card.oracleId);
    const isLegendary = card.supertypes?.includes('Legendary') ?? false;
    const isCreatureOrPw =
      (card.cardTypes?.includes(CardType.Creature) ||
        card.cardTypes?.includes(CardType.Planeswalker)) ??
      false;
    this.cardAdd.emit({
      oracleId: card.oracleId,
      scryfallId,
      isCommanderEligible: isLegendary && isCreatureOrPw,
      foil,
      flight: this.rowFlight(e, card),
    });
    if (card.name) this.saveSearchTerm(card.name);
  }

  /** The clicked row's or tile's art, carried on the add event as the flight source. */
  private rowFlight(e: Event | undefined, card: CardDto): FlightSource | undefined {
    const row = (e?.currentTarget as HTMLElement | null)?.closest('.result-row, .result-tile');
    const from = row?.querySelector('.result-art, .tile-art')?.getBoundingClientRect();
    if (!from) return undefined;
    const imageUrl = card.imageUriArtCrop || card.imageUriSmall || card.imageUriNormal || null;
    return { from, imageUrl };
  }

  /** With a single known printing there is nothing to choose — show it as plain text. */
  singlePrintingLabel(oracleId: string): string | null {
    const opts = this.printingOptions(oracleId);
    return opts.length === 1 ? opts[0].label : null;
  }

  onDragStart(card: CardDto, event: DragEvent): void {
    let scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) {
      const printings = this.printings.cached(card.oracleId);
      if (printings && printings.length > 0) scryfallId = printings[0].scryfallId;
    }
    if (!scryfallId) {
      event.preventDefault();
      return;
    }
    this.addErrors.delete(card.oracleId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(
        'application/x-search-card',
        JSON.stringify({ oracleId: card.oracleId, scryfallId }),
      );
      const isLegendary = card.supertypes?.includes('Legendary') ?? false;
      const isCreatureOrPw =
        (card.cardTypes?.includes(CardType.Creature) ||
          card.cardTypes?.includes(CardType.Planeswalker)) ??
        false;
      if (isLegendary && isCreatureOrPw) {
        event.dataTransfer.setData('application/x-commander-card', '1');
      }
      const artEl = (event.target as HTMLElement)
        .closest('.result-row')
        ?.querySelector('.result-art') as HTMLElement | null;
      if (artEl)
        event.dataTransfer.setDragImage(artEl, artEl.offsetWidth / 2, artEl.offsetHeight / 2);
    }
  }

  highlightParts(text: string): { text: string; match: boolean }[] {
    const q = (this.searchText.value ?? '').trim();
    if (!q) return [{ text, match: false }];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    const testRe = new RegExp(`^${escaped}$`, 'i');
    return parts.filter((p) => p.length > 0).map((p) => ({ text: p, match: testRe.test(p) }));
  }

  // ---- Preview modal ------------------------------------------------

  @ViewChild(CardModalComponent) private previewModal?: CardModalComponent;

  openPreview(card: CardDto): void {
    this.previewCard = card;
    this.previewFlipped = false;
    this.previewFoil = false;
    const cached = this.printings.cached(card.oracleId);
    this.previewPrintings = cached ?? [];
    this.previewScryfallId = cached?.[0]?.scryfallId ?? null;
    if (!cached) this.loadPrintings(card.oracleId);
    this.cdr.markForCheck();
  }

  closePreview(): void {
    this.previewCard = null;
    this.cdr.markForCheck();
  }

  addPreviewCard(): void {
    if (!this.previewCard) return;
    const scryfallId =
      this.previewScryfallId ??
      this.searchSelectedScryfallId.get(this.previewCard.oracleId) ??
      this.printings.cached(this.previewCard.oracleId)?.[0]?.scryfallId;
    if (!scryfallId) return;
    const isLegendary = this.previewCard.supertypes?.includes('Legendary') ?? false;
    const isCreatureOrPw =
      (this.previewCard.cardTypes?.includes(CardType.Creature) ||
        this.previewCard.cardTypes?.includes(CardType.Planeswalker)) ??
      false;
    const from = this.previewModal?.artRect();
    this.cardAdd.emit({
      oracleId: this.previewCard.oracleId,
      scryfallId,
      isCommanderEligible: isLegendary && isCreatureOrPw,
      foil: this.previewFoil,
      flight: from ? { from, imageUrl: this.previewModal?.artImageUrl ?? null } : undefined,
    });
  }

  addPreviewNormal(): void {
    this.previewFoil = false;
    this.addPreviewCard();
  }
  addPreviewFoil(): void {
    this.previewFoil = true;
    this.addPreviewCard();
  }

  removePreviewCard(): void {
    if (!this.previewCard) return;
    this.cardRemove.emit(this.previewCard.oracleId);
  }

  decrementPreviewNormal(): void {
    if (!this.previewCard) return;
    this.cardDecrementNormal.emit(this.previewCard.oracleId);
  }

  decrementPreviewFoil(): void {
    if (!this.previewCard) return;
    this.cardDecrementFoil.emit(this.previewCard.oracleId);
  }

  close(): void {
    this.panelClose.emit();
  }

  // ---- Internals ----------------------------------------------------

  private resetPanel(): void {
    this.searchText.setValue('', { emitEvent: false });
    this.results = [];
    this.searched = false;
    this.loading = false;
    this.flippedIds.clear();
    this.searchSelectedScryfallId.clear();
    this.addErrors.clear();
    this.previewCard = null;
    this.tileInfoId = null;
  }

  private buildNonSetQuery(text: string): string {
    const parts: string[] = [];
    if (text.trim().length >= 2) parts.push(`(name:"${text.trim()}" or o:"${text.trim()}")`);

    if (this.selectedColors.size > 0) {
      const codes = [...this.selectedColors];
      if (codes.includes('M')) parts.push('c:m');
      else if (codes.includes('C')) parts.push('c:c');
      else parts.push(`c:${codes.join('').toLowerCase()}`);
    }
    if (this.selectedTypes.size > 0) {
      const t = [...this.selectedTypes].map((x) => x.toLowerCase());
      parts.push(t.length === 1 ? `t:${t[0]}` : `(${t.map((x) => `t:${x}`).join(' or ')})`);
    }
    if (this.selectedRarities.size > 0) {
      const r = [...this.selectedRarities];
      parts.push(r.length === 1 ? `r:${r[0]}` : `(${r.map((x) => `r:${x}`).join(' or ')})`);
    }
    if (this.selectedCmc !== null)
      parts.push(this.selectedCmc === '6+' ? 'cmc>=6' : `cmc=${this.selectedCmc}`);

    return parts.join(' ');
  }

  private buildQuery(text: string): string {
    const base = this.buildNonSetQuery(text);
    const setToken = this.activeSet ? `s:${this.activeSet}` : '';
    const cmdrToken = this.commanderFilter ? 't:legendary (t:creature OR t:planeswalker)' : '';
    return [base, setToken, cmdrToken].filter(Boolean).join(' ');
  }
}
