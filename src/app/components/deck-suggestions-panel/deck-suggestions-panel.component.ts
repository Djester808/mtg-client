import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CandidateCardDto, CardDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { DeckDetailDto } from '../../services/deck-api.service';
import {
  DeckApiService,
  DeckSuggestionsDto,
  SuggestedCardDto,
} from '../../services/deck-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { SearchInputComponent } from '../search-input/search-input.component';

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
  imports: [CommonModule, FormsModule, ManaCostComponent, CardModalComponent, SearchInputComponent],
  templateUrl: './deck-suggestions-panel.component.html',
  styleUrls: ['./deck-suggestions-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckSuggestionsPanelComponent implements OnDestroy {
  @Input() deck: DeckDetailDto | null = null;
  @Input() commanderCard: CardDto | null = null;
  @Input() tagSuggestions: string[] = [];

  @Output() cardAdd = new EventEmitter<{ oracleId: string; scryfallId: string }>();
  @Output() cardRemove = new EventEmitter<string>(); // emits oracleId
  @Output() panelClose = new EventEmitter<void>();

  suggestions: DeckSuggestionsDto | null = null;
  loading = false;
  error: string | null = null;

  // Suggestion fine-tuning tags
  suggestionTags: string[] = [];
  tagDraft = '';

  // Card detail modal
  selectedSuggestion: SuggestedCardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;

  // No "Notable Mentions": it drew from the same pool as Top Synergy, so its cards were
  // always just below that section with nothing but an arbitrary cut between them. Top
  // Synergy is the general list, and its "show more" continues the same ranking.
  readonly categories: SuggestionCategory[] = [
    { key: 'latestSet', label: 'New from Latest Sets', icon: 'bi-stars', accent: '#818cf8' },
    { key: 'gameChangers', label: 'Game Changers', icon: 'bi-trophy', accent: '#fb923c' },
    { key: 'topSynergy', label: 'Top Synergy', icon: 'bi-lightning', accent: '#4ade80' },
  ];

  private destroy$ = new Subject<void>();
  private printingsCache = new Map<string, PrintingDto[]>();
  private suggestionsCache = new Map<string, DeckSuggestionsDto>();

  constructor(
    private deckApi: DeckApiService,
    private gameApi: GameApiService,
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
   * What to search the pool for. Defaults to the focus tags so the list opens on the
   * theme the player asked for, and is theirs to overwrite from the modal's search box.
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
    // Keep scores across opens, drop them when the commander or the focus changed.
    const key = this.currentScoreKey();
    if (this.scoredKey !== key) {
      this.moreScores.clear();
      this.scoredKey = key;
    }

    this.moreCategory = cat;
    this.moreQuery = this.suggestionTags.join(' ');
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
    this.loadMore();
  }

  closeMore(): void {
    this.moreCategory = null;
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

  addCandidate(c: CandidateCardDto): void {
    if (!c.scryfallId) return;
    this.cardAdd.emit({ oracleId: c.card.oracleId, scryfallId: c.scryfallId });
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
    this.cdr.markForCheck();

    const deckCardNames = (this.deck.cards ?? [])
      .filter((c) => c.cardDetails?.oracleId !== this.commanderCard?.oracleId)
      .map((c) => c.cardDetails?.name)
      .filter((n): n is string => !!n);

    this.deckApi
      .getSuggestions({
        commanderOracleId: this.commanderCard.oracleId,
        commanderName: this.commanderCard.name,
        commanderText: this.commanderCard.oracleText,
        deckCardNames,
        deckTags: this.deck.tags ?? [],
        suggestionTags: this.suggestionTags,
      })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.error = 'Failed to generate suggestions. Try again.';
          this.loading = false;
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.suggestionsCache.set(key, result);
          this.suggestions = result;
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  openDetail(s: SuggestedCardDto, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedSuggestion = s;
    this.modalFlipped = false;

    const oracleId = s.card?.oracleId;
    if (!oracleId) {
      this.modalPrintings = [];
      this.modalViewScryfallId = s.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    const cached = this.printingsCache.get(oracleId);
    if (cached) {
      this.modalPrintings = cached;
      this.modalViewScryfallId = s.scryfallId ?? cached[0]?.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    this.modalPrintings = [];
    this.modalViewScryfallId = s.scryfallId ?? null;
    this.cdr.markForCheck();

    this.deckApi
      .getPrintings(oracleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((printings) => {
        this.printingsCache.set(oracleId, printings);
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
    this.cdr.markForCheck();
  }

  isInDeck(s: SuggestedCardDto): boolean {
    if (!s.card?.oracleId) return false;
    return (this.deck?.cards ?? []).some((c) => c.cardDetails?.oracleId === s.card!.oracleId);
  }

  addCard(s: SuggestedCardDto): void {
    if (!s.card || !s.scryfallId) return;
    this.cardAdd.emit({ oracleId: s.card.oracleId, scryfallId: s.scryfallId });
  }

  removeCard(s: SuggestedCardDto): void {
    if (!s.card?.oracleId) return;
    this.cardRemove.emit(s.card.oracleId);
  }

  addAndClose(s: SuggestedCardDto): void {
    this.addCard(s);
    this.closeDetail();
  }

  removeAndClose(s: SuggestedCardDto): void {
    this.removeCard(s);
    this.closeDetail();
  }

  close(): void {
    this.panelClose.emit();
  }

  cardsFor(key: SuggestionCategoryKey): SuggestedCardDto[] {
    return this.suggestions?.[key] ?? [];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
