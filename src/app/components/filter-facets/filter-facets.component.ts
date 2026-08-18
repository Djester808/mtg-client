import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterChipsComponent, FilterChip } from '../filter-chips/filter-chips.component';

/**
 * The facet block: colour pips, rarity badges, type chips and CMC chips, arranged.
 *
 * app-filter-chips has long made each ROW render identically everywhere; what was never
 * shared was the arrangement — the card search panel, the deck/collection grid bar and
 * (previously) the forum each laid the same four rows out in their own template, and a
 * pile of global CSS then fought all three into looking alike on a phone. Every one of
 * the mobile filter regressions lived in that gap. This component owns the arrangement,
 * so a host mounts it and cannot diverge:
 *
 *   colours + rarities share the first line · types wrap full-width · CMC last
 *
 * Hosts keep their own state and pass chips/actives straight through — this is a layout
 * component, not a state owner. The set picker and sort controls stay host territory:
 * they genuinely differ per host (custom icon dropdown vs select-menu; the grid bar has
 * no sort), and pretending otherwise is how the last shared bar grew its config surface.
 */
@Component({
  selector: 'app-filter-facets',
  standalone: true,
  imports: [CommonModule, FilterChipsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Phone-only disclosure. Lives IN the component so every host collapses the same
       way with the same pill — a host-side toggle would be the next drift vector. -->
    <button
      type="button"
      class="fx-toggle"
      (click)="collapsed = !collapsed"
      [class.is-collapsed]="collapsed"
      [class.has-active]="hasActive"
      [attr.aria-expanded]="!collapsed"
    >
      <span class="fx-toggle-pill">
        <i class="bi bi-sliders"></i> Filters
        <i class="bi" [class.bi-chevron-up]="!collapsed" [class.bi-chevron-down]="collapsed"></i>
      </span>
    </button>
    <app-filter-chips
      *ngIf="colors.length"
      class="fx-colors"
      data-chips="colors"
      [chips]="colors"
      [active]="activeColors"
      (toggled)="colorsToggled.emit($event)"
    ></app-filter-chips>
    <app-filter-chips
      *ngIf="rarities.length"
      class="fx-rarities"
      data-chips="rarities"
      [chips]="rarities"
      [active]="activeRarities"
      (toggled)="raritiesToggled.emit($event)"
    ></app-filter-chips>
    <app-filter-chips
      *ngIf="types.length"
      class="fx-types"
      data-chips="types"
      [chips]="types"
      [active]="activeTypes"
      (toggled)="typesToggled.emit($event)"
    ></app-filter-chips>
    <div class="fx-last">
      <app-filter-chips
        *ngIf="cmc.length"
        class="fx-cmc"
        data-chips="cmc"
        label="CMC"
        [narrow]="true"
        [chips]="cmc"
        [active]="activeCmc"
        (toggled)="cmcToggled.emit($event)"
      ></app-filter-chips>
      <!-- Host's set picker rides the CMC line — "move the set dropdown up a row". -->
      <ng-content select="[facetTrail]"></ng-content>
    </div>
  `,
  styleUrls: ['./filter-facets.component.scss'],
})
export class FilterFacetsComponent {
  /** Drives the host-level collapse class the stylesheet keys on. */
  @HostBinding('class.is-collapsed') get isCollapsed(): boolean {
    return this.collapsed;
  }

  /**
   * Collapsed tucks the chip rows away behind the pill (phone only — desktop never
   * shows the pill and never collapses). Session-local on purpose; a filter you hid is
   * not a preference.
   */
  collapsed = false;

  get hasActive(): boolean {
    return (
      this.activeColors.size > 0 ||
      this.activeRarities.size > 0 ||
      this.activeTypes.size > 0 ||
      this.activeCmc.size > 0
    );
  }

  @Input() colors: FilterChip[] = [];
  @Input() rarities: FilterChip[] = [];
  @Input() types: FilterChip[] = [];
  @Input() cmc: FilterChip[] = [];

  @Input() activeColors: ReadonlySet<string> = new Set<string>();
  @Input() activeRarities: ReadonlySet<string> = new Set<string>();
  @Input() activeTypes: ReadonlySet<string> = new Set<string>();
  @Input() activeCmc: ReadonlySet<string> = new Set<string>();

  @Output() colorsToggled = new EventEmitter<string>();
  @Output() raritiesToggled = new EventEmitter<string>();
  @Output() typesToggled = new EventEmitter<string>();
  @Output() cmcToggled = new EventEmitter<string>();
}
