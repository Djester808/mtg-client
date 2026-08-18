import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { UserAvatarComponent } from '../../components/user-avatar/user-avatar.component';
import { ProfileApiService } from '../../services/profile-api.service';
import { UserComment, UserProfile } from '../../models/profile.models';
import { timeAgo as relativeTime } from '../../utils/time';
import { describeHttpError } from '../../utils/http-error.utils';

type Tab = 'decks' | 'comments';

/** Matches the server's embedded first page, so "load more" starts cleanly at page 2. */
const COMMENT_PAGE_SIZE = 10;

/**
 * Someone's public profile: what they wrote about themselves, and what their decks,
 * collections and comments say about them.
 *
 * Everything here is public by construction — the payload this binds to has no private
 * field to leak. Collection *value* is on the owner-only endpoint and is rendered by the
 * account page instead.
 */
@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, OracleSymbolsPipe, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit {
  profile: UserProfile | null = null;
  loading = true;
  error: string | null = null;
  activeTab: Tab = 'decks';

  /** Grows as pages are pulled in; seeded from the profile payload's embedded first page. */
  comments: UserComment[] = [];
  commentsTotal = 0;
  commentsLoading = false;
  private commentPage = 1;

  constructor(
    private route: ActivatedRoute,
    private api: ProfileApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const username = this.route.snapshot.paramMap.get('username') ?? '';

    this.api.getProfile(username).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.comments = profile.recentComments;
        this.commentsTotal = profile.commentCount;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = describeHttpError(err, 'That profile could not be loaded.');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get name(): string {
    return this.profile?.displayName?.trim() || this.profile?.username || '';
  }

  /** True while there is more history than has been fetched. */
  get hasMoreComments(): boolean {
    return this.comments.length < this.commentsTotal;
  }

  setTab(tab: Tab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  loadMoreComments(): void {
    if (!this.profile || this.commentsLoading || !this.hasMoreComments) return;

    this.commentsLoading = true;
    this.cdr.markForCheck();

    this.api.getComments(this.profile.username, this.commentPage + 1, COMMENT_PAGE_SIZE).subscribe({
      next: (page) => {
        // Deduped by id rather than trusting the page boundary: the embedded first page
        // is the server's choice of size, and if it ever stops matching COMMENT_PAGE_SIZE
        // the overlap would otherwise render the same comment twice.
        const seen = new Set(this.comments.map((c) => c.commentId));
        this.comments = [...this.comments, ...page.items.filter((c) => !seen.has(c.commentId))];
        this.commentsTotal = page.total;
        this.commentPage = page.page;
        this.commentsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.commentsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Delegates to the shared helper; see `utils/time.ts`. */
  timeAgo(iso: string): string {
    return relativeTime(iso);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  formatCount(value: number): string {
    return value.toLocaleString('en-US');
  }

  manaClass(color: string): string {
    return `ms-${color.toLowerCase()}`;
  }

  /** Share of the colour bar this colour takes, as a percentage. */
  colorShare(deckCount: number): number {
    const total = this.profile?.stats.colorSpread.reduce((sum, c) => sum + c.deckCount, 0) ?? 0;
    return total === 0 ? 0 : Math.round((deckCount / total) * 100);
  }
}
