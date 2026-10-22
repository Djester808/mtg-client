import { Injectable } from '@angular/core';
import { CollectionCardDto } from '../models/game.models';
export interface CollectionInsight {
  title: string;
  money?: boolean;
  points: { label: string; value: number }[];
  max: number;
}
@Injectable({ providedIn: 'root' })
export class CollectionInsightsService {
  private previous?: CollectionCardDto[];
  private result: CollectionInsight[] = [];
  compute(cards: CollectionCardDto[]): CollectionInsight[] {
    if (this.previous === cards) return this.result;
    const maps = Array.from({ length: 10 }, () => new Map<string, number>());
    const add = (index: number, label: string, value: number) => {
      if (value > 0 || (index === 8 && value !== 0))
        maps[index].set(label, (maps[index].get(label) ?? 0) + value);
    };
    for (const row of cards) {
      const count = row.quantity + row.quantityFoil + (row.quantityEtched ?? 0);
      if (count <= 0) continue;
      const card = row.cardDetails;
      add(
        0,
        card
          ? String(Math.min(14, Math.floor(card.manaValue))) + (card.manaValue >= 14 ? '+' : '')
          : 'Unknown',
        count,
      );
      const colors = card?.colors ?? [
        ...new Set([...(card?.manaCost ?? '')].filter((c) => 'WUBRG'.includes(c))),
      ];
      add(1, colors.length > 1 ? 'Multicolor' : (colors[0] ?? 'Colorless'), count);
      const types = card?.cardTypes ?? [];
      for (const type of types.length ? types : ['Unknown']) add(2, String(type), count);
      add(3, card?.rarity ?? 'Unknown', count);
      add(4, card?.setCode?.toUpperCase() ?? 'Unknown', count);
      add(5, 'Nonfoil', row.quantity);
      add(5, 'Foil', row.quantityFoil);
      add(5, 'Etched', row.quantityEtched ?? 0);
      add(6, card?.colorIdentity?.join('') || 'Colorless', count);
      const name = card?.name ?? row.oracleId;
      for (const [qty, price, original] of [
        [
          row.quantity,
          card?.prices?.usd,
          row.finishData?.['nonfoil'] ? row.finishData['nonfoil'].priceAtAdd : row.priceUsdAtAdd,
        ],
        [
          row.quantityFoil,
          card?.prices?.usdFoil,
          row.finishData?.['foil'] ? row.finishData['foil'].priceAtAdd : row.priceUsdFoilAtAdd,
        ],
        [
          row.quantityEtched ?? 0,
          card?.prices?.usdEtched,
          row.finishData?.['etched']
            ? row.finishData['etched'].priceAtAdd
            : row.priceUsdEtchedAtAdd,
        ],
      ]) {
        if (qty && price != null) {
          add(7, name, qty * price);
          if (original != null) add(8, name, qty * (price - original));
        }
      }
      for (const [finish, qty] of [
        ['nonfoil', row.quantity],
        ['foil', row.quantityFoil],
        ['etched', row.quantityEtched ?? 0],
      ] as const) {
        const date = row.finishData?.[finish]?.addedAt ?? row.addedAt;
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) add(9, date.slice(0, 7), qty);
      }
    }
    const titles = [
      'Mana curve',
      'Colors',
      'Types',
      'Rarity',
      'Sets',
      'Finish',
      'Color identity',
      'Most valuable',
      'Movers since added',
      'Acquisitions',
    ];
    this.previous = cards;
    this.result = maps.map((map, i) => {
      let points = [...map].map(([label, value]) => ({ label, value }));
      if (i === 0) points.sort((a, b) => parseInt(a.label) - parseInt(b.label));
      else if (i === 9) points.sort((a, b) => a.label.localeCompare(b.label));
      else
        points.sort(
          (a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label),
        );
      if (i === 9) points = points.slice(-12);
      else if (points.length > 10 && i !== 0) {
        const tail = points.slice(10).reduce((sum, p) => sum + p.value, 0);
        points = points.slice(0, 10);
        if (i < 7) points.push({ label: 'Other', value: tail });
      }
      return {
        title: titles[i],
        money: i === 7 || i === 8,
        points,
        max: Math.max(1, ...points.map((p) => Math.abs(p.value))),
      };
    });
    return this.result;
  }
}
