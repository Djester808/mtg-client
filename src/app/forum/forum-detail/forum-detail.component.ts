import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, takeUntil } from 'rxjs';
import { AppState } from '../../store';
import { ForumActions } from '../../store/forum/forum.actions';
import {
  selectActiveForumPost, selectForumPostLoading, selectForumError,
} from '../../store/forum/forum.selectors';
import { selectIsLoggedIn, selectUsername } from '../../store/auth/auth.selectors';
import { ForumPostDetail, ForumComment } from '../../models/forum.models';
import { CollectionCardDto, CardType } from '../../models/game.models';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { StatsChartComponent, ChartEntry } from '../../components/stats-chart/stats-chart.component';

interface CardGroup {
  label: string;
  cards: CollectionCardDto[];
  total: number;
}

@Component({
  selector: 'app-forum-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ManaCostComponent, StatsChartComponent],
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

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.post$ = this.store.select(selectActiveForumPost);
    this.loading$ = this.store.select(selectForumPostLoading);
    this.error$ = this.store.select(selectForumError);
    this.isLoggedIn$ = this.store.select(selectIsLoggedIn);
    this.username$ = this.store.select(selectUsername);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.store.dispatch(ForumActions.loadPost({ id }));
    this.username$.pipe(takeUntil(this.destroy$)).subscribe(u => {
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

  getGroups(post: ForumPostDetail): CardGroup[] {
    const cards = post.cards.filter(c => (c.board ?? 'main') === this.activeTab);
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
