import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Pip { cls: string; }

@Component({
  selector: 'app-mana-cost',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="mana-cost-row">
      <i *ngFor="let p of pips" class="ms ms-cost ms-shadow" [ngClass]="p.cls"></i>
    </span>
  `,
  styles: [`:host { display: inline-flex; align-items: center; }
            .mana-cost-row { display: inline-flex; gap: 1px; align-items: center; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManaCostComponent {
  pips: Pip[] = [];

  @Input() set cost(val: string | null | undefined) {
    this.pips = val ? parseCost(val) : [];
  }
}

// Map the single-char symbol to the mana-font class suffix
const COLOR_CLASS: Record<string, string> = {
  W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
};

function parseCost(cost: string): Pip[] {
  const pips: Pip[] = [];
  let i = 0;
  while (i < cost.length) {
    if (cost[i] >= '0' && cost[i] <= '9') {
      let num = '';
      while (i < cost.length && cost[i] >= '0' && cost[i] <= '9') num += cost[i++];
      // Generic mana: ms-0, ms-1, ms-2, … ms-16 are valid mana-font classes
      pips.push({ cls: `ms-${num}` });
    } else {
      const sym = cost[i].toUpperCase();
      pips.push({ cls: COLOR_CLASS[sym] ?? 'ms-c' });
      i++;
    }
  }
  return pips;
}
