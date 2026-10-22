import { Injectable, signal } from '@angular/core';
import { ExploreEntry } from './explore-api.service';
@Injectable({ providedIn: 'root' })
export class ExploreHomeService {
  readonly recents = signal<{ q: string; kind: string }[]>(this.read());
  private read(): { q: string; kind: string }[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('compleat.explore.recent') ?? '[]');
      return Array.isArray(value)
        ? value
            .filter(
              (v) =>
                typeof v?.q === 'string' &&
                v.q.length <= 200 &&
                ['card', 'commander'].includes(v.kind),
            )
            .slice(0, 8)
        : [];
    } catch {
      return [];
    }
  }
  remember(q: string, kind: string): void {
    q = q.trim().slice(0, 200);
    if (!q) return;
    const rows = [
      { q, kind },
      ...this.recents().filter((r) => r.q.toLowerCase() !== q.toLowerCase() || r.kind !== kind),
    ].slice(0, 8);
    this.recents.set(rows);
    try {
      localStorage.setItem('compleat.explore.recent', JSON.stringify(rows));
    } catch {
      /* Search remains usable without storage. */
    }
  }
  clear(): void {
    this.recents.set([]);
    try {
      localStorage.removeItem('compleat.explore.recent');
    } catch {
      /* Storage may be blocked. */
    }
  }
  pick(entries: ExploreEntry[], now = new Date()): ExploreEntry | null {
    const popular = entries
      .filter((e) => e.card && e.decks != null)
      .sort((a, b) => (b.decks ?? 0) - (a.decks ?? 0))
      .slice(0, 24);
    if (popular.length < 2) return null;
    const day = Math.floor(
      (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        Date.UTC(now.getUTCFullYear(), 0, 0)) /
        86400000,
    );
    return popular[(day % 24) % popular.length];
  }
}
