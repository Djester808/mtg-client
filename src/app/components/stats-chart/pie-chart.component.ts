import {
  Component, Input, ViewChild, ElementRef,
  AfterViewInit, OnChanges, OnDestroy, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart, DoughnutController, ArcElement, Tooltip, Legend,
  type ChartData, type ChartOptions,
} from 'chart.js';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

export interface PieSlice { label: string; value: number; color: string; manaSymbol?: string }

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pc-wrap">
      <canvas #canvas></canvas>
    </div>
    <div class="pc-legend">
      <div class="pc-legend-row" *ngFor="let s of slices; let i = index">
        <i *ngIf="s.manaSymbol" class="ms ms-cost ms-shadow pc-ms" [ngClass]="'ms-' + s.manaSymbol"></i>
        <span *ngIf="!s.manaSymbol" class="pc-dot" [style.background]="s.color"></span>
        <span class="pc-label">{{ s.label }}</span>
        <span class="pc-pct">{{ pct(s.value) }}%</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pc-wrap { width: 130px; margin: 0 auto 10px; }
    canvas { width: 100% !important; height: auto !important; }
    .pc-legend { display: flex; flex-direction: column; gap: 4px; }
    .pc-legend-row { display: flex; align-items: center; gap: 7px; font-size: 11px; }
    .pc-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
    .pc-ms { font-size: 14px; flex-shrink: 0; }
    .pc-label { flex: 1; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
    .pc-pct { font-size: 10px; font-weight: 700; color: var(--text-primary); }
  `],
})
export class PieChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() slices: PieSlice[] = [];
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  get total(): number { return this.slices.reduce((s, d) => s + d.value, 0) || 1; }

  pct(value: number): number { return Math.round(value / this.total * 100); }

  ngAfterViewInit(): void { this.createChart(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chart) this.syncChart();
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  private createChart(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      data: this.buildData(),
      options: this.buildOptions(),
    });
  }

  private syncChart(): void {
    if (!this.chart) return;
    this.chart.data = this.buildData();
    this.chart.update('none');
  }

  private buildData(): ChartData<'doughnut'> {
    return {
      labels: this.slices.map(s => s.label),
      datasets: [{
        data: this.slices.map(s => s.value),
        backgroundColor: this.slices.map(s => s.color),
        borderColor: 'rgba(0,0,0,0.4)',
        borderWidth: 1.5,
        hoverOffset: 4,
      }],
    };
  }

  private buildOptions(): ChartOptions<'doughnut'> {
    return {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '40%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((ctx.raw as number) / total * 100);
              return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
            },
          },
        },
      },
    };
  }
}
