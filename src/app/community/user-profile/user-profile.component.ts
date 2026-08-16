import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { ForumPostSummary } from '../../models/forum.models';
import { timeAgo as relativeTime } from '../../utils/time';

interface UserCommentDto {
  commentId: string;
  forumPostId: string;
  deckName: string;
  content: string;
  createdAt: string;
}

interface UserProfileDto {
  username: string;
  joinedAt: string;
  deckCount: number;
  commentCount: number;
  publishedDecks: ForumPostSummary[];
  recentComments: UserCommentDto[];
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, OracleSymbolsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit {
  profile: UserProfileDto | null = null;
  loading = true;
  error: string | null = null;
  activeTab: 'decks' | 'comments' = 'decks';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const username = this.route.snapshot.paramMap.get('username') ?? '';
    this.http.get<UserProfileDto>(`/api/users/${username}`).subscribe({
      next: (p) => {
        this.profile = p;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'User not found.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setTab(t: 'decks' | 'comments'): void {
    this.activeTab = t;
    this.cdr.markForCheck();
  }

  /** Delegates to the shared helper; see `utils/time.ts`. */
  timeAgo(iso: string): string {
    return relativeTime(iso);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  manaClass(c: string): string {
    return `ms-${c.toLowerCase()}`;
  }
}
