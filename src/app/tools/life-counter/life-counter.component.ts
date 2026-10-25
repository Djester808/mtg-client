import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_LIFE_PRESETS,
  Seat,
} from '../../models/life-counter.models';
import { BreakpointsService } from '../../shared/breakpoints.service';
import { MatchApiService, RecordMatchSeat } from '../../services/match-api.service';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';
import { LifeCounterService } from './life-counter.service';
import { PlayerPanelComponent } from './player-panel/player-panel.component';
import { SeatSheetComponent } from './seat-sheet/seat-sheet.component';

/** Above six seats the numbers have to shrink for the panels to hold anything else. */
const DENSE_FROM = 6;

/**
 * A life counter for a real table.
 *
 * The point of it is the second half of CR 104.3: a game is lost at 0 life, at ten poison
 * counters, at 21 from one commander, or from an empty library — and only the first of
 * those is a life total. Every number here exists because a table currently keeps it on
 * dice, on a scrap of paper, or in someone's head.
 *
 * All the state lives in `LifeCounterService`, which is where the rules are applied and
 * where they are tested. This component is the arrangement: how many panels, which way up,
 * and what happens when the game ends.
 */
@Component({
  selector: 'app-life-counter',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PlayerPanelComponent, SeatSheetComponent],
  templateUrl: './life-counter.component.html',
  styleUrls: ['./life-counter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeCounterComponent {
  private readonly counter = inject(LifeCounterService);
  private readonly matches = inject(MatchApiService);
  private readonly toasts = inject(ToastService);
  private readonly breakpoints = inject(BreakpointsService);

  readonly minPlayers = MIN_PLAYERS;
  readonly maxPlayers = MAX_PLAYERS;
  readonly lifePresets = STARTING_LIFE_PRESETS;
  readonly playerCounts = Array.from(
    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
    (_, i) => MIN_PLAYERS + i,
  );

  readonly seats = this.counter.seats;
  readonly over = this.counter.over;
  readonly winner = this.counter.winner;
  readonly recorded = this.counter.recorded;
  readonly canUndo = this.counter.canUndo;
  readonly hasAccounts = this.counter.hasAccounts;
  readonly storageWarning = this.counter.storageWarning;

  /** Which seat's sheet is open, by id. */
  readonly openSeatId = signal<string | null>(null);
  readonly openSeat = computed(() => this.seats().find((s) => s.id === this.openSeatId()) ?? null);

  /** The setup form. Shown when there is no table, or when one is asked for. */
  readonly settingUp = signal(false);
  setupCount = 4;
  setupLife = 40;

  readonly filing = signal(false);

  readonly showSetup = computed(() => this.settingUp() || this.seats().length === 0);

  /**
   * How many columns the table is dealt into.
   *
   * One column for a duel on a phone, two for anything else, and more only when there is
   * genuine width — eight panels in two columns on a 375px screen is 187px each, which is
   * the width the panel was designed against.
   */
  readonly columns = computed(() => {
    const count = this.seats().length;
    if (this.breakpoints.isNavCollapsed()) return count <= 2 ? 1 : 2;
    if (count <= 3) return count;
    if (count === 4) return 2;
    return count <= 6 ? 3 : 4;
  });

  readonly dense = computed(() => this.seats().length >= DENSE_FROM);

  /**
   * Whether the panels across the table are turned to face the people sitting there.
   *
   * On by default only where the device is plausibly lying flat between players. A desktop
   * monitor stands up, and two upside-down panels on one is nonsense — but it is still a
   * guess about the room, so it is a switch and not a rule.
   */
  readonly flipAcross = signal(true);

  /**
   * Keeps one panel component per seat for the life of the game.
   *
   * The service treats seats as immutable and hands back a new object on every change, so
   * ngFor's default identity tracking sees a different item each tap and rebuilds the
   * panel. The life total still updates — it comes straight off the new input — which is
   * exactly why the rebuild was invisible until a real finger hit a real panel and the
   * delta, the flash and the hold-to-repeat all turned out to be missing.
   */
  trackSeat(_index: number, seat: Seat): string {
    return seat.id;
  }

  /** Which panels are upside down: the rows in the top half of the table. */
  isFlipped(index: number): boolean {
    if (!this.flipAcross() || !this.breakpoints.isNavCollapsed()) return false;
    const cols = this.columns();
    const rows = Math.ceil(this.seats().length / cols);
    return Math.floor(index / cols) < Math.floor(rows / 2);
  }

  // ---- Running the game ------------------------------------------------------------------

  startGame(): void {
    this.counter.newGame(this.setupCount, this.setupLife);
    this.settingUp.set(false);
  }

  openSetup(): void {
    this.setupCount = Math.max(MIN_PLAYERS, this.seats().length || 4);
    this.setupLife = this.counter.startingLife();
    this.settingUp.set(true);
  }

  cancelSetup(): void {
    this.settingUp.set(false);
  }

  adjustLife(seat: Seat, delta: number): void {
    this.counter.adjustLife(seat.id, delta);
  }

  undo(): void {
    this.counter.undo();
  }

  rematch(): void {
    this.counter.rematch();
  }

  // ---- Filing the result --------------------------------------------------------------------

  /**
   * Sends the finished game to the server.
   *
   * Each signed-in seat's own token rides along, which is what lets the server write that
   * seat against that account; a guest's seat is stored as a name and counts for nobody.
   *
   * The endpoint also wants an authenticated *caller*, and a seat supplies it. That is not a
   * detail: the case this whole feature is for is four people around somebody's phone, and it
   * is entirely normal for the person holding it to be signed out while two players sign in
   * at their seats. `authInterceptor` leaves an explicitly-set header alone, so the game is
   * filed by a player who was actually at the table rather than by whoever the browser
   * happens to be signed in as.
   */
  recordResult(): void {
    if (this.filing() || this.recorded()) return;

    const state = this.counter.snapshot();
    const seats: RecordMatchSeat[] = state.seats.map((seat, index) => {
      const won = this.winner()?.id === seat.id;
      return {
        seat: index,
        displayName: seat.name,
        ...(seat.account ? { token: seat.account.token } : {}),
        won,
        lossReason: won ? 'Unspecified' : (LifeCounterService.lossReasonFor(seat) ?? 'Unspecified'),
        finalLife: seat.life,
      };
    });

    this.filing.set(true);

    // Any seat will do as the caller; they have all consented by signing in here.
    const callerToken = state.seats.find((s) => s.account)?.account?.token;

    this.matches
      .record({ startingLife: state.startingLife, startedAt: state.startedAt, seats }, callerToken)
      .subscribe({
        next: (result) => {
          this.filing.set(false);
          // A rematch may have begun while the previous result was being filed.
          if (this.counter.snapshot().startedAt === state.startedAt) this.counter.markRecorded();
          this.toasts.show(
            result.attributedUsernames.length > 0
              ? `Recorded for ${result.attributedUsernames.join(', ')}.`
              : 'Recorded. Nobody at this table was signed in, so it counts for no record.',
            'success',
          );
        },
        error: (err: unknown) => {
          this.filing.set(false);
          // The server's ProblemDetails is written for the person reading it — "the sign-in
          // for seat 3 is no longer valid" is exactly what they need to act on, so it is
          // shown rather than replaced with a generic failure.
          this.toasts.show(describeHttpError(err, 'Could not record that game.'), 'error');
        },
      });
  }
}
