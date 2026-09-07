import { Injectable } from '@angular/core';
import { CardCoverage, ImplementationStatus } from '../../services/card-implementation-api.service';

/**
 * The five statuses, in the order a card travels them.
 *
 * Not the server's order and not alphabetical: a row of figures that reads left to right as the
 * pipeline runs is the whole point of the row — the leftmost number is the work not started and
 * the rightmost pair are the two ways a card leaves the queue. A status the server did not
 * mention is a zero here rather than a missing column, because a hole in the row would read as
 * "we do not know" when the answer is "none".
 */
export const STATUS_ORDER: readonly ImplementationStatus[] = [
  'Untranslated',
  'Translated',
  'Disputed',
  'Verified',
  'Excluded',
];

/** One status' figure: the count, the bar behind it, and where the figure goes if it goes anywhere. */
export interface StatusFigure {
  status: ImplementationStatus;
  count: number;
  /** 0–100, the share of the ledger this status holds. The bar's width. */
  share: number;
  /**
   * The route this figure links to, or null for a figure that is only a number.
   *
   * Disputed is the only status with a screen that can act on it: the queue where a person
   * settles the disagreement. Linking the others would promise a page that does not exist.
   */
  link: string | null;
}

/** One line of the vocabulary backlog: a primitive the translator could not say, and its cost. */
export interface BacklogLine {
  reason: string;
  cardsBlocked: number;
  /** 0–100 against the *top* blocker, so the first line's bar is full and the rest read against it. */
  share: number;
}

/** The last verification run, with the one number it cannot answer marked as unanswered. */
export interface RunSummary {
  at: string;
  runId: string;
  engineHash: string;
  passed: number;
  /** Derived: `total - passed`. The DTO carries no `Failed`, and this is what it means. */
  failed: number;
  total: number;
  /**
   * Cards the run played nothing for. `VerificationDto` carries no such field, so this is null
   * and the screen says the number is not carried — a zero would read as "every card has
   * scenarios", which during a translation programme is the opposite of the truth.
   */
  withoutScenarios: number | null;
}

/** Everything the dashboard draws, computed once per load rather than in template getters. */
export interface CoverageView {
  total: number;
  figures: StatusFigure[];
  backlog: BacklogLine[];
  run: RunSummary | null;
  /** The ledger holds no cards at all — a different state from "nothing is blocked". */
  empty: boolean;
}

/** Where a Disputed figure sends you. The queue C2 built; this screen only points at it. */
const DISPUTE_QUEUE = '/tools/card-disputes';

/**
 * Turns one `GET /api/cards/coverage` document into the figures, the ranking and the run summary.
 *
 * Pure and injectable so the arithmetic is testable without a DOM, and so the component stays a
 * loader: the two things worth being sure of here — that the row is complete and that the backlog
 * is genuinely ranked — are properties of this function, not of a template.
 */
@Injectable({ providedIn: 'root' })
export class CardCoverageViewService {
  view(coverage: CardCoverage): CoverageView {
    const byStatus = coverage.byStatus ?? {};
    const counted = STATUS_ORDER.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
    // The server's `total` is authoritative for the total, but it is not trusted as the
    // denominator: if the two ever disagree, a share over 100% would draw a bar past its track
    // and the screen would look broken rather than say the numbers disagree.
    const denominator = Math.max(coverage.total ?? 0, counted);

    const figures = STATUS_ORDER.map((status) => ({
      status,
      count: byStatus[status] ?? 0,
      share: denominator > 0 ? ((byStatus[status] ?? 0) / denominator) * 100 : 0,
      link: status === 'Disputed' ? DISPUTE_QUEUE : null,
    }));

    const backlog = this.rank(coverage.primitiveBacklog ?? []);

    return {
      total: coverage.total ?? 0,
      figures,
      backlog,
      run: this.summarise(coverage),
      empty: (coverage.total ?? 0) === 0 && counted === 0,
    };
  }

  /**
   * The backlog, most-blocking first.
   *
   * Re-ranked here rather than taken in the order it arrived: the next vocabulary round is chosen
   * off the top of this list, so the order is the screen's claim and not the transport's. Ties
   * break on the reason alphabetically, which is arbitrary but stable — two reloads of an
   * unchanged ledger must not reshuffle the list a person is reading down.
   */
  private rank(backlog: readonly { reason: string; cardsBlocked: number }[]): BacklogLine[] {
    const sorted = [...backlog].sort(
      (a, b) => b.cardsBlocked - a.cardsBlocked || a.reason.localeCompare(b.reason),
    );
    const top = sorted.length > 0 ? Math.max(sorted[0].cardsBlocked, 0) : 0;
    return sorted.map((line) => ({
      reason: line.reason,
      cardsBlocked: line.cardsBlocked,
      share: top > 0 ? (Math.max(line.cardsBlocked, 0) / top) * 100 : 0,
    }));
  }

  private summarise(coverage: CardCoverage): RunSummary | null {
    const run = coverage.lastVerification;
    if (!run) return null;
    return {
      at: run.at,
      runId: run.runId,
      engineHash: run.engineHash,
      passed: run.passed,
      failed: Math.max(run.total - run.passed, 0),
      total: run.total,
      withoutScenarios: null,
    };
  }
}
