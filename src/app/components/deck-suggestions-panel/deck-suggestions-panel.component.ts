import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, query, stagger, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CandidateCardDto, CardDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { PrintingsService } from '../../services/printings.service';
import { DeckDetailDto } from '../../services/deck-api.service';
import {
  DeckApiService,
  DeckSuggestionsDto,
  SuggestedCardDto,
} from '../../services/deck-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { SetIconComponent } from '../set-icon/set-icon.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { SearchInputComponent } from '../search-input/search-input.component';
import { ToBodyDirective } from '../../shared/to-body.directive';
import { FlightSource } from '../../shared/fly-card';

/**
 * Keys of DeckSuggestionsDto that hold card lists. Named explicitly rather than as
 * `keyof DeckSuggestionsDto` so that adding metadata to the response — such as which
 * sets the "latest" picks came from — cannot be mistaken for another card section.
 */
export type SuggestionCategoryKey = 'latestSet' | 'topSynergy' | 'gameChangers';

/** How the "show more" pool is ordered. */
export type MoreSort = 'relevance' | 'synergy';

export interface SuggestionCategory {
  key: SuggestionCategoryKey;
  label: string;
  icon: string;
  accent: string;
}

@Component({
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ManaCostComponent,
    CardModalComponent,
    SearchInputComponent,
    SetIconComponent,
    ToBodyDirective,
  ],
  templateUrl: './deck-suggestions-panel.component.html',
  styleUrls: ['./deck-suggestions-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    // Cards flow into a list one at a time instead of the whole block popping in: each
    // newly-entering row fades and rises, offset from the last by a small stagger. Bound to
    // the list's length, so it fires on first fill AND every time cards are appended — the
    // provisional reveal, the judged result's new picks, and each page of the "show more"
    // pool as it loads on scroll. trackBy keeps surviving rows out of the :enter set, so only
    // genuinely new cards animate; the rest stay put and resolve in place.
    trigger('listStagger', [
      transition(':enter, * => *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateY(14px)' }),
            stagger(120, [
              animate(
                '620ms cubic-bezier(0.22, 1, 0.36, 1)',
                style({ opacity: 1, transform: 'translateY(0)' }),
              ),
            ]),
          ],
          { optional: true },
        ),
        // Cut cards (a judge drop, a filter change) fade out rather than vanishing. No stagger
        // here: a filter that removes many at once should clear quickly, not ripple for seconds.
        query(
          ':leave',
          [animate('160ms ease', style({ opacity: 0, transform: 'translateY(-6px)' }))],
          { optional: true },
        ),
      ]),
    ]),
  ],
})
export class DeckSuggestionsPanelComponent implements OnDestroy {
  @Input() deck: DeckDetailDto | null = null;
  @Input() commanderCard: CardDto | null = null;
  @Input() tagSuggestions: string[] = [];

  @Output() cardAdd = new EventEmitter<{
    oracleId: string;
    scryfallId: string;
    /** Where the add was clicked, so the parent can fly the card into its deck. */
    flight?: FlightSource;
  }>();
  @Output() cardRemove = new EventEmitter<string>(); // emits oracleId
  @Output() panelClose = new EventEmitter<void>();
  /** The empty state's way out when the deck has no commander to suggest around yet. */
  @Output() commanderRequested = new EventEmitter<void>();

  /**
   * Suggestions are a commander read: `generate()` needs a commander oracle id, and the
   * Generate button rides the commander bar. On any other format there is nothing to
   * offer, which the empty state has to say rather than pointing at a missing button.
   */
  get isCommanderDeck(): boolean {
    return this.deck?.format === 'commander';
  }

  requestCommander(): void {
    this.commanderRequested.emit();
  }

  suggestions: DeckSuggestionsDto | null = null;
  loading = false;
  error: string | null = null;

  // Streaming progress: a coarse stage label shown under the spinner, and a flag marking the
  // currently shown lists as provisional (revealed before the judge pass finishes).
  stageLabel: string | null = null;
  provisional = false;
  /** Smoothly-animated 0–100 width that trickles toward the next stage between events. */
  displayProgress = 0;
  private trickleTimer: ReturnType<typeof setInterval> | null = null;

  // Suggestion fine-tuning tags
  suggestionTags: string[] = [];
  tagDraft = '';

