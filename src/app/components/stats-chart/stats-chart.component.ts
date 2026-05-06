import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PieChartComponent, PieSlice } from './pie-chart.component';

export interface ChartEntry {
  label: string;
  value: number;
  color?: string;
  manaSymbol?: string;
}

export interface StackedBarEntry {
  label: string;
  segments: { manaColor: string; value: number; label: string; color: string }[];
}

@Component({
  selector: 'app-stats-chart',
  standalone: true,
  imports: [CommonModule, PieChartComponent],
  templateUrl: './stats-chart.component.html',
  styleUrls: ['./stats-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsChartComponent {
  @Input() data: ChartEntry[] = [];
  @Input() stackedData: StackedBarEntry[] = [];
  @Input() type: 'bar' | 'vbar' | 'pie' | 'stacked' = 'bar';

  private readonly PALETTE = [
    '#f87171', '#fb923c', '#fbbf24', '#86efac',
    '#34d399', '#67e8f9', '#818cf8', '#e879f9',
    '#f472b6', '#a78bfa',
  ];

  // ── Common ────────────────────────────────────────────

  get max(): number { return Math.max(...this.data.map(d => d.value), 1); }

  color(i: number, override?: string): string {
    return override ?? this.PALETTE[i % this.PALETTE.length];
  }

  barPct(value: number): number {
    return (value / this.max) * 100;
  }

  isCmcNumeric(label: string): boolean {
    return /^\d+$/.test(label);
  }

  // ── Pie (from data[]) ─────────────────────────────────

  get pieSlices(): PieSlice[] {
    return this.data.map((d, i) => ({
      label: d.label,
      value: d.value,
      color: this.color(i, d.color),
      manaSymbol: d.manaSymbol,
    }));
  }

  // ── Stacked bar ───────────────────────────────────────

  get stackedMax(): number {
    return Math.max(...this.stackedData.map(col => col.segments.reduce((s, seg) => s + seg.value, 0)), 1);
  }

  colHeightPct(col: StackedBarEntry): number {
    const total = col.segments.reduce((s, seg) => s + seg.value, 0);
    return (total / this.stackedMax) * 100;
  }

  get stackedLegend(): { manaColor: string; label: string; color: string; total: number }[] {
    const COLOR_ORDER = ['w', 'u', 'b', 'r', 'g', 'm', 'c'];
    const totals = new Map<string, { label: string; color: string; total: number }>();
    for (const col of this.stackedData) {
      for (const seg of col.segments) {
        const existing = totals.get(seg.manaColor) ?? { label: seg.label, color: seg.color, total: 0 };
        totals.set(seg.manaColor, { ...existing, total: existing.total + seg.value });
      }
    }
    return COLOR_ORDER.filter(k => totals.has(k)).map(k => ({ manaColor: k, ...totals.get(k)! }));
  }

  get stackedPieSlices(): PieSlice[] {
    return this.stackedLegend.map(e => ({
      label: e.label,
      value: e.total,
      color: e.color,
      manaSymbol: e.manaColor,
    }));
  }
}
