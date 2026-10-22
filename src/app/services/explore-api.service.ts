import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DeckDetailDto } from './deck-api.service';
import { CardDto } from '../models/game.models';

export interface ExploreEntry {
  kind?: string;
  rank?: number | null;
  name: string;
  card: CardDto | null;
  synergy: number | null;
  decks: number | null;
  potential: number | null;
  inclusion: number | null;
  trend: number | null;
  quantity: number;
}
export interface ExploreSection {
  tag: string;
  title: string;
  cards: ExploreEntry[];
}
export interface ExplorePage {
  charts: { title: string; points: { label: string; value: number }[] }[];
  hasPage: boolean;
  source: string;
  fetchedAt: string;
  kind: string;
  subject: CardDto;
  variant: string;
  deckCount: number | null;
  potentialDecks: number | null;
  rank: number | null;
  salt: number | null;
  sections: ExploreSection[];
  variants: { key: string; label: string; decks: number | null }[];
  similar: ExploreEntry[];
  commanders: ExploreEntry[];
}
@Injectable({ providedIn: 'root' })
export class ExploreApiService {
  search(q: string, kind: string) {
    return this.http.get<ExploreEntry[]>('/api/explore/search', { params: { q, kind } });
  }
  private readonly http = inject(HttpClient);
  copyAverage(id: string, variant: string) {
    return this.http.post<DeckDetailDto>('/api/explore/commanders/' + id + '/average/copy', {
      variant,
    });
  }
  directoryPage(params: Record<string, string>) {
    return this.http.get<{
      fetchedAt: string;
      commanders: ExploreEntry[];
      total: number;
      page: number;
      pageSize: number;
      window: string;
    }>('/api/explore/directory', { params });
  }
  directory() {
    return this.http.get<{ fetchedAt: string; commanders: ExploreEntry[] }>(
      '/api/explore/commanders',
    );
  }
  page(id: string, kind: string, variant = '') {
    const path =
      kind === 'card' ? `cards/${id}` : `commanders/${id}${kind === 'average' ? '/average' : ''}`;
    return this.http.get<ExplorePage>(`/api/explore/${path}`, { params: { variant } });
  }
}
