import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CardImplementationApiService } from '../../services/card-implementation-api.service';
import {
  BacklogLine,
  CardCoverageViewService,
  CoverageView,
  StatusFigure,
} from './card-coverage-view.service';

/**
 * How far along the card programme is, on one screen.
 *
 * Three questions, in the order they get asked: how much of the corpus is where (the figures),
 * what the next vocabulary round should be about (the backlog, ranked by cards blocked), and
 * whether the last verification run said anything worrying. Nothing here is editable — the one
 * action a reader can take is opening the dispute queue, which is why the Disputed figure is the
 * only one that is a link.
 *
 * Desktop only (CARD_ENGINE_PLAN.md, 2026-09-06), beside C2's dispute queue: it is a maintainer's
 * dashboard for the pipeline, read next to the corpus and the run logs, and the exemption is
 * recorded in tools/check-ui-states.js rather than left as a habit. It is still registered in
 * shoot-states.js so the harness knows the screen exists.
 */
@Component({
  selector: 'app-card-coverage',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './card-coverage.component.html',
  styleUrls: ['./card-coverage.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardCoverageComponent implements OnInit, OnDestroy {
  view: CoverageView | null = null;
  loading = true;
  loadFailed = false;

  private readonly api = inject(CardImplementationApiService);
  private readonly builder = inject(CardCoverageViewService);
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
      this.api.getCoverage().subscribe({
        next: (coverage) => {
          this.view = this.builder.view(coverage);
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          // The view is dropped rather than kept: a stale count on a screen whose whole job is
          // saying where the pipeline is now would be worse than a page that admits it failed.
          this.view = null;
          this.loading = false;
          this.loadFailed = true;
          this.cdr.markForCheck();
        },
      }),
    );
  }

  trackFigure(_i: number, figure: StatusFigure): string {
    return figure.status;
  }

  trackLine(_i: number, line: BacklogLine): string {
    return line.reason;
  }
}