  // Card detail modal
  selectedSuggestion: SuggestedCardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;

  @ViewChild(CardModalComponent) private cardModal?: CardModalComponent;

  /**
   * Set while the modal plays its exit after Add/Remove: the action button swaps to a
   * confirmation ("Added") for the fade instead of flickering to its opposite state the
   * moment the deck updates underneath it.
   */
  modalCloseAction: 'added' | 'removed' | null = null;

  // No "Notable Mentions": it drew from the same pool as Top Synergy, so its cards were
  // always just below that section with nothing but an arbitrary cut between them. Top
  // Synergy is the general list, and its "show more" continues the same ranking.
  readonly categories: SuggestionCategory[] = [
    { key: 'latestSet', label: 'New from Latest Sets', icon: 'bi-stars', accent: '#818cf8' },
    { key: 'gameChangers', label: 'Game Changers', icon: 'bi-trophy', accent: '#fb923c' },
    { key: 'topSynergy', label: 'Top Synergy', icon: 'bi-lightning', accent: '#4ade80' },
  ];

  private destroy$ = new Subject<void>();
  private suggestionsCache = new Map<string, DeckSuggestionsDto>();

  constructor(
    private deckApi: DeckApiService,
    private gameApi: GameApiService,
    private printings: PrintingsService,
    private cdr: ChangeDetectorRef,
  ) {}

  // ---- "Show more" per section --------------------------------------
  //
  // Each category is short on purpose, so every one gets its own way into the
  // pool it was drawn from: latest-set picks open the newest sets, Game
  // Changers open the official list, the rest open the full legal pool. The
  // modal scrolls independently and pages as you reach the bottom.

  moreCategory: SuggestionCategory | null = null;
  moreCards: CandidateCardDto[] = [];
  /** `moreCards` in the order the list actually renders them. See {@link applySort}. */
  displayCards: CandidateCardDto[] = [];
  moreTotal = 0;
  moreLoading = false;
  private readonly morePageSize = 30;

  /**
   * True while the pool is being fetched from scratch with nothing yet on screen — a sort
   * switch, a filter change, or the first open. Switching Relevance↔Synergy re-queries the
   * server (each order is a different query); this disables the sort toggle until the
   * reordered list arrives. Distinct from paging, where rows are already shown and a footer
   * spinner covers the next page.
   */
  get moreReloading(): boolean {
    return this.moreLoading && this.moreCards.length === 0;
  }

  /**
   * Drives the panel loading bar. Kept separate from {@link moreReloading} because a reorder
   * can complete in well under a frame (synergy rows arrive already scored), which flashed the
   * bar too fast to register. We latch it on when a reload starts, hold it through any scoring
   * that follows, and keep it up for a minimum time so the switch always reads as acknowledged.
   */
  loadbarVisible = false;
  private loadbarShownAt = 0;
  private loadbarHideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly LOADBAR_MIN_MS = 650;

  private showLoadbar(): void {
    if (this.loadbarHideTimer) {
      clearTimeout(this.loadbarHideTimer);
      this.loadbarHideTimer = null;
    }
    this.loadbarShownAt = Date.now();
    this.loadbarVisible = true;
  }

  /** Hide the bar once nothing is loading, but never before it has been up its minimum time. */
  private settleLoadbar(): void {
    if (!this.loadbarVisible) return;
    if (this.moreReloading || this.scoringInFlight > 0) return; // still working
    const remaining = Math.max(
      0,
      DeckSuggestionsPanelComponent.LOADBAR_MIN_MS - (Date.now() - this.loadbarShownAt),
    );
    if (this.loadbarHideTimer) clearTimeout(this.loadbarHideTimer);
    this.loadbarHideTimer = setTimeout(() => {
      this.loadbarVisible = false;
      this.loadbarHideTimer = null;
      this.cdr.markForCheck();
    }, remaining);
  }

  readonly sortOptions: { value: MoreSort; label: string; hint: string }[] = [
    {
      value: 'relevance',
      label: 'Relevance',
      hint: 'Closest match to your search and to what the commander cares about',
    },
    {
      value: 'synergy',
      label: 'Synergy',
      hint: 'Highest synergy first, ranked across the whole pool by the server',
    },
  ];

  moreSort: MoreSort = 'relevance';

