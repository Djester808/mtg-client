import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface PlayerSummary {
  username: string;
  joinedAt: string;
  deckCount: number;
  commentCount: number;
}

@Component({
  selector: 'app-players-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './players-list.component.html',
  styleUrls: ['./players-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersListComponent implements OnInit {
  players: PlayerSummary[] = [];
  loading = true;
  searchQuery = '';
  sortBy: 'decks' | 'comments' | 'name' = 'decks';

  constructor(
    private http: HttpClient,
    readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.http.get<PlayerSummary[]>('/api/users').subscribe({
      next: (p) => {
        this.players = p;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get filteredPlayers(): PlayerSummary[] {
    const q = this.searchQuery.trim().toLowerCase();
    const list = q
      ? this.players.filter((p) => p.username.toLowerCase().includes(q))
      : [...this.players];
    if (this.sortBy === 'decks') list.sort((a, b) => b.deckCount - a.deckCount);
    else if (this.sortBy === 'comments') list.sort((a, b) => b.commentCount - a.commentCount);
    else list.sort((a, b) => a.username.localeCompare(b.username));
    return list;
  }

  setSortBy(s: 'decks' | 'comments' | 'name'): void {
    this.sortBy = s;
    this.cdr.markForCheck();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  avatarColor(username: string): string {
    const colors = ['#7b5ea7', '#4a7c59', '#6b8cae', '#a05c45', '#5a8a6a', '#8a6b3a'];
    let hash = 0;
    for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xfffffff;
    return colors[hash % colors.length];
  }
}
