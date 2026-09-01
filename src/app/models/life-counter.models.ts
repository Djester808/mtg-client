/**
 * What a life counter has to keep track of, and why each number is there.
 *
 * Life is the obvious one and the least of it. A game of Magic is lost in five different
 * ways that a table needs a number for (CR 104.3), and three of them are not the life
 * total — which is why a counter that only counts down from 40 is the thing everyone
 * abandons for a pile of dice.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Life totals worth one tap. Commander is 40 (CR 903.7); a duel is 20 (CR 103.3). */
export const STARTING_LIFE_PRESETS = [20, 25, 30, 40, 60] as const;

/**
 * A counter a *player* can have (CR 122.1 — a counter is a marker on an object **or
 * player**). Damage marked on creatures is not here; that is not a thing a table tracks
 * between turns.
 */
export type CounterKind = 'poison' | 'energy' | 'experience' | 'rad' | 'ticket';

export interface CounterSpec {
  kind: CounterKind;
  /** What the tray calls it. */
  label: string;
  /** Two or three characters, for the chip on a 187px-wide panel. */
  short: string;
  /** The rule that says this number exists. Shown so the table can settle an argument. */
  rule: string;
  /** One line on what it does, for the tray. */
  note: string;
  /**
   * Reaching this number loses the game, or null when the counter is only a resource.
   *
   * Only poison has one (CR 704.5c). Energy and experience are spent, not survived.
   */
  lethalAt: number | null;
}

/**
 * The counters, in the order the tray lists them.
 *
 * Poison leads because it is the one that ends games. The rest are resources, and they are
 * here because a Commander table that needs them needs them every turn — an energy player
 * counting on dice is the same problem this whole screen exists to solve.
 */
export const COUNTER_SPECS: readonly CounterSpec[] = [
  {
    kind: 'poison',
    label: 'Poison',
    short: 'PSN',
    rule: 'CR 704.5c',
    note: 'Ten and the player loses. Infect and toxic deal these instead of damage (CR 702.90b).',
    lethalAt: 10,
  },
  {
    kind: 'energy',
    label: 'Energy',
    short: '{E}',
    rule: 'CR 107.14',
    note: 'A resource. Pay {E} by removing one.',
    lethalAt: null,
  },
  {
    kind: 'experience',
    label: 'Experience',
    short: 'XP',
    rule: 'CR 122.1',
    note: 'Never goes down on its own. What the card that gave it says, it does.',
    lethalAt: null,
  },
  {
    kind: 'rad',
    label: 'Rad',
    short: 'RAD',
    rule: 'CR 728.1',
    note: 'Mill this many at your precombat main phase; lose 1 life and shed one rad per nonland milled.',
    lethalAt: null,
  },
  {
    kind: 'ticket',
    label: 'Ticket',
    short: '{TK}',
    rule: 'CR 107.17',
    note: 'A resource. Pay a ticket cost by removing that many.',
    lethalAt: null,
  },
];

/** Twenty-one from a single commander and that player is out (CR 903.10a). */
export const LETHAL_COMMANDER_DAMAGE = 21;

/**
 * How a player left the game. The names match the API's `MatchLossReason`.
 */
export type LossReason =
  | 'Unspecified'
  | 'LifeTotal'
  | 'Poison'
  | 'CommanderDamage'
  | 'EmptyLibrary'
  | 'Effect'
  | 'Conceded';

/** The reasons a player picks by hand. The other three the counter works out for itself. */
export const MANUAL_LOSS_REASONS: readonly { reason: LossReason; label: string; rule: string }[] = [
  { reason: 'EmptyLibrary', label: 'Drew from an empty library', rule: 'CR 704.5b' },
  { reason: 'Effect', label: 'An effect said so', rule: 'CR 104.3e' },
  { reason: 'Conceded', label: 'Conceded', rule: 'CR 104.3a' },
];

/**
 * An account that signed in at this seat.
 *
 * The token is kept because it is the only thing that can prove, when the game is filed,
 * that this player agreed to have it counted. It is held in memory and in the same
 * localStorage the rest of the table state uses — the device already holds the signed-in
 * user's own token there, so this is not a new class of secret on the device.
 */
export interface SeatAccount {
  username: string;
  token: string;
}

/** Where a seat's backdrop came from, so the picker can show what is currently set. */
export type SeatArtSource = 'none' | 'card' | 'upload';

export interface Seat {
  /** Stable for the life of the game; commander damage is keyed by it. */
  id: string;
  name: string;
  life: number;
  counters: Record<CounterKind, number>;
  /**
   * Combat damage taken from each commander, keyed by `commanderKey(seatId, index)`.
   *
   * Per commander, not per player: a player with partners has two, and CR 702.124d says
   * the 21 is counted for each of them separately.
   */
  commanderDamage: Record<string, number>;
  /** How many commanders this player brought — 2 for partners / Background (CR 702.124d). */
  commanders: number;
  /** A backdrop: card art URL, or a data URL from the camera roll. */
  art: string | null;
  artSource: SeatArtSource;
  /** What the art was, so the picker can say "Ashaya" rather than "an image". */
  artLabel: string | null;
  /** Hue for the seat's chrome when it has no art. */
  hue: number;
  account: SeatAccount | null;
  /** Out of the game. Set by the counter for the three it can see, by hand for the rest. */
  out: boolean;
  lossReason: LossReason;
}

export interface LifeCounterState {
  startingLife: number;
  seats: Seat[];
  /** ISO, so it survives a reload and can be sent as the game's start time. */
  startedAt: string;
  /** True once the table has confirmed the result, so the counter stops offering to file it. */
  recorded: boolean;
}

/** The key a seat's commander damage from one particular commander is stored under. */
export function commanderKey(sourceSeatId: string, commanderIndex: number): string {
  return `${sourceSeatId}#${commanderIndex}`;
}
