import { BattlefieldArrangement, battlefieldArea } from './battlefield-arrangement';
import { CardType } from '../models/game.models';
import { makePermanent, makeCard } from '../testing/test-factories';
const card = (id: string, type = CardType.Creature, name = 'Saproling', tapped = false) =>
  makePermanent({
    permanentId: id,
    sourceCard: makeCard({ name, cardTypes: [type] }),
    isTapped: tapped,
  });
describe('Roomy battlefield layout', () => {
  it('matches the approved renderVals dimensions at desktop Focus and two seats', () => {
    const layout = new BattlefieldArrangement();
    expect(layout.sizes('opponent', 230)).toEqual({
      creature: [93, 129],
      other: [67, 93],
      land: [88, 40],
    });
    expect(layout.sizes('opponent', 260)).toEqual({
      creature: [105, 146],
      other: [76, 106],
      land: [88, 40],
    });
    expect(layout.sizes('table', 230).other).toEqual([52, 72]);
    expect(layout.sizes('local', 294).creature).toEqual([104, 144]);
  });
  it('groups every identical permanent but separates tapped creatures', () => {
    const layout = new BattlefieldArrangement();
    layout.update([
      card('a'),
      card('b'),
      card('c'),
      card('d'),
      card('e', CardType.Creature, 'Saproling', true),
    ]);
    expect(layout.piles('creatures').map((p) => p.cards.length)).toEqual([4, 1]);
  });
  it('does not hide different counters, damage or stats in matching piles', () => {
    const layout = new BattlefieldArrangement();
    layout.update([
      card('a'),
      { ...card('b'), effectivePower: 8 },
      { ...card('c'), damageMarked: 1 },
    ]);
    expect(layout.piles('creatures').length).toBe(3);
  });
  it('summarizes land names and their tapped count', () => {
    const layout = new BattlefieldArrangement();
    layout.update([card('a', CardType.Land, 'Forest'), card('b', CardType.Land, 'Forest', true)]);
    const tile = layout.rows('local', 800, 300)[2].tiles[0];
    expect(tile.count).toBe(2);
    expect(tile.badge).toBe('1 tapped');
    expect(tile.tapped).toBeFalse();
  });
  it('reserves the more button without shrinking cards and counts hidden copies', () => {
    const layout = new BattlefieldArrangement();
    layout.update([
      card('a', CardType.Creature, 'A'),
      card('b', CardType.Creature, 'B'),
      card('c', CardType.Creature, 'B'),
      card('d', CardType.Creature, 'C'),
    ]);
    const row = layout.rows('local', 220, 300)[0];
    expect(row.tiles.map((t) => t.width)).toEqual([104]);
    expect(row.hiddenCount).toBe(3);
    expect(row.hidden.map((c) => c.permanentId)).toEqual(['b', 'c', 'd']);
    expect(layout.rows('local', 400, 300)[0].hiddenCount).toBe(0);
  });
  it('uses the rotated width when filling a row', () => {
    const layout = new BattlefieldArrangement();
    layout.update([card('a', CardType.Creature, 'A', true), card('b', CardType.Creature, 'B')]);
    const row = layout.rows('local', 220, 300)[0];
    expect(row.tiles[0].slotWidth).toBe(144);
    expect(row.hiddenCount).toBe(1);
  });
  it('memoizes geometry until input changes and prunes removed objects', () => {
    const layout = new BattlefieldArrangement(),
      cards = [card('a'), card('b')];
    layout.update(cards);
    const rows = layout.rows('local', 800, 300);
    layout.update(cards);
    expect(layout.rows('local', 800, 300)).toBe(rows);
    layout.update([cards[0]]);
    expect(layout.rows('local', 800, 300)).not.toBe(rows);
    expect(layout.piles('creatures')[0].cards.length).toBe(1);
  });
  it('preserves full names and classifies land creatures once', () => {
    const layout = new BattlefieldArrangement(),
      p = card('a', CardType.Creature, 'Atraxa, Praetors’ Voice');
    p.sourceCard.cardTypes.push(CardType.Land);
    layout.update([p]);
    expect(battlefieldArea(p)).toBe('creatures');
    expect(layout.rows('table', 300, 230)[1].tiles[0].name).toBe('Atraxa, Praetors’ Voice');
  });
  it('keeps keyboard separation and rejects cross-area moves', () => {
    const layout = new BattlefieldArrangement(),
      cards = [card('a'), card('b'), card('c', CardType.Land, 'Forest')];
    layout.update(cards);
    layout.drop('a', null);
    expect(layout.piles('creatures').length).toBe(2);
    layout.drop('a', 'c');
    expect(layout.piles('lands')[0].cards.length).toBe(1);
  });
  it('handles empty and extremely narrow rows', () => {
    const layout = new BattlefieldArrangement();
    expect(layout.rows('local', 0, 0).every((r) => r.hiddenCount === 0)).toBeTrue();
    layout.update([card('a')]);
    expect(layout.rows('local', 44, 0)[0].hiddenCount).toBe(1);
  });
  it('uses the approved landscape dimensions and keeps lands in the second local row', () => {
    const layout = new BattlefieldArrangement();
    layout.update([
      card('c'),
      card('l', CardType.Land, 'Forest'),
      card('a', CardType.Artifact, 'Sol Ring'),
    ]);
    expect(layout.sizes('local', 148, true).creature).toEqual([62, 84]);
    expect(layout.sizes('local', 148, true).other).toEqual([44, 58]);
    const rows = layout.rows('local', 430, 148, true);
    expect(rows.length).toBe(2);
    expect(rows[1].tiles.map((t) => t.kind)).toEqual(['chip', 'card']);
    expect(layout.rows('local', 430, 148, true)).toBe(rows);
    expect(layout.rows('local', 430, 148, false)).not.toBe(rows);
  });
  it('fits an opponent in one landscape row and accounts for all overflow cards', () => {
    const layout = new BattlefieldArrangement();
    layout.update([
      card('l', CardType.Land, 'Forest'),
      ...Array.from({ length: 8 }, (_, i) => card('c' + i, CardType.Creature, 'Creature ' + i)),
    ]);
    const rows = layout.rows('opponent', 200, 68, true);
    expect(rows.length).toBe(1);
    expect(rows[0].tiles.flatMap((t) => t.cards).length + rows[0].hiddenCount).toBe(9);
    expect(layout.sizes('opponent', 68, true).creature).toEqual([49, 68]);
  });
});
