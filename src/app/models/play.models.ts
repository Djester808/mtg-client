/**
 * What a player is allowed to see of a game.
 *
 * Mirrors `MtgEngine.Rules.Views.GameView`, which is the only shape the server ever sends.
 * Hidden information is **absent** here, not flagged: there is no library array to ignore and
 * another player's `hand` is `null` rather than a list of blanks. That is deliberate on the
 * server side, and copying the shape faithfully is what keeps it true on this side — a client
 * model with a `library` field would invite someone to start populating it.
 */
/**
 * What a creature is attacking: a player, or a planeswalker that player controls (CR 508.1b).
 *
 * The defending player is carried either way — trample past a planeswalker, and a planeswalker
 * that leaves combat, both need to know whose it was.
 */
export interface AttackTarget {
  defendingPlayer: string;
  /** Absent or null when the player is being attacked directly. */
  planeswalker?: string | null;
}

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
  /**
   * Who may act right now, or null when nobody has priority (CR 117.1).
   *
   * Null during untap (CR 502.4), cleanup (CR 514.3), and while something resolves
   * (CR 117.2e). The board uses it to say whether you are acting or waiting, rather than
   * offering an action the server will refuse.
   */
  priorityPlayerId: string | null;
  /** Attacking creature id → what it is attacking (CR 508.1b). */
  attackers: Record<string, AttackTarget>;
  /**
   * Whether attackers have been declared this combat (CR 508.1).
   *
   * Not the same question as "are there any attackers": declaring none is a declaration, and
   * leaves `attackers` as empty as not having declared yet.
   */
  attackersDeclared: boolean;
  /** Whether blockers have been declared this combat (CR 509.1). */
  blockersDeclared: boolean;
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
  /**
   * True when the answer is an amount per option rather than a selection (CR 510.1c).
   *
   * Dividing combat damage is answered by picking a blocker once per point, so the same option
   * is picked repeatedly — which is a mistake everywhere else and the whole mechanism here.
   */
  isDivision: boolean;
  /** How much is being divided, for a division. */
  totalToDivide: number;
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
  /**
   * The top card of this player's library, when something lets them see it (CR 401.2).
   *
   * Null for everyone else, always: a card that reveals or peeks is answered here rather than
   * sent and trusted to be hidden by the client, which is the cheating vector the server-side
   * projection exists to close.
   */
  topOfLibrary: ObjectView | null;
  handCount: number;
  /** Populated only for the viewer; null for everyone else. */
  hand: ObjectView[] | null;
  /**
   * The cards in this hand that everybody has been shown (CR 701.16a).
   *
   * Separate from `hand`, which is null for anyone but its owner. A reveal makes particular
   * cards public without making the hand public, and the two are different facts.
   */
  revealedHand: ObjectView[];
  graveyard: ObjectView[];
  hasLost: boolean;
  landsPlayedThisTurn: number;
  /**
   * Combat damage taken from each commander, by that commander's name (CR 903.10a).
   *
   * Public on purpose: everyone at the table needs to know how close a commander is to
   * twenty-one, because it changes every block.
   */
  commanderDamage: Record<string, number>;
  /** This player's commander, if the game has them (CR 903.3). */
  commanderName: string | null;
  /**
   * Mana available, by symbol — `W`, `U`, `B`, `R`, `G`, `C` (CR 106.4).
   *
   * Public, and kinds the player has none of are absent rather than zero.
   */
  manaPool: Record<string, number>;
  /**
   * Mana that may only be spent on some things, one entry per mana (CR 106.6).
   *
   * Separate from `manaPool` on purpose: adding the two together would tell a player they
   * could pay for something they cannot. Each entry names what the mana may be spent on in the
   * card's own words, so a board can show the restriction without knowing the vocabulary
   * behind it.
   */
  restrictedMana: RestrictedManaView[];
}

/** One mana that may only be spent on some things (CR 106.6). */
export interface RestrictedManaView {
  /** The mana symbol: `W`, `U`, `B`, `R`, `G` or `C`. */
  symbol: string;
  /** What it may be spent on, e.g. "creature spells". */
  spendableOn: string;
}

/**
 * One object on the board.
 *
 * `printedPower`/`printedToughness` are named for what they are. Current power is the printed
 * value with every continuous effect layered over it, and the server does not send that yet —
 * a field called `power` would be a lie the first time a lord is on the battlefield.
 */
