import { CardType, PermanentDto, CombatStateDto } from '../models/game.models';
export type BattlefieldArea = 'creatures' | 'support' | 'lands';
export interface BattlefieldPile {
  id: string;
  area: BattlefieldArea;
  cards: PermanentDto[];
}
export interface BattlefieldTile {
  id: string;
  cards: PermanentDto[];
  width: number;
  height: number;
  slotWidth: number;
  name: string;
  subtype: string;
  nameFontSize: number;
  color: string;
  tapped: boolean;
  badge: string;
  count: number;
  stats: string;
  kind: 'card' | 'land' | 'chip';
}
export interface BattlefieldRow {
  id: string;
  height: number;
  gap: number;
  tiles: BattlefieldTile[];
  hidden: PermanentDto[];
  hiddenCount: number;
}
export type BattlefieldRole = 'local' | 'opponent' | 'table';
export function battlefieldArea(p: PermanentDto): BattlefieldArea {
  return p.sourceCard.cardTypes.includes(CardType.Creature)
    ? 'creatures'
    : p.sourceCard.cardTypes.includes(CardType.Land)
      ? 'lands'
      : 'support';
}
/** Pure layout decisions. Input identity + geometry memoization; no DOM or game mutations. */
export class BattlefieldArrangement {
  private input: PermanentDto[] = [];
  private separated = new Set<string>();
  private order: string[] = [];
  private grouped: BattlefieldPile[] = [];
  private combat: CombatStateDto | null = null;
  private cache = new Map<string, BattlefieldRow[]>();
  update(permanents: PermanentDto[], combat: CombatStateDto | null = this.combat): void {
    if (permanents === this.input && combat === this.combat) return;
    this.combat = combat;
    this.input = permanents;
    this.rebuild();
  }
  private rebuild(): void {
    this.cache.clear();
    const groups = new Map<string, BattlefieldPile>();
    const sorted = [...this.input].sort((a, b) => {
      const ai = this.order.indexOf(a.permanentId),
        bi = this.order.indexOf(b.permanentId);
      return (ai < 0 ? this.order.length : ai) - (bi < 0 ? this.order.length : bi);
    });
    for (const p of sorted) {
      const area = battlefieldArea(p);
      // Lands deliberately summarize tapped counts in one tile. Other objects must match
      // visible characteristics too: same name alone cannot hide counters or damage.
      const key = this.separated.has(p.permanentId)
        ? p.permanentId
        : JSON.stringify([
            area,
            p.sourceCard.name,
            !!p.isToken,
            area === 'lands'
              ? null
              : [
                  p.isTapped,
                  p.effectivePower,
                  p.effectiveToughness,
                  p.hasSummoningSickness,
                  p.damageMarked,
                  p.counters,
                  p.attachments,
                  p.enforced,
                  this.combat?.attackers.includes(p.permanentId),
                  this.combat?.attackersToDefenders?.[p.permanentId],
                  Object.values(this.combat?.attackersToBlockers ?? {}).some((ids) =>
                    ids.includes(p.permanentId),
                  ),
                ],
          ]);
      const pile = groups.get(key);
      if (pile) pile.cards.push(p);
      else groups.set(key, { id: p.permanentId, area, cards: [p] });
    }
    this.grouped = [...groups.values()];
  }
  piles(area: BattlefieldArea): BattlefieldPile[] {
    return this.grouped.filter((p) => p.area === area);
  }
  drop(id: string, targetId: string | null, before = false, stack = true): void {
    const p = this.input.find((c) => c.permanentId === id),
      target = this.input.find((c) => c.permanentId === targetId);
    if (!p || id === targetId || (target && battlefieldArea(p) !== battlefieldArea(target))) return;
    if (
      stack &&
      target &&
      p.sourceCard.name === target.sourceCard.name &&
      p.isTapped === target.isTapped
    ) {
      this.separated.delete(id);
    } else this.separated.add(id);
    this.order = this.input.map((c) => c.permanentId).filter((x) => x !== id);
    const at = targetId ? this.order.indexOf(targetId) : -1;
    this.order.splice(at < 0 ? this.order.length : at + (before ? 0 : 1), 0, id);
    this.rebuild();
  }
  /** Exact roomy ratios from renderVals, using the measured rows container's height. */
  sizes(
    role: BattlefieldRole,
    availableHeight: number,
    phone = false,
  ): { creature: number[]; other: number[]; land: number[] } {
    if (phone) {
      if (role === 'local') return { creature: [62, 84], other: [44, 58], land: [72, 44] };
      const h = Math.max(44, Math.min(availableHeight, 96));
      return {
        creature: [Math.round(h * 0.72), h],
        other: [Math.max(36, Math.round(h * 0.6)), Math.round(h * 0.82)],
        land: [72, 44],
      };
    }
    if (role === 'local') return { creature: [104, 144], other: [68, 94], land: [86, 44] };
    if (role === 'table') return { creature: [72, 100], other: [52, 72], land: [88, 40] };
    const a = Math.max(0, availableHeight - 8);
    const ch = Math.min(Math.round(a * 0.58), 170),
      oh = Math.min(a - ch, 120);
    return {
      creature: [Math.round(ch * 0.72), ch],
      other: [Math.round(oh * 0.72), oh],
      land: [88, Math.min(40, oh)],
    };
  }
  cardView(pile: BattlefieldPile, size: number[]): BattlefieldTile {
    const p = pile.cards[0],
      land = pile.area === 'lands',
      tapped = !land && p.isTapped;
    const colors = p.sourceCard.colors ?? p.sourceCard.colorIdentity ?? [];
    const color = colors.length === 1 ? colors[0] : 'C';
    const tappedN = pile.cards.filter((c) => c.isTapped).length;
    return {
      id: pile.id,
      cards: pile.cards,
      width: size[0],
      height: size[1],
      slotWidth: tapped ? size[1] : size[0],
      name: p.sourceCard.name,
      nameFontSize: land ? 11 : size[0] >= 78 ? 12 : size[0] >= 56 ? 11 : 10,
      subtype: !land && size[0] >= 72 ? (p.sourceCard.subtypes ?? []).join(' ') : '',
      color,
      tapped,
      count: pile.cards.length,
      kind: land ? 'land' : 'card',
      stats:
        p.effectivePower != null && p.effectiveToughness != null
          ? p.effectivePower + '/' + p.effectiveToughness
          : '',
      badge: land
        ? tappedN + ' tapped'
        : p.hasSummoningSickness
          ? 'New'
          : !p.enforced
            ? 'Manual'
            : '',
    };
  }
  fillRow(
    id: string,
    tiles: BattlefieldTile[],
    width: number,
    gap: number,
    height: number,
  ): BattlefieldRow {
    const visible: BattlefieldTile[] = [];
    let used = 0,
      hidden: PermanentDto[] = [];
    for (let i = 0; i < tiles.length; i++) {
      const need = tiles[i].slotWidth + (visible.length ? gap : 0);
      if (used + need + (i < tiles.length - 1 ? 52 + gap : 0) > width) {
        hidden = tiles.slice(i).flatMap((t) => t.cards);
        break;
      }
      visible.push(tiles[i]);
      used += need;
    }
    return { id, height, gap, tiles: visible, hidden, hiddenCount: hidden.length };
  }
  rows(role: BattlefieldRole, width: number, height: number, phone = false): BattlefieldRow[] {
    const key = role + ':' + width + ':' + height + ':' + phone;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const sz = this.sizes(role, height, phone),
      gap = phone ? 6 : role === 'table' ? 8 : 12;
    const tiles = (area: BattlefieldArea, size: number[]) =>
      this.piles(area).map((p) => this.cardView(p, size));
    const creatures = tiles('creatures', sz.creature),
      other = tiles('support', sz.other),
      lands = tiles('lands', sz.land);
    let result: BattlefieldRow[];
    if (role === 'local' && !phone)
      result = [
        this.fillRow('creatures', creatures, width, gap, sz.creature[1]),
        this.fillRow('support', other, width, gap, sz.other[1]),
        this.fillRow('lands', lands, width, gap, Math.max(44, sz.land[1])),
      ];
    else {
      const landCards = lands.flatMap((t) => t.cards);
      const chip: BattlefieldTile = {
        id: 'land-summary',
        cards: landCards,
        width: phone ? 72 : 112,
        height: phone ? 44 : 52,
        slotWidth: phone ? 72 : 112,
        name: 'Lands ' + landCards.length,
        nameFontSize: 12,
        subtype: '',
        color: 'C',
        tapped: false,
        badge: landCards.filter((c) => !c.isTapped).length + ' untapped',
        count: 1,
        stats: '',
        kind: 'chip',
      };
      if (phone) {
        const lead = landCards.length ? [chip] : [];
        const phoneTiles = (tiles: BattlefieldTile[]) =>
          tiles.map((tile) => ({
            ...tile,
            name: tile.width < 60 ? tile.name.split(',')[0] : tile.name,
            subtype: '',
            badge: tile.height < 72 ? '' : tile.badge,
          }));
        result =
          role === 'local'
            ? [
                this.fillRow('creatures', phoneTiles(creatures), width, gap, sz.creature[1]),
                this.fillRow('support', [...lead, ...phoneTiles(other)], width, gap, sz.other[1]),
              ]
            : [
                this.fillRow(
                  'creatures',
                  [...lead, ...phoneTiles(creatures), ...phoneTiles(other)],
                  width,
                  gap,
                  sz.creature[1],
                ),
              ];
      } else
        result = [
          this.fillRow(
            'support',
            role === 'table'
              ? [...(landCards.length ? [chip] : []), ...other]
              : [...lands, ...other],
            width,
            gap,
            sz.other[1],
          ),
          this.fillRow('creatures', creatures, width, gap, sz.creature[1]),
        ];
    }
    // Keep resize caching bounded during continuous resizes.
    if (this.cache.size > 24) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
}
