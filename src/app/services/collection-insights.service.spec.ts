import { CollectionInsightsService } from './collection-insights.service';
import { CollectionCardDto, CardType, ManaColor } from '../models/game.models';
import { makeCard } from '../testing/test-factories';
describe('Collection insights', () => {
  it('counts actual copies, leaves unpriced cards out of value, and measures price changes from recorded snapshots', () => {
    const rows = [
      {
        id: 'a',
        oracleId: 'a',
        scryfallId: 'a',
        quantity: 2,
        quantityFoil: 1,
        notes: null,
        addedAt: '2026-10-01',
        priceUsdAtAdd: 1,
        priceUsdFoilAtAdd: 3,
        cardDetails: makeCard({
          name: 'Priced',
          manaValue: 0,
          cardTypes: [CardType.Artifact],
          colorIdentity: [ManaColor.Green],
          rarity: 'rare',
          setCode: 'tst',
          prices: {
            usd: 2,
            usdFoil: 4,
            usdEtched: null,
            eur: null,
            eurFoil: null,
            tix: null,
            cardmarketId: null,
            tcgplayerId: null,
            mtgoId: null,
          },
        }),
      },
      {
        id: 'b',
        oracleId: 'b',
        scryfallId: null,
        quantity: 1,
        quantityFoil: 0,
        notes: null,
        addedAt: '2026-09-01',
        cardDetails: null,
      },
    ] as CollectionCardDto[];
    const sections = new CollectionInsightsService().compute(rows);
    expect(sections.length).toBe(10);
    expect(sections.find((s) => s.title === 'Finish')?.points).toContain({
      label: 'Nonfoil',
      value: 3,
    });
    expect(sections.find((s) => s.title === 'Most valuable')?.points).toEqual([
      { label: 'Priced', value: 8 },
    ]);
    expect(sections.find((s) => s.title === 'Movers since added')?.points).toEqual([
      { label: 'Priced', value: 3 },
    ]);
    expect(sections.find((s) => s.title === 'Acquisitions')?.points).toEqual([
      { label: '2026-09', value: 1 },
      { label: '2026-10', value: 3 },
    ]);
  });
  it('has no invented values for an empty collection', () => {
    expect(
      new CollectionInsightsService().compute([]).every((s) => s.points.length === 0),
    ).toBeTrue();
  });
});
