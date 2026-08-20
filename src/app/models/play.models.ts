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
  players: PlayerView[];
  battlefield: ObjectView[];
  /** Index 0 is the top of the stack — the next thing to resolve. */
  stack: ObjectView[];
  exile: ObjectView[];
  command: ObjectView[];
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

export interface CreateGameRequest {
  deckId: string;
  opponentUserId: string;
  opponentDeckId: string;
  startingLife: number;
}
