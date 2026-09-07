import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
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
}

/** One card in the queue, with both readings ready to look at. */
export interface DisputeRow {
  card: DisputedCard;
  panels: ReadingPanel[];
  /** The path the readings first differ at, for the header. Empty when none was found. */
  differenceAt: string;
  /** False when nothing could be located — worth saying rather than hiding. */
  located: boolean;
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
 * **One card at a time, which is what makes it a queue.** Rendering every row's two readings at
 * once produced a page 61,719px tall at 1280 and 120,772px at 375 against the pilot's 105
 * disputed cards, with 198 tap targets on it: two JSON documents are ~420px of scroller each,
 * and a hundred of those is not a screen anyone can use. The names stay in a picker so the
 * length of the queue is still visible at a glance, and settling one advances to the next.
 *
 * Desktop first (CARD_ENGINE_PLAN.md, 2026-09-06 — the game is a desktop surface): two JSON
 * documents side by side is a two-column layout by nature, and the exemption is recorded in
 * tools/check-ui-states.js rather than left as a habit. It still has to be usable at 375, where
 * the readings stack, and one card at a time is what makes that true.
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
  /**
   * The card on screen.
   *
   * Held as the row itself rather than resolved from an id in a getter: the template binds it,
   * so a `find` here would run over the whole queue on every change-detection pass, which is
   * the memoized-getter rule in mtg-client/CLAUDE.md with a hundred rows behind it.
   */
  selected: DisputeRow | null = null;
  loading = true;
  loadFailed = false;

  private readonly api = inject(CardImplementationApiService);
  private readonly diff = inject(CardDisputeDiffService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly subs = new Subscription();
  private reveal: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.reveal) clearTimeout(this.reveal);
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this.cdr.markForCheck();

    this.subs.add(
      this.api.listDisputed().subscribe({
        next: (cards) => {
          this.rows = cards.map((card) => this.toRow(card));
          this.selected = this.rows[0] ?? null;
          this.loading = false;
          this.cdr.markForCheck();
          this.revealDifference();
        },
        error: () => {
          this.rows = [];
          this.selected = null;
          this.loading = false;
          this.loadFailed = true;
          this.cdr.markForCheck();
        },
      }),
    );
  }

  select(row: DisputeRow): void {
    this.selected = row;
    this.cdr.markForCheck();
    this.revealDifference();
  }

  /**
   * Scrolls each reading to the line they differ at.
   *
   * Marking the line is not the same as showing it. A definition runs 200 lines and the panel is
   * 420px of scroller, so on the first card of the live queue the highlight sat around line 60 —
   * off the bottom of both panels, with nothing on screen to say the page had found anything.
   * Two documents to scroll by hand looking for a gold line is the spot-the-difference puzzle
   * this screen exists to remove.
   *
   * Outside Angular and on a timer, because it has to run after the row has rendered and it
   * changes no component state — a `markForCheck` here would be a change-detection pass for a
   * scroll position.
   */
  private revealDifference(): void {
    if (this.reveal) clearTimeout(this.reveal);
    this.zone.runOutsideAngular(() => {
      this.reveal = setTimeout(() => {
        const root = this.host.nativeElement as HTMLElement;
        for (const panel of Array.from(root.querySelectorAll<HTMLElement>('.cd-json'))) {
          const line = panel.querySelector<HTMLElement>('.cd-line.is-diff');
          if (!line) continue;
          // A third of the way down, so the lines above the difference — the context that makes
          // it mean something — are on screen with it.
          panel.scrollTop = Math.max(0, line.offsetTop - panel.clientHeight / 3);
        }
      }, 0);
    });
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
          const at = this.rows.indexOf(row);
          this.rows = this.rows.filter((r) => r !== row);
          // Advance to the next card in the queue, or the last one when this was the last, so
          // settling a card leaves a card to settle rather than an empty pane.
          if (this.selected === row) {
            this.selected = this.rows[Math.min(at, this.rows.length - 1)] ?? null;
          }
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
    const rendering = this.diff.render(card.readings ?? []);
    return {
      card,
      panels: rendering.readings,
      differenceAt: rendering.path,
      located: rendering.lineIndex >= 0,
      choosing: null,
      error: null,
    };
  }
}
