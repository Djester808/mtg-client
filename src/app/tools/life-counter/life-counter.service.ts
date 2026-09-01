import { Injectable, computed, signal } from '@angular/core';
import {
  COUNTER_SPECS,
  CounterKind,
  LETHAL_COMMANDER_DAMAGE,
  LifeCounterState,
  LossReason,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Seat,
  SeatAccount,
  SeatArtSource,
  commanderKey,
} from '../../models/life-counter.models';

/** The table state, minus the pictures. Small enough to write on every tap. */
const STATE_KEY = 'mtg.life-counter.state.v1';

/** One seat's backdrop, written only when it changes. See the note on `persist`. */
const ART_KEY = 'mtg.life-counter.art.v1.';

/** Deep enough to walk back out of a misread combat, not so deep it holds a session of art. */
const UNDO_DEPTH = 60;

/** Eight hues far enough apart to tell two seats apart at arm's length. */
const SEAT_HUES = [42, 205, 145, 0, 275, 25, 320, 180];

/**
 * Everything the life counter knows, and every rule it applies.
 *
 * Deliberately not in the component. The interesting behaviour here is the three
 * state-based actions the counter can actually see (CR 704.5a, 704.5c, 903.10a) and the
 * fact that commander damage is *also* damage — and those are the parts worth testing
 * without a DOM in the way.
 *
 * Nothing here reaches the network. Filing the result is a separate, explicit step, and a
 * table with nobody signed in never touches the API at all.
 */
@Injectable({ providedIn: 'root' })
export class LifeCounterService {
  private readonly state = signal<LifeCounterState>(this.restore());
  private readonly undoStack: LifeCounterState[] = [];

  /** Non-null when the last art write was refused, e.g. localStorage is full. */
  readonly storageWarning = signal<string | null>(null);

  /** Tracks the stack's height so `canUndo` recomputes — the array itself is not a signal. */
  private readonly undoDepth = signal(0);

  readonly snapshot = this.state.asReadonly();
  readonly seats = computed(() => this.state().seats);
  readonly startingLife = computed(() => this.state().startingLife);
  readonly recorded = computed(() => this.state().recorded);
  readonly canUndo = computed(() => this.undoDepth() > 0);

  /** Seats still in the game. */
  readonly alive = computed(() => this.seats().filter((s) => !LifeCounterService.isOut(s)));

  /**
   * The game is over when at most one player is left (CR 104.2a), or when the last of them
   * left together — everyone losing simultaneously is a draw, not a stuck game.
   */
  readonly over = computed(() => this.seats().length >= MIN_PLAYERS && this.alive().length <= 1);

  /** The last player standing, or null for a draw or a game still running. */
  readonly winner = computed(() => (this.over() ? (this.alive()[0] ?? null) : null));

  /** Whether anyone at the table signed in, i.e. whether filing the result would do anything. */
  readonly hasAccounts = computed(() => this.seats().some((s) => s.account !== null));

  // ---- Reading a seat -------------------------------------------------------------------

  /**
   * Why this seat is out of the game, or null if it is not.
   *
   * Derived rather than stored, so it can never disagree with the numbers on screen. The
   * three the counter works out itself are exactly the state-based actions it has the
   * figures for; anything else is what the player told it.
   */
  static lossReasonFor(seat: Seat): LossReason | null {
    if (seat.out) return seat.lossReason;
    if (seat.life <= 0) return 'LifeTotal';

    for (const spec of COUNTER_SPECS) {
      if (spec.lethalAt !== null && seat.counters[spec.kind] >= spec.lethalAt) {
        return spec.kind === 'poison' ? 'Poison' : 'Effect';
      }
    }

    if (LifeCounterService.worstCommanderDamage(seat) >= LETHAL_COMMANDER_DAMAGE) {
      return 'CommanderDamage';
    }

    return null;
  }

  static isOut(seat: Seat): boolean {
    return LifeCounterService.lossReasonFor(seat) !== null;
  }

  /** The highest total from any single commander — the number CR 903.10a is about. */
  static worstCommanderDamage(seat: Seat): number {
    const totals = Object.values(seat.commanderDamage);
    return totals.length === 0 ? 0 : Math.max(...totals);
  }

  // ---- Starting and ending a game --------------------------------------------------------

  /** Replaces the table. Old seats' pictures go with them. */
  newGame(playerCount: number, startingLife: number): void {
    const count = clamp(playerCount, MIN_PLAYERS, MAX_PLAYERS);
    const previous = this.state().seats;

    // Names, sign-ins and pictures are the tedious part of setting up; a new game between
    // the same people should not ask for them again. Anything past the new seat count is
    // dropped, and its picture with it.
    const seats = Array.from({ length: count }, (_, i) =>
      this.blankSeat(i, startingLife, previous[i]),
    );

    for (const gone of previous.slice(count)) this.forgetArt(gone.id);

    this.undoStack.length = 0;
    this.undoDepth.set(0);
    this.commit(
      {
        startingLife,
        seats,
        startedAt: new Date().toISOString(),
        recorded: false,
      },
      { undoable: false },
    );
  }

