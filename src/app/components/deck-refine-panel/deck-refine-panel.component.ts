import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiBuilderApiService } from '../../services/ai-builder-api.service';
import { CardSwap } from '../../models/ai-builder.models';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';

/** A proposed swap plus whether the player still wants it. */
interface KeptSwap {
  swap: CardSwap;
  keep: boolean;
}

/**
 * Proposes swaps for a saved deck, and applies only the ones the player keeps.
 *
 * Refine writes in place and there is no undo, so this never calls it for real without
 * asking first. The preview runs the server's whole validation ladder, so the list shown
 * here is what would actually land — not what the model wished for — and accepting costs
 * no second model call.
 */
@Component({
  selector: 'app-deck-refine-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './deck-refine-panel.component.html',
  styleUrls: ['./deck-refine-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckRefinePanelComponent {
  @Input({ required: true }) deckId!: string;
  @Input() bracket = 3;
  @Input() priceRange = 'any';

  @Output() panelClose = new EventEmitter<void>();
  /** Fires once swaps have been written, so the deck can reload. */
  @Output() deckChanged = new EventEmitter<void>();

  /** Nothing asked yet · asking · a proposal to review · writing it. */
  state: 'idle' | 'loading' | 'review' | 'applying' = 'idle';
  error: string | null = null;

  proposals: KeptSwap[] = [];
  rejected: Record<string, number> = {};

  constructor(
    private api: AiBuilderApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  get keptCount(): number {
    return this.proposals.filter((p) => p.keep).length;
  }

  /** Rejections are shown rather than hidden — see the DTO's remarks for why. */
  get rejectedSummary(): string {
    return Object.entries(this.rejected)
      .map(([reason, count]) => `${reason} ×${count}`)
      .join(', ');
  }

  ask(): void {
    if (this.state === 'loading' || this.state === 'applying') return;

    this.state = 'loading';
    this.error = null;
    this.cdr.markForCheck();

    this.api
      .previewRefine(this.deckId, {
        bracket: this.bracket,
        priceRange: this.priceRange,
        maxSwaps: 10,
      })
      .subscribe({
        next: (result) => {
          this.proposals = result.swaps.map((swap) => ({ swap, keep: true }));
          this.rejected = result.rejectedByReason ?? {};
          this.state = 'review';
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.state = 'idle';
          this.error = describeHttpError(err, 'Could not work out any improvements.');
          this.cdr.markForCheck();
        },
      });
  }

  toggle(row: KeptSwap): void {
    row.keep = !row.keep;
    this.cdr.markForCheck();
  }

  apply(): void {
    const swaps = this.proposals.filter((p) => p.keep).map((p) => p.swap);
    if (!swaps.length || this.state === 'applying') return;

    this.state = 'applying';
    this.cdr.markForCheck();

    this.api.applyRefineSwaps(this.deckId, { swaps, bracket: this.bracket }).subscribe({
      next: (result) => {
        this.state = 'idle';
        this.proposals = [];
        this.rejected = result.rejectedByReason ?? {};
        this.toast.show(
          `Swapped ${result.swaps.length} card${result.swaps.length === 1 ? '' : 's'}`,
          'success',
        );
        this.deckChanged.emit();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.state = 'review';
        this.toast.error(describeHttpError(err, 'Could not apply the swaps.'));
        this.cdr.markForCheck();
      },
    });
  }

  discard(): void {
    this.proposals = [];
    this.rejected = {};
    this.state = 'idle';
    this.cdr.markForCheck();
  }

  close(): void {
    this.panelClose.emit();
  }
}
