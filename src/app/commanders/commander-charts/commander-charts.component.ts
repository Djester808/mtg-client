import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  CommanderCardEntry,
  CommanderHistoryPoint,
  SimilarCommander,
} from '../../models/commander.models';
import { CommandersApiService } from '../../services/commanders-api.service';
import { CardType } from '../../models/game.models';
import { ManaCostPipe } from '../../pipes/mana-cost.pipe';

type CurveMode = 'bar-v' | 'bar-h';
type TypeMode = 'bar-h' | 'ring';
type HistoryMode = 'bar-v' | 'area';

@Component({
  selector: 'app-commander-charts',
  standalone: true,
  imports: [CommonModule, RouterModule, ManaCostPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commander-charts.component.html',
  styleUrls: ['./commander-charts.component.scss'],
})
export class CommanderChartsComponent implements OnChanges, OnInit {
  @Input() oracleId = '';
  @Input() cards: CommanderCardEntry[] = [];
  @Input() totalDecks = 0;

  history: CommanderHistoryPoint[] = [];
  similar: SimilarCommander[] = [];
  historyLoading = true;
  similarLoading = true;

  manaCurveData: { name: string; value: number }[] = [];
  typeDistData: { name: string; value: number }[] = [];

  // Chart mode toggles
  curveMode: CurveMode = 'bar-v';
  typeMode: TypeMode = 'bar-h';
  historyMode: HistoryMode = 'bar-v';

  get manaCurveMax(): number {
    return Math.max(1, ...this.manaCurveData.map((d) => d.value));
  }
  get typeDistMax(): number {
    return Math.max(1, ...this.typeDistData.map((d) => d.value));
  }
  get historyMax(): number {
    return Math.max(1, ...this.history.map((p) => p.deckCount));
  }
  get typeTotal(): number {
    return this.typeDistData.reduce((s, d) => s + d.value, 0);
  }

  get historyHasData(): boolean {
    return this.history.some((p) => p.deckCount > 0);
  }

  // SVG area path for history line chart
  get historyAreaPath(): string {
    if (!this.history.length) return '';
    const w = 100,
      h = 80;
    const pts = this.history.map((p, i) => {
      const x = (i / (this.history.length - 1)) * w;
      const y = h - (p.deckCount / this.historyMax) * (h - 4);
      return { x, y };
    });
    const line = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    return area;
  }

  get historyLinePath(): string {
    if (!this.history.length) return '';
    const w = 100,
      h = 80;
    return this.history
      .map((p, i) => {
        const x = (i / (this.history.length - 1)) * w;
        const y = h - (p.deckCount / this.historyMax) * (h - 4);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  // CSS conic-gradient string for ring chart
  get ringGradient(): string {
    if (!this.typeDistData.length || !this.typeTotal) return '';
    const colors = ['#c9a84c', '#7a8fa8', '#5c3d6e', '#c44e4e', '#4e8a5c', '#8a7a5c', '#a0a0a0'];
    let pct = 0;
    const stops = this.typeDistData.map((d, i) => {
      const start = pct;
      pct += (d.value / this.typeTotal) * 100;
      return `${colors[i % colors.length]} ${start.toFixed(1)}% ${pct.toFixed(1)}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  readonly typeColors = [
    '#c9a84c',
    '#7a8fa8',
    '#5c3d6e',
    '#c44e4e',
    '#4e8a5c',
    '#8a7a5c',
    '#a0a0a0',
  ];

  constructor(
    private api: CommandersApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (this.oracleId) this.loadRemote();
  }

  ngOnChanges(): void {
    this.buildLocalCharts();
  }

  private loadRemote(): void {
    this.api.getCommanderHistory(this.oracleId).subscribe({
      next: (h) => {
        this.history = h;
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
    });
    this.api.getSimilarCommanders(this.oracleId).subscribe({
      next: (s) => {
        this.similar = s;
        this.similarLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.similarLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private buildLocalCharts(): void {
    const mvMap = new Map<number, number>();
    for (const e of this.cards) {
      const mv = Math.min(e.card.manaValue ?? 0, 7);
      mvMap.set(mv, (mvMap.get(mv) ?? 0) + 1);
    }
    this.manaCurveData = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((mv) => ({ name: mv === 7 ? '7+' : String(mv), value: mvMap.get(mv) ?? 0 }))
      .filter((d) => d.value > 0);

    const typeMap: Record<string, number> = {};
    for (const e of this.cards) {
      const label = this.primaryType(e.card.cardTypes ?? []);
      typeMap[label] = (typeMap[label] ?? 0) + 1;
    }
    this.typeDistData = Object.entries(typeMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    this.cdr.markForCheck();
  }

  private primaryType(types: CardType[]): string {
    const order: CardType[] = [
      CardType.Creature,
      CardType.Instant,
      CardType.Sorcery,
      CardType.Enchantment,
      CardType.Artifact,
      CardType.Planeswalker,
      CardType.Land,
    ];
    for (const t of order) if (types.includes(t)) return t as string;
    return (types[0] as string) ?? 'Other';
  }

  barHeight(value: number, max: number): number {
    return max > 0 ? Math.round((value / max) * 100) : 0;
  }

  pct(value: number): number {
    return this.typeTotal > 0 ? Math.round((value / this.typeTotal) * 100) : 0;
  }

  shortMonth(iso: string): string {
    const [y, m] = iso.split('-');
    return new Date(+y, +m - 1).toLocaleString('en-US', { month: 'short' });
  }

  avgManaValue(): number {
    const nonLands = this.cards.filter((e) => !e.card.cardTypes?.includes(CardType.Land));
    if (!nonLands.length) return 0;
    const sum = nonLands.reduce((s, e) => s + (e.card.manaValue ?? 0) * e.deckCount, 0);
    const total = nonLands.reduce((s, e) => s + e.deckCount, 0);
    return Math.round((sum / total) * 100) / 100;
  }

  colorClass(c: string): string {
    const map: Record<string, string> = {
      W: 'pip-w',
      U: 'pip-u',
      B: 'pip-b',
      R: 'pip-r',
      G: 'pip-g',
      C: 'pip-c',
    };
    return map[c] ?? 'pip-c';
  }

  setCurveMode(m: CurveMode) {
    this.curveMode = m;
    this.cdr.markForCheck();
  }
  setTypeMode(m: TypeMode) {
    this.typeMode = m;
    this.cdr.markForCheck();
  }
  setHistoryMode(m: HistoryMode) {
    this.historyMode = m;
    this.cdr.markForCheck();
  }
}