/** One activated ability the engine says this object has (CR 602.1). */
export interface AbilityView {
  id: string;
  text: string;
  requiresTap: boolean;
  targetCount: number;
  isManaAbility: boolean;
  /**
   * Whether its cost contains {X}, so the board asks for a number first (CR 601.2b).
   *
   * Activating it as a plain button sends an X of zero, which the engine charges correctly and
   * which is nothing at all: a storage land taps for no mana, and "remove X counters" removes
   * none. The number travels *with* the activation, so it has to be named before it is sent.
   */
  announcesVariable: boolean;
  /**
   * A printed timing restriction, as the engine names it (CR 602.5d). Absent means any time.
   *
   * The engine still enforces it; this is the courtesy copy, and where the two disagree the
   * board is wrong.
   */
  timing?: string | null;
  /**
   * Costs the player has to pick cards for before activating (CR 601.2f).
   *
   * The payment travels *with* the activation: an ability whose cost is "Sacrifice a creature"
   * cannot be activated by clicking it, and a board that offered it as a plain button would
   * send an activation the engine refuses.
   */
  costChoices?: CostChoiceView[];
}

/** One cost the player picks cards for, as the board needs to ask it (CR 601.2f). */
export interface CostChoiceView {
  /** Sacrifice, discard, or discard at random. */
  kind: string;
  /** How many cards to pick — or the fewest, when `countIsChosen` says the card asks. */
  count: number;
  /** What qualifies, for the prompt. Null means any card in hand. */
  description: string | null;
  /** True for "Sacrifice X Treasures" and its relatives: the board asks for a number first. */
  countIsChosen: boolean;
}

export interface ObjectView {
  id: string;
  /** What it can be asked to do. Absent on anything with nothing to activate. */
  abilities?: AbilityView[];
  name: string;
  oracleId: string;
  controllerId: string;
  manaCost: string | null;
  typeLine: string | null;
  /** What the card does, so a player can read it instead of knowing it. */
  oracleText: string | null;
  /** Cropped art, for the card as it sits on the battlefield. */
  artUri: string | null;
  /** The whole card, for reading it. */
  imageUri: string | null;
  /** Whether it is a planeswalker, and so something that can be attacked (CR 508.1b). */
  isPlaneswalker: boolean;
  /**
   * Whether it is a creature (CR 508.1a).
   *
   * Not a claim that it can attack — tapped status, summoning sickness and the card's own
   * restrictions are the engine's to judge. It is enough to stop the board offering a land.
   */
  isCreature: boolean;
  /** Whether it is a land, which is what a card face is coloured by first. */
  isLand: boolean;
  /** Whether this is a battle, so a client can offer it as something to attack (CR 310.5). */
  isBattle: boolean;
  /** The player protecting this battle (CR 310.9), or null while nobody is designated. */
  protectorId: string | null;
  /**
   * The permanent this is attached to, for an Aura or Equipment (CR 303.4, 704.5m). Null off
   * the battlefield and for anything not attached to another permanent.
   */
  attachedTo: string | null;
  /** The player this is attached to, for an Aura that enchants one (CR 303.4a). */
  attachedToPlayer: string | null;
  /**
   * Whether casting this asks the caster for a number first (CR 601.2b).
   *
   * `AbilityView.announcesVariable` one surface along, and not derivable from `manaCost`: Harvest
   * Pyre is {1}{R} and exiles X cards from its caster's graveyard, so a board reading the printed
   * mana for an {X} finds none, casts for zero, exiles nothing and deals no damage.
   */
  announcesVariable: boolean;
  /** The card's colours, for the frame it is drawn in. */
  colors: string[];
  printedPower: number | null;
  printedToughness: number | null;
  isTapped: boolean | null;
  hasSummoningSickness: boolean | null;
  damageMarked: number | null;
  counters: Record<string, number> | null;
  /**
   * The cards under this one, when the permanent is a stack of them (CR 730.2) — mutate.
   *
   * Empty for every ordinary permanent. Top-first, matching the physical stack.
   */
  mergedUnder: MergedCardView[];
  /**
   * Whether the engine plays this card for you, mirroring `ObjectView.Enforced`.
   *
   * `false` is the honour system: the table admitted the card knowing the engine does not
   * implement it, so the players move it, tap it and count its counters themselves, and the
   * server records every one of those as an event with an actor. Absent is read as `false`
   * rather than `true` — a board that claims enforcement the engine is not doing is the one
   * mistake here that a player cannot see, whereas offering a manual control on an enforced
   * object costs a refusal toast and nothing else.
   */
  enforced?: boolean;
}

/** One card under the top of a merged permanent, as a client sees it (CR 730.2). */
export interface MergedCardView {
  name: string;
  oracleId: string;
  oracleText: string | null;
  imageUri: string | null;
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