  /** Same table, same people, back to the start. */
  rematch(): void {
    this.newGame(this.seats().length, this.startingLife());
  }

  /** Marks the result filed, so the counter stops offering to file it again. */
  markRecorded(): void {
    this.commit({ ...this.state(), recorded: true }, { undoable: false });
  }

  // ---- Life -------------------------------------------------------------------------------

  /**
   * Gains and loses life (CR 118.3). A total of 0 or less loses the game (CR 704.5a), which
   * this does not enforce so much as report — the seat reads as out and the numbers stay
   * editable, because the usual reason a counter shows 0 is that somebody tapped twice.
   */
  adjustLife(seatId: string, delta: number): void {
    if (delta === 0) return;
    this.updateSeat(seatId, (seat) => ({ ...seat, life: seat.life + delta }));
  }

  setLife(seatId: string, life: number): void {
    this.updateSeat(seatId, (seat) => ({ ...seat, life: Math.round(life) }));
  }

  // ---- Counters ----------------------------------------------------------------------------

  /**
   * Adds or removes a player counter (CR 122.1). Never below zero — there is no such thing
   * as negative poison, and a counter that could go negative hides a misclick instead of
   * showing it.
   */
  adjustCounter(seatId: string, kind: CounterKind, delta: number): void {
    if (delta === 0) return;
    this.updateSeat(seatId, (seat) => ({
      ...seat,
      counters: { ...seat.counters, [kind]: Math.max(0, seat.counters[kind] + delta) },
    }));
  }

  // ---- Commander damage ---------------------------------------------------------------------

  /**
   * Records combat damage from one commander, and takes the life with it.
   *
   * The life change is the part hand-rolled trackers get wrong. Commander damage is not a
   * separate kind of damage — it is ordinary combat damage that is *also* tallied per
   * commander (CR 903.10a), so 7 from Kaalia is 7 off the life total and 7 on the tally. A
   * counter that only moved the tally would have the table 21 life out by the end.
   *
   * Poison is the opposite case and is deliberately not wired up this way: infect damage
   * gives counters *instead of* life loss (CR 702.90b).
   */
  adjustCommanderDamage(targetSeatId: string, sourceKey: string, delta: number): void {
    if (delta === 0) return;

    this.updateSeat(targetSeatId, (seat) => {
      const current = seat.commanderDamage[sourceKey] ?? 0;
      const next = Math.max(0, current + delta);
      // Clamping at zero means the applied delta can be smaller than the requested one, and
      // the life change has to match it or a tap on a tally already at 0 would drain life.
      const applied = next - current;

      return {
        ...seat,
        life: seat.life - applied,
        commanderDamage: { ...seat.commanderDamage, [sourceKey]: next },
      };
    });
  }

  /** How much this seat has taken from one particular commander. */
  static damageFrom(seat: Seat, sourceSeatId: string, commanderIndex: number): number {
    return seat.commanderDamage[commanderKey(sourceSeatId, commanderIndex)] ?? 0;
  }

  /**
   * Partners and Backgrounds give a player two commanders, counted separately (CR 702.124d).
   */
  setCommanderCount(seatId: string, commanders: number): void {
    const count = clamp(commanders, 1, 2);
    const current = this.state();

    // Dropping back to one commander leaves every other seat's tally for the second one
    // stranded, and a hidden number that still counts towards 21 is worse than a lost one.
    // Done in the same commit as the count itself, so one tap is one undo.
    const stale = count === 1 ? commanderKey(seatId, 1) : null;

    this.commit({
      ...current,
      seats: current.seats.map((seat) => {
        const withCount = seat.id === seatId ? { ...seat, commanders: count } : seat;
        if (stale === null || !(stale in withCount.commanderDamage)) return withCount;

        const trimmed = { ...withCount.commanderDamage };
        delete trimmed[stale];
        return { ...withCount, commanderDamage: trimmed };
      }),
    });
  }

  // ---- The seat itself ------------------------------------------------------------------------

  rename(seatId: string, name: string): void {
    const trimmed = name.trim().slice(0, 40);
    this.updateSeat(seatId, (seat) => ({ ...seat, name: trimmed || seat.name }));
  }

  setArt(seatId: string, art: string | null, source: SeatArtSource, label: string | null): void {
    this.storageWarning.set(null);
    this.updateSeat(seatId, (seat) => ({ ...seat, art, artSource: source, artLabel: label }));

    if (art === null) this.forgetArt(seatId);
    else this.writeArt(seatId, art);
  }

  signIn(seatId: string, account: SeatAccount): void {
    this.updateSeat(seatId, (seat) => ({
      ...seat,
      account,
      // The account's name is the one that will end up on the record, so the seat wears it.
      name: account.username,
    }));
  }

  signOut(seatId: string): void {
    this.updateSeat(seatId, (seat) => ({ ...seat, account: null }));
  }

  /** True when this account already holds another seat — one player, one seat per game. */
  isSeated(username: string, exceptSeatId: string): boolean {
    const wanted = username.toLowerCase();
    return this.seats().some(
      (s) => s.id !== exceptSeatId && s.account?.username.toLowerCase() === wanted,
    );
  }

