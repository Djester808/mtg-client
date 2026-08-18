import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SearchInputComponent } from '../../components/search-input/search-input.component';
import { UserAvatarComponent } from '../../components/user-avatar/user-avatar.component';
import { ProfileApiService } from '../../services/profile-api.service';
import { PlayerSummary } from '../../models/profile.models';

type SortKey = 'decks' | 'comments' | 'name';

@Component({
  selector: 'app-players-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SearchInputComponent, UserAvatarComponent],
  templateUrl: './players-list.component.html',
  styleUrls: ['./players-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersListComponent implements OnInit {
  players: PlayerSummary[] = [];
  loading = true;
  searchQuery = '';
  sortBy: SortKey = 'decks';

  /** Memo for `filteredPlayers`, which a template binds and change detection re-runs constantly. */
  private memo: {
    players: PlayerSummary[];
    query: string;
    sort: SortKey;
    result: PlayerSummary[];
  } | null = null;

  constructor(
    private api: ProfileApiService,
    readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getPlayers().subscribe({
      next: (players) => {
        this.players = players;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Filtered and sorted, memoized on the inputs that decide it.
   *
   * A template-bound getter runs on every change-detection pass; this one used to filter,
   * copy and sort the whole list each time, which is exactly what the repo's standard
   * calls out.
   */
  get filteredPlayers(): PlayerSummary[] {
    const query = this.searchQuery.trim().toLowerCase();

    if (
      this.memo &&
      this.memo.players === this.players &&
      this.memo.query === query &&
      this.memo.sort === this.sortBy
    ) {
      return this.memo.result;
    }

    // Display name and tagline are searchable too: someone who set a display name is far
    // more findable by it than by the handle they registered with.
    const matches = query
      ? this.players.filter((p) =>
          [p.username, p.displayName, p.tagline].some((field) =>
            field?.toLowerCase().includes(query),
          ),
        )
      : [...this.players];

    if (this.sortBy === 'decks') matches.sort((a, b) => b.deckCount - a.deckCount);
    else if (this.sortBy === 'comments') matches.sort((a, b) => b.commentCount - a.commentCount);
    else matches.sort((a, b) => a.username.localeCompare(b.username));

    this.memo = { players: this.players, query, sort: this.sortBy, result: matches };
    return matches;
  }

  setSortBy(sort: SortKey): void {
    this.sortBy = sort;
    this.cdr.markForCheck();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
}
