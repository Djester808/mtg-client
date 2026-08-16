import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, forkJoin, of, switchMap, takeUntil } from 'rxjs';
import { AppState } from '../../store';
import { ForumActions } from '../../store/forum/forum.actions';
import {
  selectActiveForumPost,
  selectForumPostLoading,
  selectForumError,
} from '../../store/forum/forum.selectors';
import { selectIsLoggedIn, selectUsername } from '../../store/auth/auth.selectors';
import { ForumPostDetail, ForumComment } from '../../models/forum.models';
import { CollectionCardDto, CardType, PrintingDto } from '../../models/game.models';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import {
  StatsChartComponent,
  ChartEntry,
} from '../../components/stats-chart/stats-chart.component';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { DeckApiService } from '../../services/deck-api.service';
import { PrintingsService } from '../../services/printings.service';
import { PreferencesApiService } from '../../services/preferences-api.service';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { describeHttpError } from '../../utils/http-error.utils';
import { timeAgo as relativeTime } from '../../utils/time';
import { CardGridFiltersComponent } from '../../components/card-grid-filters/card-grid-filters.component';
import {
  SelectMenuComponent,
  SelectMenuOption,
} from '../../components/select-menu/select-menu.component';
import { CardFilters } from '../../models/card-filters';
import {
  AvailableFacets,
  CARD_GROUP_OPTIONS,
  CardGridFilterService,
  CardGroupMode,
  CardSection,
} from '../../services/card-grid-filter.service';