  setMoreSort(sort: MoreSort): void {
    if (this.moreSort === sort) return;
    this.moreSort = sort;
    // The server does the ordering, so a different order is a different query.
    this.reloadMore();
    this.cdr.markForCheck();
  }

  /**
   * Both orders arrive from the server already sorted, so rows render in the order they
   * were paged in. Client-side sorting could only ever reorder the slice that happens to
   * be loaded, which is what made rows jump around mid-scroll.
   */
  private applySort(): void {
    this.displayCards = this.moreCards;
  }

  /** Keeps rows (and their loaded images) in place when a score arrives and re-sorts. */
  trackCandidate(_: number, c: CandidateCardDto): string {
    return c.card.oracleId;
  }

  /** Which slice of the pool a category was drawn from. */
  private scopeFor(key: SuggestionCategoryKey): string {
    if (key === 'latestSet') return 'latest';
    if (key === 'gameChangers') return 'gamechangers';
    return 'all';
  }

  /**
   * What to search the pool for. Starts empty so Show More opens on the whole pool; the
   * player's focus still ranks themed cards to the top through the separate `focus` score
   * input. Typing here adds a hard text filter on top.
   */
  moreQuery = '';

  private scoredKey: string | null = null;

  /**
   * The themes the player has asked to build around. Sent with every scoring request so
   * the browse list answers the same question the suggestion lists do — without it, the
   * same card showed one percentage in the panel and another in the modal.
   */
  private activeFocus(): string[] {
    return [...(this.deck?.tags ?? []), ...this.suggestionTags]
      .map((t) => t.trim())
      .filter((t) => !!t);
  }

  /** Scores depend on the commander AND the focus, so both invalidate them. */
  private currentScoreKey(): string {
    const focus = [...this.activeFocus()]
      .map((t) => t.toLowerCase())
      .sort()
      .join(',');
    return `${this.commanderCard?.oracleId ?? ''}|${focus}`;
  }

  openMore(cat: SuggestionCategory): void {
    // The category pool is not settled while the lists are still being thought through.
    if (this.isThinking) return;
    // Keep scores across opens, drop them when the commander or the focus changed.
    const key = this.currentScoreKey();
    if (this.scoredKey !== key) {
      this.moreScores.clear();
      this.scoredKey = key;
    }

    this.moreCategory = cat;
    // Open on the whole pool. The focus still ranks themed cards to the top (it is sent as
    // the `focus` score input, not as a query), so seeding the search box with it only hard-
    // filtered the list — and emptied small curated pools like Game Changers, where nothing
    // matches the literal focus word. The box starts empty and is the player's to type into.
    this.moreQuery = '';
    this.selectedTypes.clear();
    this.cmcIndex = 0;
    this.moreCards = [];
    this.displayCards = [];
    this.moreTotal = 0;
    this.moreLoadedOnce = false;
    this.moreFailures = 0;
    this.loadMore();
  }

  // ---- Image loading -------------------------------------------------

  private readonly loadedImages = new Set<string>();

  /** Art crop first: a square crop of a whole card lands on the type line, not the art. */
  artOf(card: CardDto | null | undefined): string | null {
    return card?.imageUriArtCrop || card?.imageUriSmall || null;
  }

  isImageLoaded(src: string | null): boolean {
    return !!src && this.loadedImages.has(src);
  }

  /** Errors count as settled too, so a broken URL does not shimmer forever. */
  onImageSettled(src: string | null): void {
    if (!src) return;
    this.loadedImages.add(src);
    this.cdr.markForCheck();
  }

  /** Debouncing lives in the shared search box now. */
  onMoreQuerySearch(q: string): void {
    this.moreQuery = q;
    this.reloadMore();
  }

  // ---- Filters -------------------------------------------------------

  readonly typeFilters = [
    'Creature',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Land',
    'Planeswalker',
  ];

  /** Mana-value buckets. `max: null` means "and above". */
  readonly cmcFilters: { label: string; min: number | null; max: number | null }[] = [
    { label: 'Any', min: null, max: null },
    { label: '0–1', min: 0, max: 1 },
    { label: '2', min: 2, max: 2 },
    { label: '3', min: 3, max: 3 },
    { label: '4', min: 4, max: 4 },
    { label: '5+', min: 5, max: null },
  ];

  selectedTypes = new Set<string>();
  cmcIndex = 0;

