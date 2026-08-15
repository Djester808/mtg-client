import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PricePointDto } from '../../models/game.models';
import {
  buildPriceChart,
  ChartModel,
  formatDay,
  formatUsd,
  HoverSlot,
} from '../../utils/price-chart';

/**
 * Daily price history as a line chart: non-foil (blue) and, when the printing has one,
 * foil (yellow). Both series are USD so they share a single y-axis.
 *
 * The hover layer is part of the deliverable, not an extra: a crosshair snaps to the
 * nearest day and one tooltip reports every series at that day. Everything the tooltip
 * shows is also reachable without hovering — the end of each line is labelled, the axis
 * carries the rest, and the table view lists every point.
 */
@Component({
  selector: 'app-price-history-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './price-history-chart.component.html',
  styleUrls: ['./price-history-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceHistoryChartComponent implements OnChanges {
  @Input() points: PricePointDto[] = [];
  /** Holds the previous render at reduced opacity while a new range loads. */
  @Input() loading = false;
  @Input() view: 'chart' | 'table' = 'chart';

  model: ChartModel = buildPriceChart([]);
  hovered: HoverSlot | null = null;

  readonly formatUsd = formatUsd;
  readonly formatDay = formatDay;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.model = buildPriceChart(this.points);
    this.hovered = null;
  }

  /** True once there are two series — only then does a legend earn its space. */
  get showLegend(): boolean {
    return this.model.series.length > 1;
  }

  /**
   * Snaps to the nearest day so the reader aims at a date rather than a 2px line.
   * Coordinates are converted through the SVG viewBox, since the element is scaled.
   */
  onPointerMove(event: PointerEvent): void {
    if (this.model.empty) return;
    // currentTarget rather than a template ref: Angular types an SVG #ref as HTMLElement.
    const svg = event.currentTarget as Element | null;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * this.model.width;

    let nearest: HoverSlot | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const slot of this.model.hoverSlots) {
      const d = Math.abs(slot.x - x);
      if (d < best) {
        best = d;
        nearest = slot;
      }
    }
    if (nearest !== this.hovered) {
      this.hovered = nearest;
      this.cdr.markForCheck();
    }
  }

  onPointerLeave(): void {
    if (this.hovered) {
      this.hovered = null;
      this.cdr.markForCheck();
    }
  }

  /** Keeps the tooltip inside the plot when hovering near the right edge. */
  tooltipX(slot: HoverSlot): number {
    const width = 132;
    const max = this.model.plot.x + this.model.plot.w - width;
    return Math.max(this.model.plot.x, Math.min(slot.x + 10, max));
  }

  trackByDate = (_: number, p: PricePointDto): string => p.date;
}
