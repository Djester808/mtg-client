import { ExploreHomeService } from './explore-home.service';
import { ExploreEntry } from './explore-api.service';
describe('Explore home', () => {
  beforeEach(() => localStorage.removeItem('compleat.explore.recent'));
  afterEach(() => localStorage.removeItem('compleat.explore.recent'));
  it('keeps bounded unique recent queries and survives corrupt storage', () => {
    localStorage.setItem('compleat.explore.recent', 'bad json');
    const service = new ExploreHomeService();
    expect(service.recents()).toEqual([]);
    for (let i = 0; i < 12; i++) service.remember('Card ' + i, 'card');
    service.remember('Card 11', 'card');
    expect(service.recents().length).toBe(8);
    expect(new ExploreHomeService().recents()[0].q).toBe('Card 11');
    service.clear();
    expect(service.recents()).toEqual([]);
  });
  it('chooses a deterministic daily pick only from measured commanders', () => {
    const rows = Array.from(
      { length: 30 },
      (_, i) => ({ name: String(i), card: { oracleId: String(i) }, decks: 30 - i }) as ExploreEntry,
    );
    const service = new ExploreHomeService();
    expect(service.pick(rows, new Date('2026-01-01T12:00:00Z'))?.name).toBe('1');
    expect(service.pick(rows, new Date('2026-01-02T12:00:00Z'))?.name).toBe('2');
    expect(service.pick(rows.slice(0, 1))).toBeNull();
    expect(service.pick(rows.map((r) => ({ ...r, decks: null })))).toBeNull();
  });
});