  toggleTypeFilter(t: string): void {
    if (this.selectedTypes.has(t)) this.selectedTypes.delete(t);
    else this.selectedTypes.add(t);
    this.reloadMore();
  }

  setCmcFilter(i: number): void {
    if (this.cmcIndex === i) return;
    this.cmcIndex = i;
    this.reloadMore();
  }

  get hasMoreFilters(): boolean {
    return this.selectedTypes.size > 0 || this.cmcIndex !== 0 || !!this.moreQuery.trim();
  }

  clearMoreFilters(): void {
    this.selectedTypes.clear();
    this.cmcIndex = 0;
    this.moreQuery = '';
    this.reloadMore();
  }

  /** Any filter change restarts paging: offsets from the old result set are meaningless. */
  private reloadMore(): void {
    this.moreCards = [];
    this.displayCards = [];
    this.moreTotal = 0;
    this.moreLoadedOnce = false;
    this.moreFailures = 0;
    // A from-scratch load (sort switch, filter, first open) drives the panel loading bar.
    this.showLoadbar();
    this.loadMore();
  }

  closeMore(): void {
    this.moreCategory = null;
    if (this.loadbarHideTimer) {
      clearTimeout(this.loadbarHideTimer);
      this.loadbarHideTimer = null;
    }
    this.loadbarVisible = false;
    this.cdr.markForCheck();
  }

