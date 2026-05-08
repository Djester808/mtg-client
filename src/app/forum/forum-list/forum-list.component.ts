import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState } from '../../store';
import { ForumActions } from '../../store/forum/forum.actions';
import { selectForumPosts, selectForumLoading } from '../../store/forum/forum.selectors';
import { selectIsLoggedIn } from '../../store/auth/auth.selectors';
import { ForumPostSummary } from '../../models/forum.models';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

type SortOption = 'newest' | 'comments' | 'cards';

@Component({
  selector: 'app-forum-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, OracleSymbolsPipe],
  templateUrl: './forum-list.component.html',
  styleUrls: ['./forum-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumListComponent implements OnInit {
  posts$: Observable<ForumPostSummary[]>;
  loading$: Observable<boolean>;
  isLoggedIn$: Observable<boolean>;

  searchQuery = '';
  selectedColors = new Set<string>();
  selectedFormats = new Set<string>();
  sortBy: SortOption = 'newest';

  readonly colorOptions = ['W', 'U', 'B', 'R', 'G', 'C'];
  readonly formatOptions = [
    'Commander',
    'Standard',
    'Pioneer',
    'Modern',
    'Legacy',
    'Pauper',
    'Vintage',
  ];
  readonly sortOptions: { value: SortOption; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'comments', label: 'Most Comments' },
    { value: 'cards', label: 'Most Cards' },
  ];

  constructor(
    private store: Store<AppState>,
    readonly cdr: ChangeDetectorRef,
  ) {
    this.posts$ = this.store.select(selectForumPosts);
    this.loading$ = this.store.select(selectForumLoading);
    this.isLoggedIn$ = this.store.select(selectIsLoggedIn);
  }

  ngOnInit(): void {
    this.store.dispatch(ForumActions.loadPosts());
  }

  get hasActiveFilters(): boolean {
    return (
      !!this.searchQuery.trim() || this.selectedColors.size > 0 || this.selectedFormats.size > 0
    );
  }

  toggleColor(c: string): void {
    this.selectedColors.has(c) ? this.selectedColors.delete(c) : this.selectedColors.add(c);
    this.cdr.markForCheck();
  }

  toggleFormat(f: string): void {
    this.selectedFormats.has(f) ? this.selectedFormats.delete(f) : this.selectedFormats.add(f);
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedColors.clear();
    this.selectedFormats.clear();
    this.cdr.markForCheck();
  }

  setSortBy(s: SortOption): void {
    this.sortBy = s;
    this.cdr.markForCheck();
  }

  filteredPosts(posts: ForumPostSummary[]): ForumPostSummary[] {
    let result = posts;

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.deckName.toLowerCase().includes(q) || p.authorUsername.toLowerCase().includes(q),
      );
    }

    if (this.selectedColors.size > 0) {
      result = result.filter((p) =>
        [...this.selectedColors].some((c) => p.colorIdentity.includes(c)),
      );
    }

    if (this.selectedFormats.size > 0) {
      result = result.filter(
        (p) =>
          p.deckFormat &&
          this.selectedFormats.has(p.deckFormat.charAt(0).toUpperCase() + p.deckFormat.slice(1)),
      );
    }

    return [...result].sort((a, b) => {
      if (this.sortBy === 'comments') return b.commentCount - a.commentCount;
      if (this.sortBy === 'cards') return b.cardCount - a.cardCount;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }

  manaClass(c: string): string {
    return (
      (
        { W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c' } as Record<
          string,
          string
        >
      )[c] ?? 'ms-c'
    );
  }

  formatLabel(format: string | null): string {
    if (!format) return '';
    return format.charAt(0).toUpperCase() + format.slice(1);
  }

  timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const secs = Math.floor((now - then) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }
}
