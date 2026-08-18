import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rule } from '../../services/rules-api.service';

/**
 * One numbered rule: its text, its worked examples, and its lettered subrules.
 *
 * This markup was written three times before it was written once — the knowledge base
 * rendered it for a rule group and again for a keyword, and the keyword sheet rendered it
 * a third time under `kws-`-prefixed class names with the same geometry at a smaller size.
 * That is the shape duplication actually arrives in here: not a paste, but the same small
 * answer re-derived in three files, which no copy-paste detector would have caught.
 *
 * Callers vary the density through custom properties rather than reaching in, because a
 * host stylesheet cannot touch a component's inner elements through view encapsulation:
 *
 *   app-rule-block { --rule-text-size: 13px; --rule-number-width: 58px; }
 */
@Component({
  selector: 'app-rule-block',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rule-block.component.html',
  styleUrls: ['./rule-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleBlockComponent {
  @Input({ required: true }) rule!: Rule;

  /** Rule number to mark, so a rule opened from a search hit is findable in a group of forty. */
  @Input() highlight: string | null = null;

  isHighlighted(number: string): boolean {
    return this.highlight === number;
  }

  trackByNumber(_: number, rule: Rule): string {
    return rule.number;
  }
}