@Component({
  selector: 'app-forum-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ManaCostComponent,
    StatsChartComponent,
    CardModalComponent,
    OracleSymbolsPipe,
    CardGridFiltersComponent,
    SelectMenuComponent,
  ],
  templateUrl: './forum-detail.component.html',
  styleUrls: ['./forum-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumDetailComponent implements OnInit, OnDestroy {
  post$: Observable<ForumPostDetail | null>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;
  isLoggedIn$: Observable<boolean>;
  username$: Observable<string | null>;

  currentUsername: string | null = null;
  commentDraft = '';
  editingCommentId: string | null = null;
  editDraft = '';
  activeTab: 'main' | 'side' | 'maybe' = 'main';
  viewMode: 'list' | 'visual' | 'text' = 'list';
  /** Widened from type/cmc/name to the full set now that grouping is the shared one. */
  sortMode: CardGroupMode = 'type';
  zoomLevel = 1.0;
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  copyState: 'idle' | 'copying' | 'done' | 'error' = 'idle';
  copyError: string | null = null;

  readonly viewOptions = [
    { value: 'list' as const, icon: 'bi-list-ul', title: 'List view' },
    { value: 'visual' as const, icon: 'bi-grid-3x3', title: 'Visual view' },
    { value: 'text' as const, icon: 'bi-text-left', title: 'Text only' },
  ];

  /** The same Group By list the other two grids offer. */
  readonly sortOptions = CARD_GROUP_OPTIONS;

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private deckApi: DeckApiService,
    private printings: PrintingsService,
    private prefs: PreferencesApiService,
    private gridFilter: CardGridFilterService,
  ) {
    this.post$ = this.store.select(selectActiveForumPost);
    this.loading$ = this.store.select(selectForumPostLoading);
    this.error$ = this.store.select(selectForumError);
    this.isLoggedIn$ = this.store.select(selectIsLoggedIn);
    this.username$ = this.store.select(selectUsername);
  }

  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printings.cached(this.selectedCard.oracleId) ?? []) : [];
  }

  /** Loads printings through the shared cache; defaults the modal's viewed printing. */
  private loadPrintings(oracleId: string): void {
    this.printings
      .get(oracleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((printings) => {
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
    this.prefs
      .load()
      .pipe(takeUntil(this.destroy$))
      .subscribe((p) => {
        if (p.forumLayout) this.viewMode = p.forumLayout;
        if (p.forumSort) this.sortMode = p.forumSort as CardGroupMode;
        this.cdr.markForCheck();
      });

    const id = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(ForumActions.loadPost({ id }));
    this.username$.pipe(takeUntil(this.destroy$)).subscribe((u) => {
      this.currentUsername = u;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  // ---- The shared filter bar --------------------------------------
  //
  // This page used to hand-roll its own grouping — a private copy of the service's cmc /
  // name / type cases, down to the same type order and the same quantity+foil totals — and
  // offered no filtering at all. It now runs the same CardGridFilterService the collection
  // and deck grids do, so a published deck can be searched and filtered like any other.

  readonly filters = new CardFilters();

  /** The board's cards, memoized so `sections()` downstream keeps its own memo. */
  private boardMemo: {
    cards: CollectionCardDto[];
    board: string;
    value: CollectionCardDto[];
  } | null = null;

  private boardCards(post: ForumPostDetail): CollectionCardDto[] {
    const m = this.boardMemo;
    if (m && m.cards === post.cards && m.board === this.activeTab) return m.value;
    const value = post.cards.filter((c) => (c.board ?? 'main') === this.activeTab);
    this.boardMemo = { cards: post.cards, board: this.activeTab, value };
    return value;
  }

  private filteredMemo: {
    cards: CollectionCardDto[];
    key: string;
    value: CollectionCardDto[];
  } | null = null;

  filteredCards(post: ForumPostDetail): CollectionCardDto[] {
    const cards = this.boardCards(post);
    const key = this.gridFilter.stateKey(this.filters.toState());
    const m = this.filteredMemo;
    if (m && m.cards === cards && m.key === key) return m.value;
    const value = this.gridFilter.apply(cards, this.filters.toState());
    this.filteredMemo = { cards, key, value };
    return value;
  }

  getGroups(post: ForumPostDetail): CardSection[] {
    return this.gridFilter.sections(this.filteredCards(post), this.sortMode);
  }

  /** Sets represented in this deck, for the bar's Set picker. */
  setFilterOptions(post: ForumPostDetail): SelectMenuOption[] {
    return this.gridFilter.setOptions(post.cards);
  }

  /** Whole deck, not the filtered board: a filter must not remove the chip that undoes it. */
  availableFacets(post: ForumPostDetail): AvailableFacets {
    return this.gridFilter.facetsPresent(post.cards);
  }

  filterSuggestions(post: ForumPostDetail): string[] {
    const q = this.filters.query.trim().toLowerCase();
    if (q.length < 2) return [];
    const names = new Set<string>();
    for (const c of post.cards) {
      const n = c.cardDetails?.name;
      if (n && n.toLowerCase().includes(q)) names.add(n);
    }
    return [...names].sort().slice(0, 8);
  }

  onFiltersChanged(): void {
    this.cdr.markForCheck();
  }

  getCurveData(post: ForumPostDetail): ChartEntry[] {
    const mainCards = post.cards.filter(
      (c) => (c.board ?? 'main') === 'main' && !c.cardDetails?.cardTypes?.includes(CardType.Land),
    );
    const counts = new Map<number, number>();
    for (const c of mainCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      counts.set(cmc, (counts.get(cmc) ?? 0) + this.cardCount(c));
    }
    return [1, 2, 3, 4, 5, 6, 7].map((cmc) => ({
      label: cmc === 7 ? '7+' : String(cmc),
      value: counts.get(cmc) ?? 0,
    }));
  }

  getTypeData(post: ForumPostDetail): ChartEntry[] {
    const main = post.cards.filter((c) => (c.board ?? 'main') === 'main');
    const count = (type: CardType) =>
      main
        .filter((c) => c.cardDetails?.cardTypes?.includes(type))
        .reduce((s, c) => s + this.cardCount(c), 0);
    return [
      { label: 'Creatures', value: count(CardType.Creature), color: '#22c55e' },
      { label: 'Instants', value: count(CardType.Instant), color: '#3b82f6' },
      { label: 'Sorceries', value: count(CardType.Sorcery), color: '#8b5cf6' },
      { label: 'Enchantments', value: count(CardType.Enchantment), color: '#ec4899' },
      { label: 'Artifacts', value: count(CardType.Artifact), color: '#9ca3af' },
      { label: 'Planeswalkers', value: count(CardType.Planeswalker), color: '#f59e0b' },
      { label: 'Lands', value: count(CardType.Land), color: '#84502a' },
    ].filter((e) => e.value > 0);
  }

  totalCards(post: ForumPostDetail, board = 'main'): number {
    return post.cards
      .filter((c) => (c.board ?? 'main') === board)
      .reduce((s, c) => s + this.cardCount(c), 0);
  }

  setViewMode(mode: 'list' | 'visual' | 'text'): void {
    this.viewMode = mode;
    this.prefs.save({ forumLayout: mode, forumSort: this.sortMode });
    this.cdr.markForCheck();
  }

  setSortMode(mode: CardGroupMode): void {
    this.sortMode = mode;
    this.prefs.save({ forumLayout: this.viewMode, forumSort: mode });
    this.cdr.markForCheck();
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(2.0, +(this.zoomLevel + 0.25).toFixed(2));
    this.cdr.markForCheck();
  }
  zoomOut(): void {
    this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2));
    this.cdr.markForCheck();
  }
  get zoomLabel(): string {
    return Math.round(this.zoomLevel * 100) + '%';
  }

  copyDeck(post: ForumPostDetail): void {
    if (this.copyState === 'copying') return;
    this.copyState = 'copying';
    this.copyError = null;
    this.cdr.markForCheck();

    this.deckApi
      .createDeck({
        name: `${post.deckName} (Copy)`,
        format: post.deckFormat,
        commanderOracleId: post.commanderOracleId,
        coverUri: post.deckCoverUri,
      })
      .pipe(
        switchMap((deck) => {
          if (!post.cards.length) return of(deck.id);
          const adds = post.cards.map((c) =>
            this.deckApi.addCard(deck.id, {
              oracleId: c.oracleId,
              scryfallId: c.scryfallId,
              quantity: c.quantity,
              quantityFoil: c.quantityFoil,
              board: c.board ?? 'main',
              notes: c.notes,
            }),
          );
          return forkJoin(adds).pipe(switchMap(() => of(deck.id)));
        }),
      )
      .subscribe({
        next: (deckId) => {
          this.copyState = 'done';
          this.cdr.markForCheck();
          setTimeout(() => this.router.navigate(['/deck', deckId]), 800);
        },
        error: (err) => {
          this.copyState = 'error';
          this.copyError = describeHttpError(err, 'Failed to copy deck.');
          this.cdr.markForCheck();
        },
      });
  }

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    const cached = this.printings.cached(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.loadPrintings(card.oracleId);
    this.cdr.markForCheck();
  }

  openCommanderCard(post: ForumPostDetail): void {
    if (!post.commanderName) return;
    this.deckApi.getCardByName(post.commanderName).subscribe((card) => {
      if (!card) return;
      const oracleId = post.commanderOracleId ?? card.oracleId;
      const collCard: CollectionCardDto = {
        id: '',
        oracleId,
        scryfallId: null,
        quantity: 1,
        quantityFoil: 0,
        notes: null,
        board: 'main',
        addedAt: '',
        cardDetails: card,
      };
      this.selectedCard = collCard;
      const cached = this.printings.cached(oracleId);
      this.modalViewScryfallId = cached?.[0]?.scryfallId ?? null;
      if (!cached) this.loadPrintings(oracleId);
      this.cdr.markForCheck();
    });
  }

  closeCard(): void {
    this.selectedCard = null;
    this.modalViewScryfallId = null;
    this.cdr.markForCheck();
  }

  cardImage(card: CollectionCardDto): string | null {
    return card.cardDetails?.imageUriNormal ?? null;
  }

  colorClass(c: string): string {
    return (
      (
        {
          W: 'pip-w',
          U: 'pip-u',
          B: 'pip-b',
          R: 'pip-r',
          G: 'pip-g',
          C: 'pip-c',
        } as Record<string, string>
      )[c] ?? 'pip-c'
    );
  }

  formatLabel(format: string | null | undefined): string {
    if (!format) return '';
    return format.charAt(0).toUpperCase() + format.slice(1);
  }

  /** Delegates to the shared helper; see `utils/time.ts`. */
  timeAgo(dateStr: string): string {
    return relativeTime(dateStr);
  }

  submitComment(postId: string): void {
    const content = this.commentDraft.trim();
    if (!content) return;
    this.store.dispatch(ForumActions.addComment({ postId, content }));
    this.commentDraft = '';
  }

  startEdit(comment: ForumComment): void {
    this.editingCommentId = comment.id;
    this.editDraft = comment.content;
  }

  cancelEdit(): void {
    this.editingCommentId = null;
    this.editDraft = '';
  }

  submitEdit(postId: string, commentId: string): void {
    const content = this.editDraft.trim();
    if (!content) return;
    this.store.dispatch(ForumActions.updateComment({ postId, commentId, content }));
    this.cancelEdit();
  }

  deleteComment(postId: string, commentId: string): void {
    this.store.dispatch(ForumActions.deleteComment({ postId, commentId }));
  }

  deletePost(postId: string): void {
    if (!confirm('Delete this forum post? This cannot be undone.')) return;
    this.store.dispatch(ForumActions.deletePost({ id: postId }));
  }
}
