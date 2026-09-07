import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  CardImplementationApiService,
  DisputedCard,
} from '../../services/card-implementation-api.service';
import { CardDisputeDiffService, JsonLine } from './card-dispute-diff.service';

/** One model's reading, rendered once when the queue loads rather than in a template getter. */
export interface ReadingPanel {
  model: string;
  lines: JsonLine[];
  /** False when the path the server named is not in this reading — worth saying rather than hiding. */
  located: boolean;
}

/** One card in the queue, with both readings ready to look at. */
export interface DisputeRow {
  card: DisputedCard;
  panels: ReadingPanel[];
  /** The model currently being chosen, so its button can say so and the other can be held. */
  choosing: string | null;
  error: string | null;
}

/**
 * The dispute queue: cards whose two translations disagree, and the one screen where a person
 * settles it.
 *
 * A disputed card is not broken — it reaches the table on the honour system either way — so
 * nothing here is urgent, and that is exactly why it needs a queue rather than a log line:
 * without a screen, a disagreement is a status in a file that nobody will ever open again.
 *
 * Desktop only (CARD_ENGINE_PLAN.md, 2026-09-06 — the game is a desktop surface). Two JSON
 * documents side by side is a two-column layout by nature; the phone standard does not apply
 * and the exemption is recorded in tools/check-ui-states.js rather than left as a habit.
 */
@Component({
  selector: 'app-card-disputes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-disputes.component.html',
  styleUrls: ['./card-disputes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDisputesComponent implements OnInit, OnDestroy {
  rows: DisputeRow[] = [];
  loading = true;
  loadFailed = false;

  private readonly api = inject(CardImplementationApiService);
  private readonly diff = inject(CardDisputeDiffService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this.cdr.markForCheck();

    this.subs.add(
      this.api.listDisputed().subscribe({
        next: (cards) => {
          this.rows = cards.map((card) => this.toRow(card));
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.rows = [];
          this.loading = false;
          this.loadFailed = true;
          this.cdr.markForCheck();
        },
      }),
    );
  }

  /**
   * Settles one card.
   *
   * The row leaves the list on success and only on success: the card's status moves off
   * `Disputed` server-side, so a row that stayed would offer the same choice again and a
   * second POST would be answering a question that is no longer open. A refusal keeps the row
   * and says so on it — losing the readings because a request failed would mean re-reading two
   * JSON documents to make the same decision.
   */
  choose(row: DisputeRow, model: string): void {
    if (row.choosing) return;
    row.choosing = model;
    row.error = null;
    this.cdr.markForCheck();

    this.subs.add(
      this.api.chooseReading(row.card.oracleId, model).subscribe({
        next: () => {
          this.rows = this.rows.filter((r) => r !== row);
          this.cdr.markForCheck();
        },
        error: () => {
          row.choosing = null;
          row.error = 'That choice was refused. The card is still disputed.';
          this.cdr.markForCheck();
        },
      }),
    );
  }

  trackRow(_i: number, row: DisputeRow): string {
    return row.card.oracleId;
  }

  trackPanel(_i: number, panel: ReadingPanel): string {
    return panel.model;
  }

  trackLine(i: number): number {
    return i;
  }

  private toRow(card: DisputedCard): DisputeRow {
    const panels = (card.readings ?? []).map((reading) => {
      const lines = this.diff.lines(reading.definitionJson, card.firstDifference);
      return { model: reading.model, lines, located: this.diff.hasDifference(lines) };
    });
    return { card, panels, choosing: null, error: null };
  }
}
