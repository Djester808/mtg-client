import { PricePointDto } from '../models/game.models';

/**
 * Pure geometry for the price-history line chart. Kept out of the component so the
 * maths is testable on its own and the component stays a renderer.
 *
 * Colours are the two validated categorical slots for this app's dark chart surface
 * (#1c1c20): blue for non-foil, yellow for foil. Both series are USD, so they share
 * one y-axis — never plot tix or EUR here, that would be a second scale.
 */

export const SERIES_USD_COLOR = '#3987e5';
export const SERIES_FOIL_COLOR = '#c98500';

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  date: string;
}

export interface ChartSeries {
  key: 'usd' | 'usdFoil';
  label: string;
  color: string;
  /** SVG path for the 2px line. */
  path: string;
  /** Closed path for the ~10% wash under the line; null for the secondary series. */
  areaPath: string | null;
  points: ChartPoint[];
  end: ChartPoint | null;
}

export interface AxisTick {
  pos: number;
  label: string;
}

/** One hover column: the x to snap the crosshair to, and the value of each series there. */
export interface HoverSlot {
  x: number;
  date: string;
  values: { key: 'usd' | 'usdFoil'; label: string; color: string; value: number; y: number }[];
}

export interface ChartModel {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  yTicks: AxisTick[];
  xTicks: AxisTick[];
  series: ChartSeries[];
  hoverSlots: HoverSlot[];
  /** True when there is nothing plottable — the caller shows an empty state instead. */
  empty: boolean;
  /**
   * True when only one day has been captured. A lone point draws no line, so the caller
   * leans on the end-dot and tells the reader the line fills in as snapshots accumulate.
   */
  singlePoint: boolean;
}

const WIDTH = 620;
const HEIGHT = 220;
const PAD = { top: 14, right: 58, bottom: 24, left: 48 };

export function formatUsd(value: number): string {
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A round step (1/2/5 × 10ⁿ) so the axis reads 0.50 / 1.00 / 1.50, never 0.37. */
function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const raw = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const stepped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return stepped * magnitude;
}

export function buildPriceChart(points: PricePointDto[], includeFoil = true): ChartModel {
  const plot = {
    x: PAD.left,
    y: PAD.top,
    w: WIDTH - PAD.left - PAD.right,
    h: HEIGHT - PAD.top - PAD.bottom,
  };
  const empty: ChartModel = {
    width: WIDTH,
    height: HEIGHT,
    plot,
    yTicks: [],
    xTicks: [],
    series: [],
    hoverSlots: [],
    empty: true,
    singlePoint: false,
  };

  const usable = points.filter((p) => p.usd != null || (includeFoil && p.usdFoil != null));
  if (usable.length === 0) return empty;

  const hasFoil = includeFoil && usable.some((p) => p.usdFoil != null);
  const values: number[] = [];
  for (const p of usable) {
    if (p.usd != null) values.push(p.usd);
    if (hasFoil && p.usdFoil != null) values.push(p.usdFoil);
  }
  if (values.length === 0) return empty;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // A perfectly flat series would collapse to a zero-height domain; give it room so
    // the line sits mid-plot instead of on the axis.
    const pad = Math.max(min * 0.1, 0.5);
    min -= pad;
    max += pad;
  }
  min = Math.max(0, min);

  const step = niceStep(max - min, 4);
  const axisMin = Math.max(0, Math.floor(min / step) * step);
  const axisMax = Math.ceil(max / step) * step;
  const span = axisMax - axisMin || 1;

  // Time-based x so a gap in the daily snapshots reads as a gap, not as even spacing.
  const times = usable.map((p) => new Date(p.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tSpan = tMax - tMin;

  const xAt = (iso: string): number => {
    // A single captured day has no span to spread across — centre it rather than
    // pinning it to the right edge, where it reads as a clipped chart.
    if (tSpan === 0) return plot.x + plot.w / 2;
    return plot.x + ((new Date(iso).getTime() - tMin) / tSpan) * plot.w;
  };
  const yAt = (value: number): number => plot.y + plot.h - ((value - axisMin) / span) * plot.h;

  const buildSeries = (
    key: 'usd' | 'usdFoil',
    label: string,
    color: string,
    withArea: boolean,
  ): ChartSeries | null => {
    const seriesPoints: ChartPoint[] = usable
      .filter((p) => p[key] != null)
      .map((p) => ({
        x: xAt(p.date),
        y: yAt(p[key] as number),
        value: p[key] as number,
        date: p.date,
      }));
    if (seriesPoints.length === 0) return null;

    const path = seriesPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
      .join(' ');
    const areaPath = withArea
      ? `${path} L${seriesPoints[seriesPoints.length - 1].x.toFixed(2)},${(plot.y + plot.h).toFixed(2)} ` +
        `L${seriesPoints[0].x.toFixed(2)},${(plot.y + plot.h).toFixed(2)} Z`
      : null;

    return {
      key,
      label,
      color,
      path,
      areaPath,
      points: seriesPoints,
      end: seriesPoints[seriesPoints.length - 1],
    };
  };

  const series = [
    buildSeries('usd', 'Non-foil', SERIES_USD_COLOR, true),
    hasFoil ? buildSeries('usdFoil', 'Foil', SERIES_FOIL_COLOR, false) : null,
  ].filter((s): s is ChartSeries => s !== null);

  const yTicks: AxisTick[] = [];
  for (let v = axisMin; v <= axisMax + step / 2; v += step) {
    yTicks.push({ pos: yAt(v), label: formatUsd(v) });
  }

  // Three x labels (first / middle / last) — enough to orient, too few to collide.
  const xTicks: AxisTick[] = [];
  const tickIdx =
    usable.length === 1 ? [0] : [0, Math.floor((usable.length - 1) / 2), usable.length - 1];
  for (const i of [...new Set(tickIdx)]) {
    xTicks.push({ pos: xAt(usable[i].date), label: formatDay(usable[i].date) });
  }

  const hoverSlots: HoverSlot[] = usable.map((p) => ({
    x: xAt(p.date),
    date: p.date,
    values: series
      .filter((s) => p[s.key] != null)
      .map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: p[s.key] as number,
        y: yAt(p[s.key] as number),
      })),
  }));

  return {
    width: WIDTH,
    height: HEIGHT,
    plot,
    yTicks,
    xTicks,
    series,
    hoverSlots,
    empty: false,
    singlePoint: usable.length === 1,
  };
}
