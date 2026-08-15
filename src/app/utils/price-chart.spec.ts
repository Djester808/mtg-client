import { buildPriceChart, formatUsd, SERIES_FOIL_COLOR, SERIES_USD_COLOR } from './price-chart';
import { PricePointDto } from '../models/game.models';

function point(date: string, usd: number | null, usdFoil: number | null = null): PricePointDto {
  return { date, usd, usdFoil, eur: null, tix: null };
}

describe('price-chart', () => {
  it('marks an empty series as empty rather than drawing an axis', () => {
    expect(buildPriceChart([]).empty).toBeTrue();
    expect(buildPriceChart([point('2026-08-01', null)]).empty).toBeTrue();
  });

  it('builds one non-foil series with an area wash and an end point', () => {
    const model = buildPriceChart([
      point('2026-08-01', 1),
      point('2026-08-02', 2),
      point('2026-08-03', 3),
    ]);

    expect(model.empty).toBeFalse();
    expect(model.series.length).toBe(1);
    const series = model.series[0];
    expect(series.key).toBe('usd');
    expect(series.color).toBe(SERIES_USD_COLOR);
    expect(series.areaPath).toContain('Z');
    expect(series.points.length).toBe(3);
    expect(series.end!.value).toBe(3);
  });

  it('adds a foil series only when foil prices exist', () => {
    const withoutFoil = buildPriceChart([point('2026-08-01', 1), point('2026-08-02', 2)]);
    expect(withoutFoil.series.map((s) => s.key)).toEqual(['usd']);

    const withFoil = buildPriceChart([point('2026-08-01', 1, 8), point('2026-08-02', 2, 9)]);
    expect(withFoil.series.map((s) => s.key)).toEqual(['usd', 'usdFoil']);
    expect(withFoil.series[1].color).toBe(SERIES_FOIL_COLOR);
    // Only the primary series carries a wash; two stacked fills would muddy the plot.
    expect(withFoil.series[1].areaPath).toBeNull();
  });

  it('puts higher prices higher on the canvas', () => {
    const model = buildPriceChart([point('2026-08-01', 1), point('2026-08-02', 10)]);
    const [low, high] = model.series[0].points;
    expect(high.y).toBeLessThan(low.y); // SVG y grows downward
  });

  it('gives a flat series a padded domain instead of a zero-height plot', () => {
    const model = buildPriceChart([point('2026-08-01', 5), point('2026-08-02', 5)]);
    const ys = model.series[0].points.map((p) => p.y);
    expect(ys[0]).toBe(ys[1]);
    // Sits inside the plot, not pinned to an edge.
    expect(ys[0]).toBeGreaterThan(model.plot.y);
    expect(ys[0]).toBeLessThan(model.plot.y + model.plot.h);
  });

  it('centres a single captured day and flags it, instead of drawing an invisible line', () => {
    // History starts the day a printing is first owned, so every card looks like this on
    // day one. Pinning it to the right edge produced a path with a lone M command, which
    // renders nothing at all — the chart looked broken.
    const model = buildPriceChart([point('2026-08-15', 0.29, 0.36)]);

    expect(model.empty).toBeFalse();
    expect(model.singlePoint).toBeTrue();
    const p = model.series[0].points[0];
    expect(p.x).toBeCloseTo(model.plot.x + model.plot.w / 2, 5);
    // The end point is what the marker is drawn at, so the value stays visible.
    expect(model.series[0].end!.value).toBe(0.29);
  });

  it('does not flag singlePoint once a second day exists', () => {
    const model = buildPriceChart([point('2026-08-14', 1), point('2026-08-15', 2)]);
    expect(model.singlePoint).toBeFalse();
    expect(model.series[0].path).toContain('L'); // a real line segment
  });

  it('spaces points by date so a gap in snapshots reads as a gap', () => {
    const model = buildPriceChart([
      point('2026-08-01', 1),
      point('2026-08-02', 2),
      point('2026-08-10', 3),
    ]);
    const [a, b, c] = model.series[0].points;
    expect(b.x - a.x).toBeLessThan(c.x - b.x);
  });

  it('builds one hover slot per day listing every series at that day', () => {
    const model = buildPriceChart([point('2026-08-01', 1, 8), point('2026-08-02', 2, 9)]);
    expect(model.hoverSlots.length).toBe(2);
    expect(model.hoverSlots[1].values.map((v) => v.value)).toEqual([2, 9]);
  });

  it('rounds y-axis ticks to clean values', () => {
    const model = buildPriceChart([point('2026-08-01', 0.37), point('2026-08-02', 1.83)]);
    for (const tick of model.yTicks) {
      expect(tick.label).toMatch(/^\$\d+(\.\d{2})?$/);
    }
  });

  it('formats whole dollars without cents above $100', () => {
    expect(formatUsd(3.5)).toBe('$3.50');
    expect(formatUsd(250)).toBe('$250');
  });
});
