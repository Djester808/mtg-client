import {
  Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy,
  SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { CollectionCardDto, CardType } from '../../models/game.models';
import { DeckDetailDto, DeckApiService, ManaFineTuneDto } from '../../services/deck-api.service';

type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export interface ColorSource {
  color: ManaColor;
  pips: number;
  pct: number;
  recommended: number;
}

export interface ManaAnalysis {
  currentLands: number;
  recommendedLands: number;
  landDelta: number;
  avgCmc: number;
  colorSources: ColorSource[];
  tips: string[];
  isEmpty: boolean;
  landReason: string;
}

function countPips(manaCost: string): Partial<Record<ManaColor, number>> {
  const counts: Partial<Record<ManaColor, number>> = {};
  const colors = new Set<string>(['W', 'U', 'B', 'R', 'G']);

  if (manaCost.includes('{')) {
    const re = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(manaCost)) !== null) {
      const sym = m[1].toUpperCase();
      if (sym.includes('/')) {
        const parts = sym.split('/').filter(p => colors.has(p));
        if (parts.length > 0) {
          for (const p of parts)
            counts[p as ManaColor] = (counts[p as ManaColor] ?? 0) + 1 / parts.length;
        }
      } else if (colors.has(sym)) {
        counts[sym as ManaColor] = (counts[sym as ManaColor] ?? 0) + 1;
      }
    }
  } else {
    for (const ch of manaCost.toUpperCase()) {
      if (colors.has(ch))
        counts[ch as ManaColor] = (counts[ch as ManaColor] ?? 0) + 1;
    }
  }
  return counts;
}

