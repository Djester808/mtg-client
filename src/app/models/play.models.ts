/**
 * What a player is allowed to see of a game.
 *
 * Mirrors `MtgEngine.Rules.Views.GameView`, which is the only shape the server ever sends.
 * Hidden information is **absent** here, not flagged: there is no library array to ignore and
 * another player's `hand` is `null` rather than a list of blanks. That is deliberate on the
 * server side, and copying the shape faithfully is what keeps it true on this side — a client
 * model with a `library` field would invite someone to start populating it.
 */
export interface GameView {
  gameId: string;
  /** The player this view was built for. */
  viewer: string;
  turnNumber: number;
  activePlayerId: string;
  /**
   * Where in the turn the game is (CR 500.1).
   *
   * The board needs it because declaring attackers happens before anyone has priority
   * (CR 508.1), so "my turn and I have priority" does not identify the moment.
   */
  currentStep: string;
  /** Attacking creature id → the player it is attacking. */
  attackers: Record<string, string>;
  /** Attacker id → the creatures blocking it. */
  blockers: Record<string, string[]>;
  players: PlayerView[];
  battlefield: ObjectView[];
  /** Index 0 is the top of the stack — the next thing to resolve. */
  stack: ObjectView[];
  exile: ObjectView[];
  command: ObjectView[];
  /** Set while the game is waiting on a decision; nothing else may happen until it is made. */
  choice: ChoiceView | null;
}

/**
 * A decision the game is waiting on.
 *
 * Everyone is told the game has stopped and on whom — a board that freezes with no explanation
 * is the worst thing to show. `options` is populated only for the player being asked, because
 * the options can be hidden information: bottoming after a mulligan lists that player's hand.
 */
export interface ChoiceView {
  id: string;
  playerId: string;
  kind: string;
  prompt: string;
  minPicks: number;
  maxPicks: number;
  /** True when the order of the picks is the answer (CR 603.3b, 616.1). */
  isOrdering: boolean;
  options: ChoiceOptionView[] | null;
}

export interface ChoiceOptionView {
  id: string;
  label: string;
}

export interface PlayerView {
  playerId: string;
  name: string;
  life: number;
  poisonCounters: number;
  /** A count, never a list: nobody may look at a library, including its owner. */
  libraryCount: number;
  handCount: number;
  /** Populated only for the viewer; null for everyone else. */
  hand: ObjectView[] | null;
  graveyard: ObjectView[];
  hasLost: boolean;
  landsPlayedThisTurn: number;
}

/**
 * One object on the board.
 *
 * `printedPower`/`printedToughness` are named for what they are. Current power is the printed
 * value with every continuous effect layered over it, and the server does not send that yet —
 * a field called `power` would be a lie the first time a lord is on the battlefield.
 */
export interface ObjectView {
  id: string;
  name: string;
  oracleId: string;
  controllerId: string;
  manaCost: string | null;
  typeLine: string | null;
  printedPower: number | null;
  printedToughness: number | null;
  isTapped: boolean | null;
  hasSummoningSickness: boolean | null;
  damageMarked: number | null;
  counters: Record<string, number> | null;
}

/** A target as the client names it. Ids only; the server decides whether it is legal. */
export interface TargetDto {
  kind: 'permanent' | 'player' | 'spell' | 'card';
  objectId: string | null;
  playerId: string | null;
}

/** A deck the caller can bring to a game. */
export interface PlayableDeck {
  id: string;
  name: string;
  cardCount: number;
}

/**
 * An invitation to a game.
 *
 * Each player names their own deck — the inviter here, the opponent when they accept — because
 * a deck list is not public and no endpoint hands out somebody else's.
 */
export interface GameInvite {
  id: string;
  fromUserId: string;
  fromUserName: string;
  startingLife: number;
  createdUtc: string;
}

export interface CreateInviteRequest {
  deckId: string;
  opponentUserId: string;
  startingLife: number;
}
