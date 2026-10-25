import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { describeHttpError } from '../../../utils/http-error.utils';
import {
  COUNTER_SPECS,
  CounterKind,
  CounterSpec,
  LETHAL_COMMANDER_DAMAGE,
  LossReason,
  MANUAL_LOSS_REASONS,
  Seat,
  SeatAccount,
  commanderKey,
} from '../../../models/life-counter.models';
import { AuthService } from '../../../services/auth.service';
import { MatchApiService, PlayerRecord } from '../../../services/match-api.service';
import { LifeCounterService } from '../life-counter.service';
import { BackgroundPickerComponent } from '../background-picker/background-picker.component';

/** One opponent commander this seat can be taking damage from. */
interface CommanderSource {
  key: string;
  /** "Nissa" or "Nissa (2nd)" when they have partners. */
  label: string;
  damage: number;
  lethal: boolean;
}

/**
 * Everything about one seat that does not fit on the seat.
 *
 * A full-screen sheet on a phone by design — the panel it belongs to is a couple of
 * hundred pixels square, so this is where the counters, the commander tallies, the
 * backdrop and the sign-in actually live.
 */
@Component({
  selector: 'app-seat-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, BackgroundPickerComponent],
  templateUrl: './seat-sheet.component.html',
  styleUrls: ['./seat-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatSheetComponent implements OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  private recordRequest?: Subscription;
  private readonly counter = inject(LifeCounterService);
  private readonly auth = inject(AuthService);
  private readonly matches = inject(MatchApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) seat!: Seat;

  /** Every seat at the table, so commander damage can list the other players. */
  @Input({ required: true }) allSeats: readonly Seat[] = [];

  @Output() closed = new EventEmitter<void>();

  readonly counterSpecs = COUNTER_SPECS;
  readonly manualLossReasons = MANUAL_LOSS_REASONS;
  readonly lethalCommanderDamage = LETHAL_COMMANDER_DAMAGE;

  /** Which section is expanded. One at a time, so the sheet is never a wall of controls. */
  section: 'counters' | 'commander' | 'seat' = 'counters';

  pickingArt = false;

  // ---- Sign-in ---------------------------------------------------------------------------

  signInOpen = false;
  username = '';
  password = '';
  signingIn = false;
  signInError: string | null = null;

  /**
   * This seat's win/loss record, once it has been asked for.
   *
   * Read with the *seat's* token, not the browser's — several people share this device, and
   * the whole reason to sign in at a seat is to see and move your own numbers.
   */
  record: PlayerRecord | null = null;
  recordFor: string | null = null;

  /**
   * Not `ngOnInit`: at init the seat usually has no account yet, and the sheet stays mounted
   * while somebody signs in at it. `seat` is replaced on every change to the table, so this
   * is the hook that sees a sign-in arrive; `loadRecord` is what keeps it to one request.
   */
  ngOnChanges(): void {
    this.loadRecord();
  }

  get out(): boolean {
    return LifeCounterService.isOut(this.seat);
  }

  /** True only when a player declared it, so "Back in" is not offered for a 0 life total. */
  get declaredOut(): boolean {
    return this.seat.out;
  }

  // ---- Counters ---------------------------------------------------------------------------

  counterValue(kind: CounterKind): number {
    return this.seat.counters[kind];
  }

  isLethal(spec: CounterSpec): boolean {
    return spec.lethalAt !== null && this.seat.counters[spec.kind] >= spec.lethalAt;
  }

  adjustCounter(kind: CounterKind, delta: number): void {
    this.counter.adjustCounter(this.seat.id, kind, delta);
  }

  // ---- Commander damage ----------------------------------------------------------------------

  /**
   * The commanders that can be hitting this player: everyone else's, one row each.
   *
   * Per commander rather than per player because CR 702.124d counts a pair of partners
   * separately — 20 from one and 20 from the other is not a loss, and a tracker that summed
   * them would have called the game.
   */
  get commanderSources(): CommanderSource[] {
    if (this.sourceCache?.seat === this.seat && this.sourceCache.all === this.allSeats) {
      return this.sourceCache.sources;
    }

    const sources: CommanderSource[] = [];

    for (const other of this.allSeats) {
      if (other.id === this.seat.id) continue;

      for (let i = 0; i < other.commanders; i++) {
        const key = commanderKey(other.id, i);
        const damage = this.seat.commanderDamage[key] ?? 0;
        sources.push({
          key,
          label: other.commanders > 1 ? `${other.name} · ${i === 0 ? '1st' : '2nd'}` : other.name,
          damage,
          lethal: damage >= LETHAL_COMMANDER_DAMAGE,
        });
      }
    }

    // Memoized on the two inputs' identity: the sheet renders a row per opponent commander,
    // and the service replaces seat objects rather than mutating them, so `===` is exact.
    this.sourceCache = { seat: this.seat, all: this.allSeats, sources };
    return sources;
  }

  private sourceCache: {
    seat: Seat;
    all: readonly Seat[];
    sources: CommanderSource[];
  } | null = null;

  adjustCommanderDamage(key: string, delta: number): void {
    this.counter.adjustCommanderDamage(this.seat.id, key, delta);
  }

  setCommanderCount(commanders: number): void {
    this.counter.setCommanderCount(this.seat.id, commanders);
  }

  // ---- The seat itself -------------------------------------------------------------------------

  rename(name: string): void {
    this.counter.rename(this.seat.id, name);
  }

  onArtChosen(art: { url: string; source: 'card' | 'upload'; label: string } | null): void {
    if (art === null) this.counter.setArt(this.seat.id, null, 'none', null);
    else this.counter.setArt(this.seat.id, art.url, art.source, art.label);
    this.pickingArt = false;
  }

  declareOut(reason: LossReason): void {
    this.counter.declareOut(this.seat.id, reason);
  }

  rejoin(): void {
    this.counter.rejoin(this.seat.id);
  }

  // ---- Signing this seat in -----------------------------------------------------------------------

  /**
   * Signs a player in **at this seat only**.
   *
   * Deliberately not the app's own session: four people share this device for an evening and
   * whoever opened it is still the one whose collection and decks it shows. The token goes to
   * the seat, is used for exactly one thing — proving to the server that this player agreed to
   * have the game counted — and is dropped when the seat signs out.
   */
  submitSignIn(): void {
    const username = this.username.trim();
    if (!username || !this.password || this.signingIn) return;

    this.signingIn = true;
    this.signInError = null;
    this.cdr.markForCheck();

    const seatId = this.seat.id;
    this.auth
      .login(username, this.password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.signingIn = false;
          this.password = '';
          if (this.seat.id !== seatId) return;

          if (this.counter.isSeated(response.username, this.seat.id)) {
            // The server's spelling, not what was typed: login takes an email address too, so
            // the same account can reach two seats looking like two different people.
            this.signInError = `${response.username} is already sitting at this table.`;
            this.cdr.markForCheck();
            return;
          }

          const account = { username: response.username, token: response.token };
          this.counter.signIn(this.seat.id, account);
          this.signInOpen = false;
          this.username = '';
          // Passed in rather than read back off `this.seat`: the input still holds the seat as
          // it was a moment ago, and the service replaces seats rather than mutating them.
          this.loadRecord(account);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.signingIn = false;
          this.password = '';
          // 401 gets its own wording: the shared helper says "Please sign in again", which is
          // the right sentence everywhere except on the sign-in form itself.
          this.signInError =
            err.status === 401
              ? 'That username or password is not right.'
              : describeHttpError(err, 'Could not sign in.');
          this.cdr.markForCheck();
        },
      });
  }

  signOut(): void {
    this.counter.signOut(this.seat.id);
    this.record = null;
    this.recordFor = null;
  }

  /**
   * Fetches the record for whoever is sitting here, once per account.
   *
   * `recordFor` keeps it to one request per account: the record only moves when a game is
   * filed, and re-opening the sheet mid-game should not go back to the server for it.
   */
  loadRecord(account: SeatAccount | null = this.seat.account): void {
    if (account && this.recordFor === account.username) return;
    this.recordRequest?.unsubscribe();
    this.record = null;
    this.recordFor = account?.username ?? null;
    if (!account) return;
    this.recordRequest = this.matches
      .myRecord(account.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (record) => {
          this.record = record;
          this.cdr.markForCheck();
        },
        // Silent: a record is a nicety on this screen, and a failed fetch must not look like
        // the sign-in itself went wrong.
        error: () => {
          this.recordFor = null;
          this.cdr.markForCheck();
        },
      });
  }
}
