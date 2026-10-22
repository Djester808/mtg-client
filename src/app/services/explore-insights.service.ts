import { Injectable } from '@angular/core';
import { ExploreEntry, ExplorePage } from './explore-api.service';
export interface ExploreInsights {
  charts: {
    title: string;
    max: number;
    timeline: boolean;
    line: string;
    points: { label: string; value: number; width: number }[];
  }[];
  scatter: { entry: ExploreEntry; x: number; y: number }[];
}
@Injectable({ providedIn: 'root' })
export class ExploreInsightsService {
  private readonly cache = new WeakMap<ExplorePage, ExploreInsights>();
  model(page: ExplorePage): ExploreInsights {
    const cached = this.cache.get(page);
    if (cached) return cached;
    const charts = (page.charts ?? [])
      .filter((c) => c.points.length > 0)
      .map((c) => {
        const points = c.points.filter((p) => Number.isFinite(p.value));
        const max = Math.max(1, ...points.map((p) => p.value));
        return {
          ...c,
          max,
          timeline: /over time|by month/.test(c.title),
          line: points
            .map(
              (p, i) =>
                10 + (i / Math.max(1, points.length - 1)) * 280 + ',' + (95 - (p.value / max) * 85),
            )
            .join(' '),
          points: points.map((p) => ({ ...p, width: Math.max(0, (p.value / max) * 100) })),
        };
      });
    const seen = new Set<string>();
    const entries = page.sections
      .flatMap((s) => s.cards)
      .filter((e) => {
        const id = e.card?.oracleId ?? e.name;
        if (seen.has(id)) return false;
        seen.add(id);
        return (
          e.inclusion != null &&
          e.synergy != null &&
          Number.isFinite(e.inclusion) &&
          Number.isFinite(e.synergy)
        );
      })
      .sort((a, b) => b.inclusion! - a.inclusion!)
      .slice(0, 60);
    const xMax = Math.max(0.01, ...entries.map((e) => Math.abs(e.synergy!))),
      yMax = Math.max(0.01, ...entries.map((e) => e.inclusion!));
    const scatter = entries.map((entry) => ({
      entry,
      x: 50 + (entry.synergy! / xMax) * 44,
      y: 92 - (entry.inclusion! / yMax) * 84,
    }));
    const result = { charts, scatter };
    this.cache.set(page, result);
    return result;
  }
}
