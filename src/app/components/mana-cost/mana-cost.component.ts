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

// Map symbol to mana-font class suffix
const COLOR_CLASS: Record<string, string> = {
  W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
  X: 'ms-x', Y: 'ms-y', Z: 'ms-z',
  T: 'ms-tap', Q: 'ms-untap', S: 'ms-s', E: 'ms-e',
};

function parseCost(cost: string): Pip[] {
  const pips: Pip[] = [];

  // Scryfall brace notation: {2}{W}{B}, {W/U}, {2/W}, {W/P}, etc.
  if (cost.includes('{')) {
    const re = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cost)) !== null) {
      const sym = m[1].toUpperCase();
      if (/^\d+$/.test(sym)) {
        pips.push({ cls: `ms-${sym}` });
      } else if (sym.includes('/')) {
        pips.push({ cls: `ms-${sym.replace('/', '').toLowerCase()}` });
      } else {
        pips.push({ cls: COLOR_CLASS[sym] ?? `ms-${sym.toLowerCase()}` });
      }
    }
    return pips;
  }

  // Plain format fallback: 2WW, WUBRGC
  let i = 0;
  while (i < cost.length) {
    if (cost[i] >= '0' && cost[i] <= '9') {
      let num = '';
      while (i < cost.length && cost[i] >= '0' && cost[i] <= '9') num += cost[i++];
      pips.push({ cls: `ms-${num}` });
    } else {
      const sym = cost[i].toUpperCase();
      pips.push({ cls: COLOR_CLASS[sym] ?? 'ms-c' });
      i++;
    }
  }
  return pips;
}
