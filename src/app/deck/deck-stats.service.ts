import { Injectable } from '@angular/core';
import { CollectionCardDto, CardType } from '../models/game.models';
import { DeckDetailDto } from '../services/deck-api.service';

export interface DeckStats {
  total: number;
  lands: number;
  creatures: number;
  instants: number;
  sorceries: number;
  enchantments: number;
  artifacts: number;
  planeswalkers: number;
  other: number;
  avgCmc: number;
  curve: { cmc: number; count: number; label: string }[];
  curveMax: number;
  manaPips: { color: string; count: number }[];
  manaProduction: { color: string; count: number }[];
  creatureSubtypes: { name: string; count: number }[];
  landSubtypes: { name: string; count: number; deckCard: CollectionCardDto | null }[];
  tokensNeeded: { tokenName: string; description: string; creatorCard: CollectionCardDto }[];
  emblemSources: {
    name: string;
    imageUri: string | null;
    manaCost: string;
    sourceCard: CollectionCardDto;
  }[];
}

/**
 * The deck-statistics engine (curve, mana pips, mana production, subtypes, tokens,
 * emblems), extracted from DeckDetailComponent. Pure — a function of the deck only.
 *
 * Memoized on the deck's object identity: the store hands out a new deck object on every
 * mutation, so identity is a sound key. The old version recomputed this ~190-line sweep
 * (including several oracle-text regex passes per card) on every change-detection pass
 * while the stats tab was open, and again on every deck emission via token-image loading.
 */
@Injectable({ providedIn: 'root' })
export class DeckStatsService {
  private cache: { deck: DeckDetailDto; stats: DeckStats } | null = null;

