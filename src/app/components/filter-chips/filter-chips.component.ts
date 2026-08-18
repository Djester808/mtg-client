import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** A colour swatch backed by a mana symbol, a rarity badge, or a plain text chip. */
export interface FilterChip {
  /** The value reported back on toggle. */
  code: string;
  /** Text for a text chip. Omit for a symbol-only colour chip. */
  label?: string;
  /** Mana-font symbol suffix (`w`, `u`, `multicolor`…) for a colour chip. */
  symbol?: string;
  /** Rarity name (`common`, `rare`…) for a chip drawn in that rarity's colours. */
  rarity?: string;
  title?: string;
}

/**
 * A row of toggleable filter chips.
 *
 * The collection grid and the card search panel had separate copies of this markup and
 * its styles — same shapes, same states, drifting independently. One component keeps
 * them identical and takes the CSS out of two oversized component stylesheets.
 */
@Component({
  selector: 'app-filter-chips',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chip-row">
      <span class="chip-row-label" *ngIf="label">{{ label }}</span>
      <button
        *ngFor="let c of chips; trackBy: trackByCode"
        type="button"
        [class.color-chip]="c.symbol"
        [class.rarity-badge]="c.rarity"
        [ngClass]="c.rarity ? 'rarity-' + c.rarity : ''"
        [class.text-chip]="!c.symbol && !c.rarity"
        [class.is-narrow]="narrow && !c.symbol && !c.rarity"
        [class.is-active]="active.has(c.code)"
        [title]="c.title ?? c.label ?? c.code"
        (click)="toggled.emit(c.code)"
      >
        <i *ngIf="c.symbol" class="ms ms-{{ c.symbol }} ms-cost"></i>
        <ng-container *ngIf="!c.symbol">{{ c.label ?? c.code }}</ng-container>
      </button>
    </div>
  `,
  styleUrls: ['./filter-chips.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterChipsComponent {
  @Input() chips: FilterChip[] = [];
  /** Codes currently switched on. A single-select caller passes a one-entry set. */
  @Input() active: ReadonlySet<string> = new Set<string>();
  @Input() label: string | null = null;
  @Input() narrow = false;

  @Output() toggled = new EventEmitter<string>();

  /**
   * Keyed on the chip's own code, so a caller that builds its list in a getter — the sort
   * direction chip rebuilds its array every change-detection pass to carry the ▲/▼ — reuses
   * the same button instead of tearing it down and making a new one each time.
   */
  trackByCode = (_: number, chip: FilterChip): string => chip.code;
}