@Component({
  selector: 'app-mana-suggest-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mana-suggest-panel.component.html',
  styleUrls: ['./mana-suggest-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManaSuggestPanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input() deck: DeckDetailDto | null = null;
  @Output() panelClose = new EventEmitter<void>();

  readonly COLOR_LABEL: Record<ManaColor, string> = {
    W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green',
  };

  private readonly ALL_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

  fineTuneState: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  fineTuneResult: ManaFineTuneDto | null = null;

  private readonly deckChange$ = new Subject<DeckDetailDto>();
  private sub!: Subscription;

  constructor(private deckApi: DeckApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.deckChange$.pipe(
      debounceTime(1200),
      distinctUntilChanged((a, b) => this.deckKey(a) === this.deckKey(b)),
      switchMap(deck => {
        const a = this.compute(deck);
        if (a.isEmpty) return [];

        this.fineTuneState = 'loading';
        this.fineTuneResult = null;
        this.cdr.markForCheck();

        return this.deckApi.getManaFineTune({
          format:           deck.format ?? '',
          deckCardNames:    deck.cards.map(c => c.cardDetails?.name ?? '').filter(Boolean),
          currentLands:     a.currentLands,
          recommendedLands: a.recommendedLands,
          avgCmc:           a.avgCmc,
          activeColors:     a.colorSources.map(cs => cs.color),
        });
      }),
    ).subscribe({
      next: result => {
        this.fineTuneResult = result;
        this.fineTuneState  = 'done';
        this.cdr.markForCheck();
      },
      error: () => {
        this.fineTuneState = 'error';
        this.cdr.markForCheck();
      },
    });

    // ngOnChanges fires before ngOnInit, so the initial deck push was emitted
    // before the subscription above existed. Re-push it now.
    if (this.deck) {
      this.deckChange$.next(this.deck);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['deck'] && this.deck) {
      this.deckChange$.next(this.deck);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get analysis(): ManaAnalysis {
    return this.deck ? this.compute(this.deck) : this.empty();
  }

  get landDeltaLabel(): string {
    const d = this.analysis.landDelta;
    if (d === 0) return 'Land count looks good';
    return d > 0 ? `+${d} more lands suggested` : `${Math.abs(d)} fewer lands suggested`;
  }

  get landDeltaClass(): string {
    const d = this.analysis.landDelta;
    if (d === 0) return 'delta--ok';
    return d > 0 ? 'delta--low' : 'delta--high';
  }

  barPct(cs: ColorSource): number {
    return Math.round(cs.pct * 100);
  }

  close(): void { this.panelClose.emit(); }

  private deckKey(deck: DeckDetailDto): string {
    return deck.cards.map(c => `${c.cardDetails?.name ?? c.oracleId}:${c.quantity + c.quantityFoil}`).sort().join('|')
      + '|' + (deck.format ?? '');
  }

  private empty(): ManaAnalysis {
    return { currentLands: 0, recommendedLands: 0, landDelta: 0, avgCmc: 0, colorSources: [], tips: [], isEmpty: true, landReason: '' };
  }

  private compute(deck: DeckDetailDto): ManaAnalysis {
    const isLand = (c: CollectionCardDto) => c.cardDetails?.cardTypes.includes(CardType.Land) ?? false;
    const qty    = (c: CollectionCardDto) => c.quantity + c.quantityFoil;

    const nonLands   = deck.cards.filter(c => !isLand(c));
    const lands      = deck.cards.filter(c => isLand(c));
    const currentLands = lands.reduce((s, c) => s + qty(c), 0);
    const totalNL      = nonLands.reduce((s, c) => s + qty(c), 0);

    if (totalNL === 0 && currentLands === 0) return this.empty();

    const avgCmc = totalNL > 0
      ? nonLands.reduce((s, c) => s + (c.cardDetails?.manaValue ?? 0) * qty(c), 0) / totalNL
      : 0;

    const totalPips: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const card of nonLands) {
      const cost = card.cardDetails?.manaCost ?? '';
      if (!cost) continue;
      const pips = countPips(cost);
      for (const [color, count] of Object.entries(pips) as [ManaColor, number][])
        totalPips[color] += count * qty(card);
    }

    const totalColoredPips = this.ALL_COLORS.reduce((s, c) => s + totalPips[c], 0);
    const activeColors     = this.ALL_COLORS.filter(c => totalPips[c] > 0);

    const isLargeFormat = ['commander', 'brawl', 'oathbreaker'].includes(deck.format ?? '');
    const formatLabel = isLargeFormat ? 'Commander base: 36' : 'Standard base: 24';
    let recommended = isLargeFormat ? 36 : 24;
    let cmcAdjust = 0;
    if      (avgCmc < 2.0)  { recommended -= 2; cmcAdjust = -2; }
    else if (avgCmc < 2.5)  { recommended -= 1; cmcAdjust = -1; }
    else if (avgCmc >= 4.0) { recommended += 2; cmcAdjust = +2; }
    else if (avgCmc >= 3.5) { recommended += 1; cmcAdjust = +1; }

    const cmcPart = cmcAdjust !== 0
      ? `${cmcAdjust > 0 ? '+' : ''}${cmcAdjust} for ${cmcAdjust > 0 ? 'high' : 'low'} curve (${avgCmc.toFixed(1)} avg CMC)`
      : `no adjustment (${avgCmc.toFixed(1)} avg CMC)`;
    const landReason = `${formatLabel} lands, ${cmcPart}`;

    const coloredSlots = activeColors.length > 0 ? Math.round(recommended * 0.88) : 0;
    const colorSources: ColorSource[] = activeColors
      .map(color => ({
        color,
        pips: Math.round(totalPips[color] * 10) / 10,
        pct:  totalColoredPips > 0 ? totalPips[color] / totalColoredPips : 0,
        recommended: Math.round(coloredSlots * (totalColoredPips > 0 ? totalPips[color] / totalColoredPips : 0)),
      }))
      .sort((a, b) => b.pips - a.pips);

    const tips: string[] = [];
    if (avgCmc >= 4.0)
      tips.push(`High curve (avg ${avgCmc.toFixed(1)} CMC) — target ${recommended} lands and 10–12 ramp pieces.`);
    else if (avgCmc >= 3.5)
      tips.push(`Moderate-heavy curve (avg ${avgCmc.toFixed(1)} CMC) — aim for 8–10 ramp pieces.`);
    else if (avgCmc <= 2.0 && totalNL > 0)
      tips.push(`Aggressive curve (avg ${avgCmc.toFixed(1)} CMC) — fewer lands are viable; lean into 1-drops.`);

    if (activeColors.length >= 4)
      tips.push('4+ color deck — fetch lands and triomes greatly improve consistency.');
    else if (activeColors.length === 3)
      tips.push('3 color deck — shock lands, pain lands, and tri-lands smooth your mana base.');

    if (totalNL > 0 && recommended - currentLands > 5)
      tips.push(`Land count is quite low — adding ${recommended - currentLands} more lands is strongly advised.`);

    return {
      currentLands, recommendedLands: recommended, landDelta: recommended - currentLands,
      avgCmc, colorSources, tips, isEmpty: false, landReason,
    };
  }
}