  private cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  private isLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.cardTypes?.includes(CardType.Land) ?? false;
  }

  getDeckStats(deck: DeckDetailDto): DeckStats {
    if (this.cache?.deck === deck) return this.cache.stats;
    const stats = this.compute(deck);
    this.cache = { deck, stats };
    return stats;
  }

  private compute(deck: DeckDetailDto): DeckStats {
    const cards = deck.cards.filter((c) => (c.board ?? 'main') === 'main');
    const total = cards.reduce((s, c) => s + this.cardCount(c), 0);
    const countOf = (type: CardType) =>
      cards
        .filter((c) => c.cardDetails?.cardTypes?.includes(type))
        .reduce((s, c) => s + this.cardCount(c), 0);

    const lands = countOf(CardType.Land);
    const creatures = countOf(CardType.Creature);
    const instants = countOf(CardType.Instant);
    const sorceries = countOf(CardType.Sorcery);
    const enchantments = countOf(CardType.Enchantment);
    const artifacts = countOf(CardType.Artifact);
    const planeswalkers = countOf(CardType.Planeswalker);
    const other = Math.max(
      0,
      total - lands - creatures - instants - sorceries - enchantments - artifacts - planeswalkers,
    );

    const nonLandCards = cards.filter((c) => !this.isLand(c));
    const totalNL = nonLandCards.reduce((s, c) => s + this.cardCount(c), 0);
    const avgCmcSum = nonLandCards.reduce(
      (s, c) => s + (c.cardDetails?.manaValue ?? 0) * this.cardCount(c),
      0,
    );
    const avgCmc = totalNL > 0 ? Math.round((avgCmcSum / totalNL) * 10) / 10 : 0;

    const curveData = new Map<number, number>();
    for (const c of nonLandCards) {
      const cmc = Math.min(c.cardDetails?.manaValue ?? 0, 7);
      curveData.set(cmc, (curveData.get(cmc) ?? 0) + this.cardCount(c));
    }
    const curve = [1, 2, 3, 4, 5, 6, 7].map((cmc) => ({
      cmc,
      count: curveData.get(cmc) ?? 0,
      label: cmc === 7 ? '7+' : String(cmc),
    }));
    const curveMax = Math.max(...curve.map((b) => b.count), 1);

    const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];
    const ALL_COLORS_C = [...ALL_COLORS, 'C'];

    // Mana pip breakdown across all non-land costs
    const pipCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const c of nonLandCards) {
      const cost = c.cardDetails?.manaCost ?? '';
      if (!cost) continue;
      const re = /\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cost)) !== null) {
        const sym = m[1].toUpperCase();
        if (sym.includes('/')) {
          const parts = sym
            .split('/')
            .filter((p) => Object.prototype.hasOwnProperty.call(pipCounts, p));
          if (parts.length > 0)
            for (const p of parts) pipCounts[p] += this.cardCount(c) / parts.length;
        } else if (Object.prototype.hasOwnProperty.call(pipCounts, sym)) {
          pipCounts[sym] += this.cardCount(c);
        }
      }
    }
    const manaPips = ALL_COLORS_C.map((color) => ({
      color,
      count: Math.round(pipCounts[color] * 10) / 10,
    })).filter((p) => p.count > 0);

    // Mana production — parse oracle text for "add {X}" patterns
    const prodCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const c of cards) {
      const text = c.cardDetails?.oracleText ?? '';
      if (!text.toLowerCase().includes('add')) continue;
      const qty = this.cardCount(c);
      if (/add (?:one mana of any color|mana of any color|any amount of mana of any)/i.test(text)) {
        for (const col of ALL_COLORS) prodCounts[col] += qty;
        continue;
      }
      const addRe = /add[^.;\n]*?\{([^}]+)\}/gi;
      let am: RegExpExecArray | null;
      while ((am = addRe.exec(text)) !== null) {
        const sym = am[1].toUpperCase();
        if (sym.includes('/')) {
          const parts = sym
            .split('/')
            .filter((p) => Object.prototype.hasOwnProperty.call(prodCounts, p));
          for (const p of parts) prodCounts[p] += qty;
        } else if (Object.prototype.hasOwnProperty.call(prodCounts, sym)) {
          prodCounts[sym] += qty;
        }
      }
    }
    const manaProduction = ALL_COLORS_C.map((color) => ({
      color,
      count: prodCounts[color],
    })).filter((p) => p.count > 0);

    // Creature subtypes (top 10 by count)
    const creatureSubMap = new Map<string, number>();
    for (const c of cards.filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Creature))) {
      const qty = this.cardCount(c);
      for (const sub of c.cardDetails?.subtypes ?? []) {
        creatureSubMap.set(sub, (creatureSubMap.get(sub) ?? 0) + qty);
      }
    }
    const creatureSubtypes = [...creatureSubMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Land subtypes
    const landSubMap = new Map<string, number>();
    for (const c of cards.filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Land))) {
      const qty = this.cardCount(c);
      for (const sub of c.cardDetails?.subtypes ?? []) {
        landSubMap.set(sub, (landSubMap.get(sub) ?? 0) + qty);
      }
    }
    const landSubtypes = [...landSubMap.entries()]
      .map(([name, count]) => ({
        name,
        count,
        deckCard:
          cards.find(
            (c) =>
              c.cardDetails?.cardTypes?.includes(CardType.Land) &&
              c.cardDetails?.subtypes?.includes(name),
          ) ?? null,
      }))
      .sort((a, b) => b.count - a.count);

    // Tokens needed — deduplicated list of token types this deck creates
    const tokenMap = new Map<string, { description: string; creatorCard: CollectionCardDto }>();
    for (const c of cards) {
      const text = c.cardDetails?.oracleText ?? '';
      const tokenRe =
        /create (?:a|an|one|two|three|four|five|\d+|X|that many) ([^.•\n]+?) tokens?/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tokenRe.exec(text)) !== null) {
        const description = tm[1].trim();
        const tokenName = description
          .replace(/^\d+\/[\d*]+\s*/i, '')
          .replace(
            /\b(white|blue|black|red|green|colorless|legendary|aura|artifact|creature|enchantment|token)\b/gi,
            '',
          )
          .replace(/\s+/g, ' ')
          .trim();
        if (tokenName && !tokenMap.has(tokenName))
          tokenMap.set(tokenName, { description, creatorCard: c });
      }
    }
    const tokensNeeded = [...tokenMap.entries()].map(
      ([tokenName, { description, creatorCard }]) => ({ tokenName, description, creatorCard }),
    );

    // Emblem sources
    const emblemSources: DeckStats['emblemSources'] = cards
      .filter(
        (c) => (c.cardDetails?.oracleText ?? '').toLowerCase().includes('emblem') && c.cardDetails,
      )
      .map((c) => ({
        name: c.cardDetails!.name,
        imageUri: c.cardDetails!.imageUriSmall ?? null,
        manaCost: c.cardDetails!.manaCost ?? '',
        sourceCard: c,
      }));

    return {
      total,
      lands,
      creatures,
      instants,
      sorceries,
      enchantments,
      artifacts,
      planeswalkers,
      other,
      avgCmc,
      curve,
      curveMax,
      manaPips,
      manaProduction,
      creatureSubtypes,
      landSubtypes,
      tokensNeeded,
      emblemSources,
    };
  }
}
