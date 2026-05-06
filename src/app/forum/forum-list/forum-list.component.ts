import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState } from '../../store';
import { ForumActions } from '../../store/forum/forum.actions';
import { selectForumPosts, selectForumLoading } from '../../store/forum/forum.selectors';
import { selectIsLoggedIn } from '../../store/auth/auth.selectors';
import { ForumPostSummary } from '../../models/forum.models';

@Component({
  selector: 'app-forum-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './forum-list.component.html',
  styleUrls: ['./forum-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumListComponent implements OnInit {
  posts$: Observable<ForumPostSummary[]>;
  loading$: Observable<boolean>;
  isLoggedIn$: Observable<boolean>;

  constructor(private store: Store<AppState>) {
    this.posts$ = this.store.select(selectForumPosts);
    this.loading$ = this.store.select(selectForumLoading);
    this.isLoggedIn$ = this.store.select(selectIsLoggedIn);
  }

  ngOnInit(): void {
    this.store.dispatch(ForumActions.loadPosts());
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

  colorClass(c: string): string {
    return ({
      W: 'pip-w', U: 'pip-u', B: 'pip-b', R: 'pip-r', G: 'pip-g', C: 'pip-c',
    } as Record<string, string>)[c] ?? 'pip-c';
  }

  formatLabel(format: string | null): string {
    if (!format) return '';
    return format.charAt(0).toUpperCase() + format.slice(1);
  }
}
