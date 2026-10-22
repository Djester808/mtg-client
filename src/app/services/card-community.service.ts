import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { ExploreApiService, ExploreEntry, ExplorePage } from './explore-api.service';
export interface CardCommunity {
  global: ExplorePage | null;
  context: ExploreEntry | null;
  contextRequested: boolean;
  commanders: ExploreEntry[];
  failed: boolean;
}
@Injectable({ providedIn: 'root' })
export class CardCommunityService {
  private readonly api = inject(ExploreApiService);
  private readonly cache = new Map<
    string,
    { expires: number; value: Observable<ExplorePage | null> }
  >();
  private page(id: string, kind: string): Observable<ExplorePage | null> {
    const key = kind + '|' + id,
      cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const request: Observable<ExplorePage | null> = this.api.page(id, kind).pipe(
      catchError(() => {
        if (this.cache.get(key)?.value === request) this.cache.delete(key);
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(key, { expires: Date.now() + 300000, value: request });
    if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value!);
    return request;
  }
  invalidate(card: string, commander: string | null): void {
    this.cache.delete('card|' + card);
    if (commander) this.cache.delete('commander|' + commander);
  }
  load(card: string, commander: string | null): Observable<CardCommunity> {
    return forkJoin({
      global: this.page(card, 'card'),
      leader: commander ? this.page(commander, 'commander') : of(null),
    }).pipe(
      map(({ global, leader }) => {
        const commanders = new Map<string, ExploreEntry>();
        for (const entry of [
          ...(global?.commanders ?? []),
          ...(global?.sections.flatMap((s) => s.cards) ?? []),
        ])
          if (entry.kind === 'commander' && entry.card) commanders.set(entry.card.oracleId, entry);
        const context =
          leader?.sections.flatMap((s) => s.cards).find((entry) => entry.card?.oracleId === card) ??
          null;
        return {
          global,
          context,
          contextRequested: !!commander,
          commanders: [...commanders.values()]
            .sort((a, b) => (b.decks ?? -1) - (a.decks ?? -1))
            .slice(0, 8),
          failed: !global || (!!commander && !leader),
        };
      }),
    );
  }
}
