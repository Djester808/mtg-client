import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  COUNTER_SPECS,
  CounterSpec,
  LETHAL_COMMANDER_DAMAGE,
  LossReason,
  Seat,
} from '../../../models/life-counter.models';
import { LifeCounterService } from '../life-counter.service';

/** How long after the last tap the running total is committed and flies away. */
const SETTLE_MS = 1100;

/** Hold to repeat: the wait before the first repeat, then the gap between them. */
const REPEAT_DELAY_MS = 420;
const REPEAT_FAST_MS = 70;
const REPEAT_SLOW_MS = 160;

/** Repeats at REPEAT_SLOW_MS for this many ticks, then speeds up. */
const REPEAT_ACCELERATE_AFTER = 5;

/** How long the flying delta stays on screen after it is committed. */
const FLY_MS = 780;

/** One counter's badge on the panel. */
interface Chip {
  spec: CounterSpec;
  value: number;
  lethal: boolean;
}

/** Why a seat is out, and the rule that says so. Hoisted so it is not rebuilt every pass. */
const LOSS_LABELS: Record<LossReason, string> = {
  LifeTotal: 'life · CR 704.5a',
  Poison: 'poison · CR 704.5c',
  CommanderDamage: '21 commander · CR 903.10a',
  EmptyLibrary: 'empty library · CR 704.5b',
  Effect: 'an effect · CR 104.3e',
  Conceded: 'conceded · CR 104.3a',
  Unspecified: '',
};

/**
 * One player's square of the table.
 *
 * The whole panel is the control: the left half takes life away, the right half gives it
 * back, and everything else lives behind the one button in the corner. That is not
 * minimalism for its own sake — at eight players a panel is about 180 × 150 CSS pixels, and
 * anything that is not the life total does not survive at that size.
 *
 * Rapid taps accumulate rather than firing one animation each. Losing 9 to a swing is one
 * event at the table and reads as one here: the running total climbs while the finger is
 * down, then commits and flies off.
 */
