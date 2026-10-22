import { Injectable } from '@angular/core';
import { ExploreEntry, ExploreSection } from './explore-api.service';
export interface ExploreQuery {
  q: string;
  section: string;
  sort: string;
  dir: string;
  group: string;
  color: string;
  type: string;
  rarity: string;
  with: string;
  without: string;
  limit: number;
}
export interface QueriedExploreSection extends ExploreSection {
  total: number;
}
const tokens = (value: string) =>
  new Set(
    value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
export function explorePriceBand(price: number | null | undefined): string {
  return price == null
    ? 'Unpriced'
    : price < 1
      ? 'Under $1'
      : price < 5
        ? '$1–5'
        : price < 20
          ? '$5–20'
          : '$20+';
}
@Injectable({ providedIn: 'root' })
export class ExploreQueryService {
  run(source: ExploreSection[], query: ExploreQuery): QueriedExploreSection[] {
    const included = tokens(query.with),
      excluded = tokens(query.without),
      q = query.q.trim().toLowerCase();
    let sections = source
      .filter((s) => !query.section || s.tag === query.section)
      .map((s) => ({
        ...s,
        cards: s.cards.filter((e) => {
          const c = e.card,
            id = c?.oracleId.toLowerCase() ?? '',
            name = e.name.toLowerCase();
          return (
            (!q || name.includes(q)) &&
            !excluded.has(id) &&
            !excluded.has(name) &&
            (!included.size || included.has(id) || included.has(name)) &&
            (!query.color || c?.colorIdentity?.includes(query.color as never)) &&
            (!query.type ||
              c?.cardTypes?.some((t) => String(t).toLowerCase() === query.type.toLowerCase())) &&
            (!query.rarity || c?.rarity === query.rarity)
          );
        }),
      }));
    if (query.group !== 'category') {
      const seen = new Set<string>(),
        groups = new Map<string, ExploreEntry[]>();
      for (const section of sections)
        for (const entry of section.cards) {
          const key = entry.card?.oracleId ?? entry.name;
          if (seen.has(key)) continue;
          seen.add(key);
          const c = entry.card,
            label =
              query.group === 'mv'
                ? c
                  ? 'Mana value ' + c.manaValue
                  : 'Unknown mana value'
                : query.group === 'rarity'
                  ? (c?.rarity ?? 'Unknown rarity')
                  : explorePriceBand(c?.prices?.usd);
          groups.set(label, [...(groups.get(label) ?? []), entry]);
        }
      sections = [...groups]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([tag, cards]) => ({ tag, title: tag, cards }));
    }
    const numeric = (e: ExploreEntry): number | null =>
      query.sort === 'mv'
        ? (e.card?.manaValue ?? null)
        : query.sort === 'price'
          ? (e.card?.prices?.usd ?? null)
          : (e[query.sort as 'decks' | 'inclusion' | 'synergy'] ?? null);
    return sections
      .map((s) => {
        const cards = [...s.cards].sort((a, b) => {
          const x = numeric(a),
            y = numeric(b);
          let result =
            query.sort === 'name'
              ? a.name.localeCompare(b.name)
              : x == null
                ? y == null
                  ? 0
                  : 1
                : y == null
                  ? -1
                  : (x - y) * (query.dir === 'asc' ? 1 : -1);
          if (query.sort === 'name' && query.dir === 'desc') result *= -1;
          return result || a.name.localeCompare(b.name);
        });
        return {
          ...s,
          total: cards.length,
          cards: cards.slice(0, Math.max(1, Math.min(5000, query.limit))),
        };
      })
      .filter((s) => s.total > 0);
  }
}
