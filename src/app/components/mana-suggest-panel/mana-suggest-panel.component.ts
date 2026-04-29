import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollectionCardDto, CardType } from '../../models/game.models';
import { DeckDetailDto } from '../../services/deck-api.service';

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
        // Hybrid pip: count each colored side as 1/n so total = 1 pip
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
    // Plain format: "2WW", "WUBRGC"
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
export class ManaSuggestPanelComponent {
  @Input() deck: DeckDetailDto | null = null;
  @Output() panelClose = new EventEmitter<void>();

  readonly COLOR_LABEL: Record<ManaColor, string> = {
    W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green',
  };

  private readonly ALL_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

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

  private empty(): ManaAnalysis {
    return { currentLands: 0, recommendedLands: 0, landDelta: 0, avgCmc: 0, colorSources: [], tips: [], isEmpty: true };
  }

  private compute(deck: DeckDetailDto): ManaAnalysis {
    const isLand = (c: CollectionCardDto) => c.cardDetails?.cardTypes.includes(CardType.Land) ?? false;
    const qty    = (c: CollectionCardDto) => c.quantity + c.quantityFoil;

    const nonLands   = deck.cards.filter(c => !isLand(c));
    const lands      = deck.cards.filter(c => isLand(c));
    const currentLands = lands.reduce((s, c) => s + qty(c), 0);
    const totalNL      = nonLands.reduce((s, c) => s + qty(c), 0);

    if (totalNL === 0 && currentLands === 0) return this.empty();

    // Avg CMC (non-lands only)
    const avgCmc = totalNL > 0
      ? nonLands.reduce((s, c) => s + (c.cardDetails?.manaValue ?? 0) * qty(c), 0) / totalNL
      : 0;

    // Aggregate colored pip counts weighted by quantity
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

    // Recommended land count based on format and avg CMC
    const isLargeFormat = ['commander', 'brawl', 'oathbreaker'].includes(deck.format ?? '');
    let recommended = isLargeFormat ? 36 : 24;
    if      (avgCmc < 2.0)  recommended -= 2;
    else if (avgCmc < 2.5)  recommended -= 1;
    else if (avgCmc >= 4.0) recommended += 2;
    else if (avgCmc >= 3.5) recommended += 1;

    // Colored source targets: ~88% of recommended lands should be colored
    const coloredSlots = activeColors.length > 0 ? Math.round(recommended * 0.88) : 0;
    const colorSources: ColorSource[] = activeColors
      .map(color => ({
        color,
        pips: Math.round(totalPips[color] * 10) / 10,
        pct:  totalColoredPips > 0 ? totalPips[color] / totalColoredPips : 0,
        recommended: Math.round(coloredSlots * (totalColoredPips > 0 ? totalPips[color] / totalColoredPips : 0)),
      }))
      .sort((a, b) => b.pips - a.pips);

    // Tips
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
      avgCmc, colorSources, tips, isEmpty: false,
    };
  }
}
