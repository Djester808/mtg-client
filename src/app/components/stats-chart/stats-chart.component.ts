import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PieChartComponent, PieSlice } from './pie-chart.component';

export interface ChartEntry {
  label: string;
  value: number;
  color?: string;
  manaSymbol?: string;
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
  @Input() type: 'bar' | 'vbar' | 'pie' = 'bar';

  private readonly PALETTE = [
    '#f87171',
    '#fb923c',
    '#fbbf24',
    '#86efac',
    '#34d399',
    '#67e8f9',
    '#818cf8',
    '#e879f9',
    '#f472b6',
    '#a78bfa',
  ];

  // ── Common ────────────────────────────────────────────

  // The parent rebuilds the data arrays on every change-detection pass, so without
  // label-keyed tracking every ngFor row is torn down and recreated constantly —
  // invisible before, but a permanent flicker once rows carry entrance animations.
  trackEntry(_: number, d: ChartEntry): string {
    return d.label;
  }

  get max(): number {
    return Math.max(...this.data.map((d) => d.value), 1);
  }

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
}