@Component({
  selector: 'app-player-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-panel.component.html',
  styleUrls: ['./player-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerPanelComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) seat!: Seat;

  /**
   * Turn the panel upside down for a player sitting across the table.
   *
   * The tap zones rotate with the content, so the half nearest each player's own left hand
   * is still the one that takes life away.
   */
  @Input() flipped = false;

  /** Shrinks the type when six or more seats share the screen. */
  @Input() dense = false;

  @Output() lifeChange = new EventEmitter<number>();
  @Output() openSeat = new EventEmitter<void>();

  /** The running total of the taps that have not settled yet. */
  pending = 0;

  /** The committed total, mid-flight. Null when nothing is flying. */
  flying: number | null = null;

  /**
   * Alternates so the CSS animation restarts on every change.
   *
   * Re-assigning the same `animation-name` does not replay it, and the usual fix — remove
   * the class, force a reflow, add it back — is a layout thrash on a surface that is being
   * tapped repeatedly. Two identical keyframes with different names is the cheap version.
   */
  bumpToken = 0;

  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private flyTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTicks = 0;

  readonly lethalCommanderDamage = LETHAL_COMMANDER_DAMAGE;

  // ---- What the panel shows ----------------------------------------------------------

  /** Why this player is out, or null. Derived, so it always agrees with the numbers. */
  get lossReason(): LossReason | null {
    return LifeCounterService.lossReasonFor(this.seat);
  }

  get out(): boolean {
    return this.lossReason !== null;
  }

  /** Why, with the rule that says so — a table settles arguments faster than a phone does. */
  get lossLabel(): string {
    return LOSS_LABELS[this.lossReason ?? 'Unspecified'];
  }

  /**
   * The counters worth a chip: poison always, because it is the one that ends games and a
   * zero there is information, and anything else only once it is on the board.
   */
  get chips(): Chip[] {
    return this.derived().chips;
  }

  /** The worst single commander's tally — the number CR 903.10a cares about. */
  get worstCommanderDamage(): number {
    return this.derived().worst;
  }

  /**
   * Both of the above, computed once per seat object rather than once per change-detection
   * pass. A `*ngFor` over a getter that allocates re-renders the whole chip row every pass,
   * and this panel is under a finger that is generating passes as fast as it can.
   *
   * Keyed on the seat's identity, which is safe because the service never mutates a seat —
   * every change produces a new object.
   */
  private derived(): { chips: Chip[]; worst: number } {
    if (this.cache?.seat === this.seat) return this.cache;

    const chips = COUNTER_SPECS.filter(
      (spec) => spec.kind === 'poison' || this.seat.counters[spec.kind] > 0,
    ).map((spec) => {
      const value = this.seat.counters[spec.kind];
      return { spec, value, lethal: spec.lethalAt !== null && value >= spec.lethalAt };
    });

    this.cache = {
      seat: this.seat,
      chips,
      worst: LifeCounterService.worstCommanderDamage(this.seat),
    };
    return this.cache;
  }

  private cache: { seat: Seat; chips: Chip[]; worst: number } | null = null;

  /** Green while gaining, red while losing, nothing at rest. */
  get mood(): 'gain' | 'loss' | null {
    const delta = this.pending || this.flying;
    if (!delta) return null;
    return delta > 0 ? 'gain' : 'loss';
  }

  get deltaLabel(): string {
    const delta = this.pending || this.flying || 0;
    // A real minus sign, not a hyphen — it is 30px tall on this panel and the hyphen shows.
    return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
  }

  // ---- Tapping ------------------------------------------------------------------------

  /**
   * Pointer events, not mouse events: the whole point of this screen is a phone on a table,
   * and a mousedown handler is simply not there on touch.
   */
  onPointerDown(event: PointerEvent, direction: 1 | -1): void {
    // Only the primary button, and never a second finger mid-hold.
    if (event.button !== 0 || this.repeatTimer !== null) return;

    // No `setPointerCapture` here. The three enders below — up, cancel and leave — already
    // cover a finger that slides off the half it started on, and capturing would only add a
    // call that throws on any pointer id the browser has already released.
    this.apply(direction);

    this.repeatTicks = 0;
    this.repeatTimer = setTimeout(() => this.repeat(direction), REPEAT_DELAY_MS);
  }

  onPointerUp(): void {
    this.stopRepeat();
  }

  /** Keyboard reaches the same behaviour; the tap zones are real buttons. */
  onKey(event: KeyboardEvent, direction: 1 | -1): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.apply(direction);
  }

  private repeat(direction: 1 | -1): void {
    this.apply(direction);
    this.repeatTicks++;
    this.repeatTimer = setTimeout(
      () => this.repeat(direction),
      this.repeatTicks >= REPEAT_ACCELERATE_AFTER ? REPEAT_FAST_MS : REPEAT_SLOW_MS,
    );
  }

  private stopRepeat(): void {
    if (this.repeatTimer !== null) clearTimeout(this.repeatTimer);
    this.repeatTimer = null;
    this.repeatTicks = 0;
  }

  private apply(direction: 1 | -1): void {
    this.lifeChange.emit(direction);

    this.pending += direction;
    this.bumpToken ^= 1;

    // A tap that lands exactly back on zero is a corrected misclick: nothing happened, so
    // nothing should fly away announcing it.
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = this.pending === 0 ? null : setTimeout(() => this.settle(), SETTLE_MS);

    this.cdr.markForCheck();
  }

  private settle(): void {
    this.settleTimer = null;
    this.flying = this.pending;
    this.pending = 0;

    if (this.flyTimer !== null) clearTimeout(this.flyTimer);
    this.flyTimer = setTimeout(() => {
      this.flying = null;
      this.flyTimer = null;
      this.cdr.markForCheck();
    }, FLY_MS);

    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    // A panel can be destroyed mid-hold — eight players down to four is exactly that — and a
    // repeat timer that outlives its component keeps emitting into a dead handler.
    this.stopRepeat();
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    if (this.flyTimer !== null) clearTimeout(this.flyTimer);
  }
}