  loadMore(): void {
    const oracleId = this.commanderCard?.oracleId;
    const cat = this.moreCategory;
    if (!oracleId || !cat || this.moreLoading || !this.canPage) return;

    this.moreLoading = true;
    this.cdr.markForCheck();

    this.gameApi
      .getCandidates(
        oracleId,
        this.moreQuery,
        this.scopeFor(cat.key),
        {
          types: [...this.selectedTypes],
          cmcMin: this.cmcFilters[this.cmcIndex].min,
          cmcMax: this.cmcFilters[this.cmcIndex].max,
          focus: this.activeFocus(),
          // Ranking on the server means paging walks one ordered list. Sorting only the
          // rows already loaded could never show page 2's 88% card above page 1's 72% one.
          rank: this.moreSort === 'synergy' ? 'synergy' : 'relevance',
        },
        this.morePageSize,
        this.moreCards.length,
      )
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
      )
      .subscribe((page) => {
        this.moreLoading = false;

        // A failed page leaves the list exactly as it was. Zeroing the total instead
        // would blank the header count and, since "loaded >= total" then reads as
        // complete, quietly end paging for the rest of the session.
        if (!page) {
          this.moreFailures++;
          this.settleLoadbar();
          this.cdr.markForCheck();
          return;
        }

        this.moreFailures = 0;
        this.moreCards = [...this.moreCards, ...page.cards];
        this.moreTotal = page.total;
        this.moreLoadedOnce = true;
        this.applySort();
        this.cdr.markForCheck();
        this.scorePage(page.cards);
        // Fetch is done; if this page needs no scoring the bar settles now, otherwise the
        // scoring pass below keeps it up until the scores land.
        this.settleLoadbar();
      });
  }

  /** oracleId -> synergy score, filled in per page after the rows are already on screen. */
  readonly moreScores = new Map<string, number>();
  scoringInFlight = 0;

  /**
   * Scores a freshly loaded page. Runs after the rows render rather than blocking them:
   * the first page for a commander costs a model call, later ones usually hit the cache.
   */
  private scorePage(cards: CandidateCardDto[]): void {
    // Ranked pages already carry the score the server sorted by. Fetching it again would
    // be a second opinion on a settled question — and could disagree with the ordering.
    for (const c of cards) if (c.score != null) this.moreScores.set(c.card.oracleId, c.score);

    const oracleId = this.commanderCard?.oracleId;
    const ids = cards
      .filter((c) => c.score == null)
      .map((c) => c.card.oracleId)
      .filter((id) => !this.moreScores.has(id));

    if (!oracleId || ids.length === 0) {
      this.settleLoadbar();
      this.cdr.markForCheck();
      return;
    }

    this.scoringInFlight++;
    this.cdr.markForCheck();

    this.deckApi
      .analyzeSynergyBatch(oracleId, ids, this.activeFocus())
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
      )
      .subscribe((scored) => {
        for (const s of scored) this.moreScores.set(s.oracleId, s.score);
        this.scoringInFlight--;

        // Re-sort only once nothing is still scoring. Reordering as each batch lands
        // slides rows out from under the cursor mid-scroll; unscored rows are already
        // sorted to the bottom, so they stay put until the page settles.
        if (this.scoringInFlight === 0) this.applySort();
        this.settleLoadbar();
        this.cdr.markForCheck();
      });
  }

  scoreFor(c: CandidateCardDto): number | null {
    return this.moreScores.get(c.card.oracleId) ?? null;
  }

  /**
   * False once every card in the pool is on screen. Before the first page lands there is
   * nothing to compare against, so `moreLoadedOnce` distinguishes "not fetched yet" from
   * "fetched everything" — without it a pool smaller than one page would never load at all.
   */
  get moreHasMore(): boolean {
    return !this.moreLoadedOnce || this.moreCards.length < this.moreTotal;
  }

  private moreLoadedOnce = false;

  /**
   * Auto-paging gives up after this many consecutive failures. A request that keeps
   * failing would otherwise re-enter the same scroll loop by another route, since a
   * failed page still toggles the "Loading…" row and so still moves scrollHeight.
   */
  private static readonly maxPagingFailures = 3;
  private moreFailures = 0;

  private get canPage(): boolean {
    return this.moreHasMore && this.moreFailures < DeckSuggestionsPanelComponent.maxPagingFailures;
  }

  /**
   * Pages in when the modal list is scrolled near its own bottom.
   *
   * Bailing out when there is nothing left matters more than it looks: the "Loading…"
   * row changes the list's scrollHeight as it appears and disappears, which fires this
   * handler again. Without the guard, reaching the bottom of a fully loaded pool span
   * requests forever and flickered the row on and off with every one of them.
   */
  onMoreScroll(event: Event): void {
    if (this.moreLoading || !this.canPage) return;

    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) this.loadMore();
  }

  isCandidateInDeck(c: CandidateCardDto): boolean {
    return (this.deck?.cards ?? []).some((d) => d.cardDetails?.oracleId === c.card.oracleId);
  }

  addCandidate(c: CandidateCardDto, flight?: FlightSource): void {
    if (!c.scryfallId) return;
    this.cardAdd.emit({ oracleId: c.card.oracleId, scryfallId: c.scryfallId, flight });
  }

  /** Row-level add carrying the row's art as the flight source for the parent's animation. */
  addCandidateFromRow(c: CandidateCardDto, e: Event): void {
    this.addCandidate(c, this.rowFlight(e, this.artOf(c.card)));
  }

  addCardFromRow(s: SuggestedCardDto, e: Event): void {
    this.addCard(s, this.rowFlight(e, this.artOf(s.card)));
  }

  private rowFlight(e: Event, imageUrl: string | null): FlightSource | undefined {
    const row = (e.currentTarget as HTMLElement | null)?.closest('.sugg-card');
    const from = row?.querySelector('.sugg-card-art-wrap')?.getBoundingClientRect();
    return from ? { from, imageUrl } : undefined;
  }

  removeCandidate(c: CandidateCardDto): void {
    this.cardRemove.emit(c.card.oracleId);
  }

  /**
   * Opens the same card modal the suggestion rows use, by presenting the candidate in
   * the shape that modal already understands. No reason or score: nothing judged it.
   */
  openCandidateDetail(c: CandidateCardDto, e: MouseEvent): void {
    this.openDetail(
      { name: c.card.name, reason: '', score: 0, scryfallId: c.scryfallId, card: c.card },
      e,
    );
  }

  addSuggestionTag(tag: string): void {
    const t = tag.trim().toLowerCase();
    if (!t || this.suggestionTags.includes(t)) return;
    this.suggestionTags = [...this.suggestionTags, t];
    this.tagDraft = '';
    this.cdr.markForCheck();
  }

  // ---- Focus-tag suggestions ------------------------------------------

  focusSuggOpen = false;

  get focusSuggestions(): string[] {
    const q = this.tagDraft.trim().toLowerCase();
    const taken = new Set([
      ...this.suggestionTags,
      ...(this.deck?.tags ?? []).map((t) => t.toLowerCase()),
    ]);
    return this.tagSuggestions
      .filter((t) => !taken.has(t.toLowerCase()))
      .filter((t) => !q || t.toLowerCase().includes(q))
      .slice(0, 8);
  }

  pickFocusTag(tag: string): void {
    this.addSuggestionTag(tag);
    this.focusSuggOpen = false;
    this.cdr.markForCheck();
  }

  closeFocusSuggSoon(): void {
    setTimeout(() => {
      this.focusSuggOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  removeSuggestionTag(tag: string): void {
    this.suggestionTags = this.suggestionTags.filter((t) => t !== tag);
    this.cdr.markForCheck();
  }

  commitTagInput(): void {
    if (this.tagDraft.trim()) this.addSuggestionTag(this.tagDraft);
  }

  private cacheKey(): string {
    if (!this.commanderCard || !this.deck) return '';
    const deckNames = (this.deck.cards ?? [])
      .filter((c) => c.cardDetails?.oracleId !== this.commanderCard?.oracleId)
      .map((c) => c.cardDetails?.name)
      .filter((n): n is string => !!n)
      .sort()
      .join(',');
    const tagsKey = [...(this.deck.tags ?? []), ...this.suggestionTags].sort().join(',');
    return `${this.commanderCard.oracleId}:${deckNames}:${tagsKey}`;
  }

  generate(): void {
    if (!this.commanderCard || !this.deck) return;

    const key = this.cacheKey();

    // Use cache only on first generate; regenerate (suggestions already shown) always fetches fresh
    if (!this.suggestions) {
      const cached = this.suggestionsCache.get(key);
      if (cached) {
        this.suggestions = cached;
        this.cdr.markForCheck();
        return;
      }
    }

    // Remove stale cache so the fresh result replaces it
    this.suggestionsCache.delete(key);
    this.loading = true;
    this.error = null;
    this.suggestions = null;
    this.provisional = false;
    this.stageLabel = null;
    this.displayProgress = 0;
    this.stopTrickle();
    this.cdr.markForCheck();

    const deckCardNames = (this.deck.cards ?? [])
      .filter((c) => c.cardDetails?.oracleId !== this.commanderCard?.oracleId)
      .map((c) => c.cardDetails?.name)
      .filter((n): n is string => !!n);

    // Streamed: stage events drive the label under the spinner, the "cards" event reveals the
    // provisional lists, and "final" replaces them with the judged result. On a cache hit the
    // server sends only "final", so this collapses to the old single-shot behaviour.
    this.deckApi
      .getSuggestionsStream({
        commanderOracleId: this.commanderCard.oracleId,
        commanderName: this.commanderCard.name,
        commanderText: this.commanderCard.oracleText,
        deckCardNames,
        deckTags: this.deck.tags ?? [],
        suggestionTags: this.suggestionTags,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ev) => {
          switch (ev.type) {
            case 'stage':
              this.stageLabel = ev.label;
              this.startTrickle(ev.step, ev.total);
              break;
            case 'cards':
              // Provisional reveal — cards on screen, reasons still being written/verified.
              this.suggestions = ev.data;
              this.provisional = true;
              break;
            case 'final':
              this.stopTrickle();
              this.displayProgress = 100;
              this.suggestions = ev.data;
              this.provisional = false;
              this.loading = false;
              this.stageLabel = null;
              this.suggestionsCache.set(key, ev.data);
              break;
            case 'error':
              this.stopTrickle();
              this.error = ev.message || 'Failed to generate suggestions. Try again.';
              this.loading = false;
              this.provisional = false;
              break;
          }
          this.cdr.markForCheck();
        },
        complete: () => {
          // Safety net: if the stream closed without a final event, stop the spinner rather
          // than leaving it spinning forever.
          this.stopTrickle();
          if (this.loading) {
            this.loading = false;
            this.provisional = false;
            if (!this.suggestions && !this.error)
              this.error = 'Failed to generate suggestions. Try again.';
            this.cdr.markForCheck();
          }
        },
      });
  }

  /**
   * Eases {@link displayProgress} toward the current stage's share of the bar and keeps
   * creeping while the stage runs, so the fill moves gradually between events instead of
   * jumping. It stops ~1.5% short of the next boundary so the bar never looks finished
   * until the next stage — or the final result — advances it.
   */
  private startTrickle(step: number, total: number): void {
    this.stopTrickle();
    const floor = total ? ((step - 1) / total) * 100 : 0;
    const ceil = total ? (step / total) * 100 : 100;
    if (this.displayProgress < floor) this.displayProgress = floor;
    this.trickleTimer = setInterval(() => {
      const target = ceil - 1.5;
      if (this.displayProgress < target) {
        this.displayProgress += (target - this.displayProgress) * 0.12;
        this.cdr.markForCheck();
      }
    }, 200);
  }

  private stopTrickle(): void {
    if (this.trickleTimer) {
      clearInterval(this.trickleTimer);
      this.trickleTimer = null;
    }
  }

  /** A row is inert while its result is still being thought through (provisional + loading). */
  get isThinking(): boolean {
    return this.provisional && this.loading;
  }

  openDetail(s: SuggestedCardDto, e: MouseEvent): void {
    e.stopPropagation();
    // Provisional rows are not actionable — pointer-events:none blocks the mouse, this blocks
    // a keyboard-triggered click that would open a half-thought-through card.
    if (this.isThinking) return;
    this.selectedSuggestion = s;
    this.modalCloseAction = null;
    this.modalFlipped = false;

    const oracleId = s.card?.oracleId;
    if (!oracleId) {
      this.modalPrintings = [];
      this.modalViewScryfallId = s.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    const cached = this.printings.cached(oracleId);
    if (cached) {
      this.modalPrintings = cached;
      this.modalViewScryfallId = s.scryfallId ?? cached[0]?.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    this.modalPrintings = [];
    this.modalViewScryfallId = s.scryfallId ?? null;
    this.cdr.markForCheck();

    this.printings
      .get(oracleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((printings) => {
        if (this.selectedSuggestion?.card?.oracleId === oracleId) {
          this.modalPrintings = printings;
          if (!this.modalViewScryfallId && printings.length)
            this.modalViewScryfallId = printings[0].scryfallId;
          this.cdr.markForCheck();
        }
      });
  }

  closeDetail(): void {
    this.selectedSuggestion = null;
    this.modalCloseAction = null;
    this.cdr.markForCheck();
  }

  isInDeck(s: SuggestedCardDto): boolean {
    if (!s.card?.oracleId) return false;
    return (this.deck?.cards ?? []).some((c) => c.cardDetails?.oracleId === s.card!.oracleId);
  }

  addCard(s: SuggestedCardDto, flight?: FlightSource): void {
    // Cannot add a card that is still being thought through — the pick may yet be cut.
    if (this.isThinking) return;
    if (!s.card || !s.scryfallId) return;
    this.cardAdd.emit({ oracleId: s.card.oracleId, scryfallId: s.scryfallId, flight });
  }

  removeCard(s: SuggestedCardDto): void {
    if (!s.card?.oracleId) return;
    this.cardRemove.emit(s.card.oracleId);
  }

  addAndClose(s: SuggestedCardDto): void {
    if (this.isThinking || !s.card || !s.scryfallId) return;
    // Capture the art geometry before the exit animation starts shrinking the modal.
    const from = this.cardModal?.artRect();
    const flight = from ? { from, imageUrl: this.cardModal?.artImageUrl ?? null } : undefined;
    this.addCard(s, flight);
    this.closeWith('added');
  }

  removeAndClose(s: SuggestedCardDto): void {
    this.removeCard(s);
    this.closeWith('removed');
  }

  /** Close via the modal's own exit animation, showing a confirmation button while it fades. */
  private closeWith(action: 'added' | 'removed'): void {
    this.modalCloseAction = action;
    if (this.cardModal) this.cardModal.close();
    else this.closeDetail();
  }

  close(): void {
    this.panelClose.emit();
  }

  cardsFor(key: SuggestionCategoryKey): SuggestedCardDto[] {
    return this.suggestions?.[key] ?? [];
  }

  /**
   * Track cards by name so a row survives the provisional→final swap in place: its reason
   * un-blurs and sharpens via CSS transition instead of the element being torn down and
   * re-created (which would restart the "thinking" animation and flash). A card the judge
   * cut simply drops out; the survivors do not move.
   */
  trackByCardName(_: number, s: SuggestedCardDto): string {
    return s.name;
  }

  ngOnDestroy(): void {
    this.stopTrickle();
    if (this.loadbarHideTimer) clearTimeout(this.loadbarHideTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
