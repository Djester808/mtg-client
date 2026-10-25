import { Injectable } from '@angular/core';
import { CardDto, PlayerStateDto } from '../models/game.models';
export type PublicZone = 'library' | 'graveyard' | 'exile' | 'command';
export interface ZonePile {
  key: PublicZone;
  name: string;
  count: number;
  cards: CardDto[];
  top: CardDto | null;
  color: string;
}
/** Public zone presentation, shared by piles and the viewer. Only displays library cards explicitly authorized by the server. */
@Injectable({ providedIn: 'root' })
export class BoardZonesService {
  private cache = new WeakMap<PlayerStateDto, ZonePile[]>();
  piles(player: PlayerStateDto): ZonePile[] {
    const cached = this.cache.get(player);
    if (cached) return cached;
    const zones: PublicZone[] = ['library', 'graveyard', 'exile', 'command'];
    const result = zones.map((key) => {
      const cards =
        key === 'library'
          ? player.topOfLibrary
            ? [player.topOfLibrary]
            : []
          : key === 'graveyard'
            ? [...player.graveyard]
            : [...(player[key] ?? [])].reverse();
      const top = cards[0] ?? null;
      const colors = top?.colors ?? top?.colorIdentity ?? [];
      return {
        key,
        name: key[0].toUpperCase() + key.slice(1),
        count: key === 'library' ? player.libraryCount : cards.length,
        cards,
        top,
        color: colors.length === 1 ? colors[0] : 'C',
      };
    });
    this.cache.set(player, result);
    return result;
  }
}
