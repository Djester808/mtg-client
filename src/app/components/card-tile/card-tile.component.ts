import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollectionCardDto } from '../../models/game.models';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

/**
 * One card's art surface: the image, its flip button, and the click-toggled description
 * overlay — with slots for the chrome each grid puts on top of it.
 *
 * The collection grid, the deck's visual stacks and the deck's free columns each had
 * their own copy of this, including three identical copies of the ~40-line overlay and
 * two flip buttons under different class names (`.flip-btn` and `.thumb-flip`) that had
 * to be styled twice. What differs between the grids is chrome, and chrome is projected:
 *
 *   [tileBadges] — over the art: count pills, ownership marks
 *   [tileBottom] — under it: the hover strip, whose controls differ per grid
 *
 * The tile *frame* stays with the caller: it is the caller's element that carries the
 * drag handlers, the violation classes and the density modifiers, and the deck's
 * reorder code finds its rows by those classes.
 */
@Component({
  selector: 'app-card-tile',
  standalone: true,
  imports: [CommonModule, ManaCostComponent, OracleSymbolsPipe],
  templateUrl: './card-tile.component.html',
  styleUrls: ['./card-tile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardTileComponent {
  @Input({ required: true }) card!: CollectionCardDto;

  /** Front or back art, already resolved by the caller — it owns the flip state. */
  @Input() image: string | null = null;
  @Input() hasBack = false;
  @Input() flipped = false;

  /** The description overlay, toggled by the grid that owns the selection. */
  @Input() showInfo = false;

  @Output() flip = new EventEmitter<MouseEvent>();
  /** A click on the art itself, which the collection grid opens the modal from. */
  @Output() artClick = new EventEmitter<MouseEvent>();

  private typeLineMemo: { card: CollectionCardDto; value: string } | null = null;

  /** Memoized: the overlay binds it, so it runs on every change-detection pass. */
  get typeLine(): string {
    const m = this.typeLineMemo;
    if (m && m.card === this.card) return m.value;
    const value = this.card.cardDetails ? buildTypeLine(this.card.cardDetails) : '';
    this.typeLineMemo = { card: this.card, value };
    return value;
  }

  onFlip(e: MouseEvent): void {
    e.stopPropagation();
    this.flip.emit(e);
  }
}
