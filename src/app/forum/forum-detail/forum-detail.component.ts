import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, forkJoin, of, switchMap, takeUntil, mergeMap, map, catchError } from 'rxjs';
import { AppState } from '../../store';
import { ForumActions } from '../../store/forum/forum.actions';
import {
  selectActiveForumPost, selectForumPostLoading, selectForumError,
} from '../../store/forum/forum.selectors';
import { selectIsLoggedIn, selectUsername } from '../../store/auth/auth.selectors';
import { ForumPostDetail, ForumComment } from '../../models/forum.models';
import { CollectionCardDto, CardType, PrintingDto } from '../../models/game.models';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { StatsChartComponent, ChartEntry } from '../../components/stats-chart/stats-chart.component';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { DeckApiService } from '../../services/deck-api.service';
import { PreferencesApiService } from '../../services/preferences-api.service';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

interface CardGroup {
  label: string;
  cards: CollectionCardDto[];
  total: number;
}

@Component({
  selector: 'app-forum-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ManaCostComponent, StatsChartComponent, CardModalComponent, OracleSymbolsPipe],
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
  sortMode: 'type' | 'cmc' | 'name' = 'type';
  zoomLevel = 1.0;
  selectedCard: CollectionCardDto | null = null;
  modalViewScryfallId: string | null = null;
  printingsCache = new Map<string, PrintingDto[]>();
  private printingsLoad$ = new Subject<string>();
  copyState: 'idle' | 'copying' | 'done' | 'error' = 'idle';
  copyError: string | null = null;

  readonly viewOptions = [
    { value: 'list'   as const, icon: 'bi-list-ul',  title: 'List view'   },
    { value: 'visual' as const, icon: 'bi-grid-3x3', title: 'Visual view' },
    { value: 'text'   as const, icon: 'bi-text-left', title: 'Text only'  },
  ];

  readonly sortOptions: { value: 'type' | 'cmc' | 'name'; label: string }[] = [
    { value: 'type', label: 'Type' },
    { value: 'cmc',  label: 'CMC'  },
    { value: 'name', label: 'Name' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private deckApi: DeckApiService,
    private prefs: PreferencesApiService,
  ) {
    this.post$ = this.store.select(selectActiveForumPost);
    this.loading$ = this.store.select(selectForumPostLoading);
    this.error$ = this.store.select(selectForumError);
    this.isLoggedIn$ = this.store.select(selectIsLoggedIn);
    this.username$ = this.store.select(selectUsername);
  }


  get modalPrintings(): PrintingDto[] {
    return this.selectedCard ? (this.printingsCache.get(this.selectedCard.oracleId) ?? []) : [];
  }

  ngOnInit(): void {
    this.prefs.load().pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (p.forumLayout) this.viewMode = p.forumLayout;
      if (p.forumSort)   this.sortMode = p.forumSort;
      this.cdr.markForCheck();
    });

    const id = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(ForumActions.loadPost({ id }));
    this.username$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUsername = u;
      this.cdr.markForCheck();
    });

    this.printingsLoad$.pipe(
      mergeMap(oracleId => {
        if (this.printingsCache.has(oracleId))
          return of({ oracleId, printings: this.printingsCache.get(oracleId)! });
        return this.deckApi.getPrintings(oracleId).pipe(
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

  cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  getGroups(post: ForumPostDetail): CardGroup[] {
    const cards = post.cards.filter(c => (c.board ?? 'main') === this.activeTab);

    if (this.sortMode === 'cmc') {
      const buckets = new Map<number, CollectionCardDto[]>();
      for (const c of cards) {
        const cmc = c.cardDetails?.manaValue ?? 0;
        if (!buckets.has(cmc)) buckets.set(cmc, []);
        buckets.get(cmc)!.push(c);
      }
      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([cmc, group]) => {
          const sorted = [...group].sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
          return { label: `CMC ${cmc}`, cards: sorted, total: sorted.reduce((s, c) => s + this.cardCount(c), 0) };
        });
    }

    if (this.sortMode === 'name') {
      const sorted = [...cards].sort((a, b) => (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? ''));
      return [{ label: 'All Cards', cards: sorted, total: sorted.reduce((s, c) => s + this.cardCount(c), 0) }];
    }

    // Default: by type
    const typeOrder: [string, CardType][] = [
      ['Creatures', CardType.Creature],
      ['Planeswalkers', CardType.Planeswalker],
      ['Instants', CardType.Instant],
      ['Sorceries', CardType.Sorcery],
      ['Enchantments', CardType.Enchantment],
      ['Artifacts', CardType.Artifact],
      ['Lands', CardType.Land],
    ];
    const groups: CardGroup[] = [];
    const used = new Set<string>();

    for (const [label, type] of typeOrder) {
      const group = cards.filter(c =>
        !used.has(c.id) && c.cardDetails?.cardTypes?.includes(type)
      );
      if (group.length) {
        group.forEach(c => used.add(c.id));
        const sorted = [...group].sort((a, b) =>
          (a.cardDetails?.manaValue ?? 0) - (b.cardDetails?.manaValue ?? 0) ||
          (a.cardDetails?.name ?? '').localeCompare(b.cardDetails?.name ?? '')
        );
        groups.push({ label, cards: sorted, total: sorted.reduce((s, c) => s + this.cardCount(c), 0) });
      }
    }

    const rest = cards.filter(c => !used.has(c.id));
    if (rest.length) {
      groups.push({ label: 'Other', cards: rest, total: rest.reduce((s, c) => s + this.cardCount(c), 0) });
    }

    return groups;
  }

  getCurveData(post: ForumPostDetail): ChartEntry[] {
    const mainCards = post.cards.filter(c =>
      (c.board ?? 'main') === 'main' &&
      !c.cardDetails?.cardTypes?.includes(CardType.Land)
    );
    const counts = new Map<number, number>();
    for (const c of mainCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      counts.set(cmc, (counts.get(cmc) ?? 0) + this.cardCount(c));
    }
    return [1, 2, 3, 4, 5, 6, 7].map(cmc => ({
      label: cmc === 7 ? '7+' : String(cmc),
      value: counts.get(cmc) ?? 0,
    }));
  }

  getTypeData(post: ForumPostDetail): ChartEntry[] {
    const main = post.cards.filter(c => (c.board ?? 'main') === 'main');
    const count = (type: CardType) =>
      main.filter(c => c.cardDetails?.cardTypes?.includes(type)).reduce((s, c) => s + this.cardCount(c), 0);
    return [
      { label: 'Creatures', value: count(CardType.Creature), color: '#22c55e' },
      { label: 'Instants', value: count(CardType.Instant), color: '#3b82f6' },
      { label: 'Sorceries', value: count(CardType.Sorcery), color: '#8b5cf6' },
      { label: 'Enchantments', value: count(CardType.Enchantment), color: '#ec4899' },
      { label: 'Artifacts', value: count(CardType.Artifact), color: '#9ca3af' },
      { label: 'Planeswalkers', value: count(CardType.Planeswalker), color: '#f59e0b' },
      { label: 'Lands', value: count(CardType.Land), color: '#84502a' },
    ].filter(e => e.value > 0);
  }

  totalCards(post: ForumPostDetail, board = 'main'): number {
    return post.cards
      .filter(c => (c.board ?? 'main') === board)
      .reduce((s, c) => s + this.cardCount(c), 0);
  }

  setViewMode(mode: 'list' | 'visual' | 'text'): void {
    this.viewMode = mode;
    this.prefs.save({ forumLayout: mode, forumSort: this.sortMode });
    this.cdr.markForCheck();
  }

  setSortMode(mode: 'type' | 'cmc' | 'name'): void {
    this.sortMode = mode;
    this.prefs.save({ forumLayout: this.viewMode, forumSort: mode });
    this.cdr.markForCheck();
  }

  zoomIn():  void { this.zoomLevel = Math.min(2.0, +(this.zoomLevel + 0.25).toFixed(2)); this.cdr.markForCheck(); }
  zoomOut(): void { this.zoomLevel = Math.max(0.5, +(this.zoomLevel - 0.25).toFixed(2)); this.cdr.markForCheck(); }
  get zoomLabel(): string { return Math.round(this.zoomLevel * 100) + '%'; }

  copyDeck(post: ForumPostDetail): void {
    if (this.copyState === 'copying') return;
    this.copyState = 'copying';
    this.copyError = null;
    this.cdr.markForCheck();

    this.deckApi.createDeck({
      name: `${post.deckName} (Copy)`,
      format: post.deckFormat,
      commanderOracleId: post.commanderOracleId,
      coverUri: post.deckCoverUri,
    }).pipe(
      switchMap(deck => {
        if (!post.cards.length) return of(deck.id);
        const adds = post.cards.map(c =>
          this.deckApi.addCard(deck.id, {
            oracleId: c.oracleId,
            scryfallId: c.scryfallId,
            quantity: c.quantity,
            quantityFoil: c.quantityFoil,
            board: c.board ?? 'main',
            notes: c.notes,
          })
        );
        return forkJoin(adds).pipe(switchMap(() => of(deck.id)));
      }),
    ).subscribe({
      next: deckId => {
        this.copyState = 'done';
        this.cdr.markForCheck();
        setTimeout(() => this.router.navigate(['/deck', deckId]), 800);
      },
      error: err => {
        this.copyState = 'error';
        this.copyError = err?.error?.message ?? 'Failed to copy deck.';
        this.cdr.markForCheck();
      },
    });
  }

  openCard(card: CollectionCardDto): void {
    this.selectedCard = card;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalViewScryfallId = card.scryfallId ?? cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  openCommanderCard(post: ForumPostDetail): void {
    if (!post.commanderName) return;
    this.deckApi.getCardByName(post.commanderName).subscribe(card => {
      if (!card) return;
      const oracleId = post.commanderOracleId ?? card.oracleId;
      const collCard: CollectionCardDto = {
        id: '', oracleId, scryfallId: null,
        quantity: 1, quantityFoil: 0,
        notes: null, board: 'main', addedAt: '',
        cardDetails: card,
      };
      this.selectedCard = collCard;
      const cached = this.printingsCache.get(oracleId);
      this.modalViewScryfallId = cached?.[0]?.scryfallId ?? null;
      if (!cached) this.printingsLoad$.next(oracleId);
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
    return ({
      W: 'pip-w', U: 'pip-u', B: 'pip-b', R: 'pip-r', G: 'pip-g', C: 'pip-c',
    } as Record<string, string>)[c] ?? 'pip-c';
  }

  formatLabel(format: string | null | undefined): string {
    if (!format) return '';
    return format.charAt(0).toUpperCase() + format.slice(1);
  }

  timeAgo(dateStr: string): string {
    const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
