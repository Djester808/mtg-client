import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  Admission,
  CardImplementation,
  CardImplementationApiService,
  admissionFor,
} from '../../services/card-implementation-api.service';

/**
 * Which admission a card in a deck list reaches the table under.
 *
 * The board badges an object from the `enforced` flag the server already decided
 * (`card.component.ts`); this badges a *deck row*, before there is a game, from the card
 * pipeline's status. Same three answers, two different sources, so the rule itself lives in
 * one place — `admissionFor()` in the API service — and neither surface re-decides it.
 *
 * The badge is absent, rather than neutral, while the status is unknown: an answer nobody has
 * yet is not the same claim as "the table plays this by hand", and a deck list that guesses is
 * worse than one that waits. A failed call is the same case — the badge stays away rather than
 * telling a table something the pipeline never said.
 */
@Component({
  selector: 'app-admission-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admission-badge.component.html',
  styleUrls: ['./admission-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdmissionBadgeComponent implements OnChanges, OnDestroy {
  /** The card to badge. Null while a row is still loading its card details. */
  @Input() oracleId?: string | null;

  admission: Admission | null = null;
  tooltip = '';

  private readonly api = inject(CardImplementationApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  ngOnChanges(): void {
    this.sub?.unsubscribe();
    this.admission = null;
    this.tooltip = '';

    const id = this.oracleId;
    if (!id) {
      this.cdr.markForCheck();
      return;
    }

    this.sub = this.api.getImplementation(id).subscribe({
      next: (impl) => this.apply(impl),
      error: () => {
        this.admission = null;
        this.tooltip = '';
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** The glyph, so the two badges are told apart by shape and not by colour alone. */
  get glyph(): string {
    if (this.admission === 'enforced') return '⚙';
    if (this.admission === 'honour-system') return '✋';
    return '⛔';
  }

  private apply(impl: CardImplementation): void {
    this.admission = admissionFor(impl.status);
    this.tooltip = this.tooltipFor(impl);
    this.cdr.markForCheck();
  }

  /**
   * The exclusion reason is the whole point of the refused badge: a card missing from a game
   * with no reason given is a bug report, and the reason is what turns it into a decision
   * somebody made. It is a tooltip rather than a row of text because it is one row in a
   * hundred and it is not news until you ask.
   */
  private tooltipFor(impl: CardImplementation): string {
    switch (admissionFor(impl.status)) {
      case 'enforced':
        return 'Enforced — the engine plays this card.';
      case 'refused':
        return impl.exclusionReason
          ? `Refused — not in the engine: ${impl.exclusionReason}`
          : 'Refused — excluded from the engine.';
      default:
        return impl.status === 'Disputed'
          ? 'Honour system — two readings of this card disagree, so the table plays it by hand.'
          : 'Honour system — this card has no verified reading, so the table plays it by hand.';
    }
  }
}
