import { DeckStatsService } from './deck-stats.service';
import { DeckLegalityService } from './deck-legality.service';
import { CardType, CollectionCardDto } from '../models/game.models';
import { DeckDetailDto } from '../services/deck-api.service';
import { makeCard } from '../testing/test-factories';
function row(id: string, board = 'main', text = '', land = false): CollectionCardDto {
  return {
    id,
    oracleId: id,
    scryfallId: id,
    quantity: 2,
    quantityFoil: 0,
    notes: null,
    board,
    addedAt: '2026-01-01',
    cardDetails: makeCard({
      manaValue: 0,
      cardTypes: [land ? CardType.Land : CardType.Artifact],
      oracleText: text,
      legalities: { modern: 'banned' },
    }),
  };
}
describe('Audited deck regressions', () => {
  it('uses catalog production choices instead of inferring them from text when available', () => {
    const source = row('catalog', 'main', '{T}: Add {R}.', true);
    source.cardDetails!.producedMana = ['G', 'G'];
    const nonSource = row('not-source', 'main', 'Whenever a player would add {R}, draw a card.');
    nonSource.cardDetails!.producedMana = [];
    expect(
      new DeckStatsService().getDeckStats({ cards: [source, nonSource] } as DeckDetailDto)
        .manaProduction,
    ).toEqual([{ color: 'G', count: 2 }]);
  });
  it('includes zero-cost spells without counting lands or maybeboard cards', () => {
    const stats = new DeckStatsService().getDeckStats({
      cards: [row('memnite'), row('land', 'main', '', true), row('maybe', 'maybe')],
    } as DeckDetailDto);
    expect(stats.curve.find((b) => b.cmc === 0)?.count).toBe(2);
  });
  it('counts every available color once per source, including repeated abilities', () => {
    const stats = new DeckStatsService().getDeckStats({
      cards: [row('gate', 'main', '{T}: Add {R} or {G}. {T}: Add {R}.', true)],
    } as DeckDetailDto);
    expect(stats.manaProduction).toEqual([
      { color: 'R', count: 2 },
      { color: 'G', count: 2 },
    ]);
  });
  it('ignores side and maybe boards for format violations while reporting illegal main cards', () => {
    const service = new DeckLegalityService();
    expect(
      service.formatViolations({
        format: 'modern',
        cards: [row('side', 'side'), row('maybe', 'maybe')],
      } as DeckDetailDto),
    ).toEqual([]);
    expect(
      service
        .formatViolations({ format: 'modern', cards: [row('main')] } as DeckDetailDto)
        .map((c) => c.id),
    ).toEqual(['main']);
  });
});
