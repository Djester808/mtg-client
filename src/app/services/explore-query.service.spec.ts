import { ExploreQueryService, ExploreQuery } from './explore-query.service';
import { ExploreSection } from './explore-api.service';
import { makeCard } from '../testing/test-factories';
const query = (over: Partial<ExploreQuery> = {}): ExploreQuery => ({
  q: '',
  section: '',
  sort: 'mv',
  dir: 'asc',
  group: 'category',
  color: '',
  type: '',
  rarity: '',
  with: '',
  without: '',
  limit: 40,
  ...over,
});
const entry = (id: string, mv: number, rarity = 'rare') => ({
  name: id,
  card: makeCard({ oracleId: id, name: id, manaValue: mv, rarity }),
  quantity: 1,
  decks: 10,
  potential: null,
  synergy: null,
  inclusion: null,
  trend: null,
});
describe('Explore list query', () => {
  const source: ExploreSection[] = [
    { tag: 'a', title: 'A', cards: [entry('Alpha', 3), entry('Beta', 0)] },
    { tag: 'b', title: 'B', cards: [entry('Alpha', 3), entry('Gamma', 1, 'common')] },
  ];
  it('WITH and WITHOUT filter the listed cards, not their deck populations', () => {
    expect(
      new ExploreQueryService()
        .run(source, query({ with: 'Alpha,Gamma', without: 'Gamma' }))
        .flatMap((s) => s.cards.map((c) => c.name)),
    ).toEqual(['Alpha', 'Alpha']);
  });
  it('deduplicates derived groups, sorts mana value, facets and exposes show-more totals', () => {
    const service = new ExploreQueryService();
    const sections = service.run(source, query({ group: 'rarity', rarity: 'rare', limit: 1 }));
    expect(sections.length).toBe(1);
    expect(sections[0].total).toBe(2);
    expect(sections[0].cards[0].name).toBe('Beta');
    expect(service.run(source, query({ section: 'a', dir: 'desc' }))[0].cards[0].name).toBe(
      'Alpha',
    );
  });
});
