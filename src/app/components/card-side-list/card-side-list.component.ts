import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollectionCardDto } from '../../models/game.models';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';

/**
 * Compact Arena-style list of the cards a deck or collection holds, used as the
 * right-hand sidebar while the search browser occupies the board area (swap mode).
 * Rows are one entry each: count, name over an art-crop strip, mana cost; the
 * quantity controls slide in on hover. A single click expands the row into a full
 * card preview; a quick second click emits `rowOpen` for the host's card modal —
 * the same click language as the grid tiles. The host projects its own header
 * (title, board tabs, exit button) through the `side-list-header` slot.
 */
@Component({
  selector: 'app-card-side-list',
  standalone: true,
  imports: [CommonModule, ManaCostComponent],
  templateUrl: './card-side-list.component.html',
  styleUrls: ['./card-side-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSideListComponent implements OnDestroy {
  @Input() cards: CollectionCardDto[] = [];
  /** Collection context: separate normal/foil counts and control pairs. */
  @Input() foilMode = false;
  @Input() emptyText = 'No cards yet';

  /** Emitted on a quick double click — the host opens its card modal. */
  @Output() rowOpen = new EventEmitter<CollectionCardDto>();
  @Output() rowInc = new EventEmitter<CollectionCardDto>();
  @Output() rowDec = new EventEmitter<CollectionCardDto>();
  @Output() rowIncFoil = new EventEmitter<CollectionCardDto>();
  @Output() rowDecFoil = new EventEmitter<CollectionCardDto>();

  /** Row currently playing its landed-card pulse. */
  pulsedOracleId: string | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Entry whose full-card preview is expanded below its row. */
  expandedId: string | null = null;
  /** Entry whose preview is playing its exit animation before removal. */
  closingId: string | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRowClick: { id: string; time: number } | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  /** Plays the preview's exit animation, then removes it — the mirror of the entrance. */
  private beginCollapse(id: string): void {
    this.closingId = id;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    // Must outlast row-preview-out so the element is not yanked mid-animation.
    this.closeTimer = setTimeout(() => {
      this.closingId = null;
      this.closeTimer = null;
      this.cdr.markForCheck();
    }, 240);
  }

  /**
   * Single click toggles the row's card preview; a second click within the window
   * opens the modal instead (same click-stream detection the grid tiles use).
   */
  onRowClick(card: CollectionCardDto): void {
    const now = performance.now();
    if (this.lastRowClick?.id === card.id && now - this.lastRowClick.time < 350) {
      this.lastRowClick = null;
      if (this.expandedId) this.beginCollapse(this.expandedId);
      this.expandedId = null;
      this.rowOpen.emit(card);
      return;
    }
    this.lastRowClick = { id: card.id, time: now };
    if (this.expandedId === card.id) {
      this.expandedId = null;
      this.beginCollapse(card.id);
    } else {
      if (this.expandedId) this.beginCollapse(this.expandedId);
      this.expandedId = card.id;
      // Reopening a still-closing preview: cancel the exit so it does not vanish.
      if (this.closingId === card.id) {
        this.closingId = null;
        if (this.closeTimer) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
      }
    }
    this.cdr.markForCheck();
  }

  fullImage(card: CollectionCardDto): string | null {
    return card.cardDetails?.imageUriNormal ?? card.cardDetails?.imageUriSmall ?? null;
  }

  /** Pulses the row for an oracle id — the landing acknowledgment for a fly ghost. */
  pulse(oracleId: string): void {
    // Retrigger cleanly if the same row is hit twice in quick succession.
    this.pulsedOracleId = null;
    this.cdr.markForCheck();
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    setTimeout(() => {
      this.pulsedOracleId = oracleId;
      this.cdr.markForCheck();
      this.pulseTimer = setTimeout(() => {
        this.pulsedOracleId = null;
        this.pulseTimer = null;
        this.cdr.markForCheck();
      }, 700);
    });
  }

  ngOnDestroy(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
  }

  trackById(_i: number, card: CollectionCardDto): string {
    return card.id;
  }

  name(card: CollectionCardDto): string {
    return card.cardDetails?.name ?? card.oracleId;
  }

  qty(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  art(card: CollectionCardDto): string | null {
    return card.cardDetails?.imageUriArtCrop ?? card.cardDetails?.imageUriNormal ?? null;
  }
}