  /** Takes a player out for a reason the counter cannot see for itself (CR 104.3a/c/e). */
  declareOut(seatId: string, reason: LossReason): void {
    this.updateSeat(seatId, (seat) => ({ ...seat, out: true, lossReason: reason }));
  }

  /** Undoes a hand-declared exit. Does nothing to one the numbers imply. */
  rejoin(seatId: string): void {
    this.updateSeat(seatId, (seat) => ({ ...seat, out: false, lossReason: 'Unspecified' }));
  }

  // ---- Undo ------------------------------------------------------------------------------------

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.undoDepth.set(this.undoStack.length);
    this.state.set(previous);
    this.persist(previous);
  }

  // ---- Plumbing ----------------------------------------------------------------------------------

  private updateSeat(seatId: string, change: (seat: Seat) => Seat): void {
    const current = this.state();
    const seats = current.seats.map((seat) => (seat.id === seatId ? change(seat) : seat));
    this.commit({ ...current, seats });
  }

  private commit(next: LifeCounterState, opts: { undoable?: boolean } = {}): void {
    if (opts.undoable !== false) {
      this.undoStack.push(this.state());
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
      this.undoDepth.set(this.undoStack.length);
    }
    this.state.set(next);
    this.persist(next);
  }

  private blankSeat(index: number, startingLife: number, keep: Seat | undefined): Seat {
    return {
      id: keep?.id ?? seatId(index),
      name: keep?.name ?? `Player ${index + 1}`,
      life: startingLife,
      counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
      commanderDamage: {},
      commanders: keep?.commanders ?? 1,
      art: keep?.art ?? null,
      artSource: keep?.artSource ?? 'none',
      artLabel: keep?.artLabel ?? null,
      hue: SEAT_HUES[index % SEAT_HUES.length],
      account: keep?.account ?? null,
      out: false,
      lossReason: 'Unspecified',
    };
  }

  /**
   * Writes the table, with the pictures held back.
   *
   * The split is not tidiness. A seat's backdrop is a downscaled JPEG data URL of a few
   * hundred KB, and eight of them inline would mean re-serialising well over a megabyte on
   * every single tap of a life total. They go to their own keys, written once when chosen.
   */
  private persist(state: LifeCounterState): void {
    try {
      const light = {
        ...state,
        seats: state.seats.map((seat) => ({ ...seat, art: null })),
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(light));
    } catch {
      // A private-mode browser with no storage should still count life.
    }
  }

  private writeArt(seatId: string, art: string): void {
    try {
      localStorage.setItem(ART_KEY + seatId, art);
    } catch {
      // The picture is on screen either way; it just will not survive a reload. Saying so
      // beats a backdrop that silently vanishes on the next load.
      this.storageWarning.set(
        'That picture is set for this game, but there was no room to save it — it will be gone if the page reloads.',
      );
    }
  }

  private forgetArt(seatId: string): void {
    try {
      localStorage.removeItem(ART_KEY + seatId);
    } catch {
      // Nothing to do, and nothing depends on it.
    }
  }

  private restore(): LifeCounterState {
    const empty: LifeCounterState = {
      startingLife: 40,
      seats: [],
      startedAt: new Date().toISOString(),
      recorded: false,
    };

    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return empty;

      // Typed as partial on purpose. This came off disk, written by whatever version of the
      // counter the browser last ran, so every field is a claim rather than a guarantee —
      // and a missing counter kind that a later version added would otherwise put an
      // `undefined` straight into an arithmetic path.
      const parsed = JSON.parse(raw) as StoredState;
      if (!Array.isArray(parsed?.seats)) return empty;

      const startingLife = parsed.startingLife ?? 40;

      return {
        startingLife,
        startedAt: parsed.startedAt ?? empty.startedAt,
        recorded: parsed.recorded === true,
        seats: parsed.seats.slice(0, MAX_PLAYERS).map((seat, i) => {
          const blank = this.blankSeat(i, startingLife, undefined);
          return {
            ...blank,
            ...seat,
            counters: { ...blank.counters, ...seat.counters },
            commanderDamage: seat.commanderDamage ?? {},
            art: seat.id ? this.readArt(seat.id) : null,
          };
        }),
      };
    } catch {
      return empty;
    }
  }

  private readArt(seatId: string): string | null {
    try {
      return localStorage.getItem(ART_KEY + seatId);
    } catch {
      return null;
    }
  }
}

/** The table as it comes back off disk: the right shape, none of it promised. */
type StoredState = Partial<Omit<LifeCounterState, 'seats'>> & {
  seats?: (Partial<Omit<Seat, 'counters'>> & { counters?: Partial<Record<CounterKind, number>> })[];
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

/**
 * A seat id that is stable within a game and unique across them.
 *
 * Not `crypto.randomUUID()` only because commander-damage keys are built from it and a
 * readable one makes a stored table legible; the timestamp is what keeps two games' seats
 * from sharing a saved picture.
 */
function seatId(index: number): string {
  return `s${index}-${Date.now().toString(36)}`;
}
