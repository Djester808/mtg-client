import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

export interface PieSlice {
  label: string;
  value: number;
  color: string;
  manaSymbol?: string;
}

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pc-wrap">
      <canvas #canvas></canvas>
    </div>
    <div class="pc-legend">
      <div
        class="pc-legend-row"
        *ngFor="let s of slices; let i = index; trackBy: trackSlice"
        [style.--i]="i"
      >
        <i
          *ngIf="s.manaSymbol"
          class="ms ms-cost ms-shadow pc-ms"
          [ngClass]="'ms-' + s.manaSymbol"
        ></i>
        <span *ngIf="!s.manaSymbol" class="pc-dot" [style.background]="s.color"></span>
        <span class="pc-label">{{ s.label }}</span>
        <span class="pc-pct">{{ pct(s.value) }}%</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .pc-wrap {
        width: 130px;
        margin: 0 auto 10px;
      }
      canvas {
        width: 100% !important;
        height: auto !important;
      }
      .pc-legend {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .pc-legend-row {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 11px;
        animation: pc-fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        animation-delay: calc(var(--i, 0) * 45ms);
      }
      @keyframes pc-fade-up {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      .pc-dot {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        flex-shrink: 0;
      }
      .pc-ms {
        font-size: 14px;
        flex-shrink: 0;
      }
      .pc-label {
        flex: 1;
        color: var(--text-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
      }
      .pc-pct {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-primary);
      }
    `,
  ],
})
export class PieChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() slices: PieSlice[] = [];
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  /** Content signature of the last-rendered slices; see ngOnChanges. */
  private renderedSig = '';

  trackSlice(_: number, s: PieSlice): string {
    return s.label;
  }

  get total(): number {
    return this.slices.reduce((s, d) => s + d.value, 0) || 1;
  }

  pct(value: number): number {
    return Math.round((value / this.total) * 100);
  }

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    // The parent rebuilds the slices array every change-detection pass (which mouse
    // movement triggers), so gate the animated chart update on the content actually
    // changing — updating on identity alone re-animated the doughnut continuously.
    const sig = this.sliceSig();
    if (sig === this.renderedSig) return;
    this.renderedSig = sig;
    if (this.chart) this.syncChart();
  }

  private sliceSig(): string {
    return this.slices.map((s) => `${s.label}:${s.value}:${s.color}`).join('|');
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private createChart(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.renderedSig = this.sliceSig();
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      data: this.buildData(),
      options: this.buildOptions(),
    });
  }

  private syncChart(): void {
    if (!this.chart) return;
    this.chart.data = this.buildData();
    // Animated update: arcs glide to their new angles instead of snapping.
    this.chart.update();
  }

  private buildData(): ChartData<'doughnut'> {
    return {
      labels: this.slices.map((s) => s.label),
      datasets: [
        {
          data: this.slices.map((s) => s.value),
          backgroundColor: this.slices.map((s) => s.color),
          borderColor: 'rgba(0,0,0,0.4)',
          borderWidth: 1.5,
          hoverOffset: 4,
        },
      ],
    };
  }

  private buildOptions(): ChartOptions<'doughnut'> {
    return {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '40%',
      // Sweep the arcs in on creation, close to the app's shared decelerating ease.
      animation: {
        animateRotate: true,
        animateScale: false,
        duration: 650,
        easing: 'easeOutQuint',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round(((ctx.raw as number) / total) * 100);
              return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
            },
          },
        },
      },
    };
  }
}
