import { ExploreInsightsService } from './explore-insights.service';
import { ExplorePage, ExploreEntry } from './explore-api.service';
describe('Explore insights', () => {
  it('caps distinct measured scatter points, drops unknowns and memoizes the page', () => {
    const cards = Array.from(
      { length: 70 },
      (_, i) =>
        ({
          name: String(i),
          card: { oracleId: String(i) },
          inclusion: i / 100,
          synergy: (i - 35) / 100,
        }) as ExploreEntry,
    );
    const page = {
      charts: [
        {
          title: 'Rank over time',
          points: [
            { label: '2026-01', value: 2 },
            { label: '2026-02', value: 1 },
          ],
        },
      ],
      sections: [
        {
          tag: 'a',
          title: 'a',
          cards: [
            ...cards,
            ...cards,
            { name: 'Unknown', inclusion: null, synergy: null } as ExploreEntry,
          ],
        },
      ],
    } as ExplorePage;
    const service = new ExploreInsightsService(),
      model = service.model(page);
    expect(model.scatter.length).toBe(60);
    expect(model.scatter[0].entry.name).toBe('69');
    expect(model.scatter.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBeTrue();
    expect(model.charts[0].timeline).toBeTrue();
    expect(model.charts[0].line).toContain(',');
    expect(service.model(page)).toBe(model);
  });
});
