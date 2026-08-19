/**
 * The AI deck builder's contract. The server half is
 * `MtgEngine.Api/Dtos/AiDeckBuilderDtos.cs` and it is the definition.
 *
 * Two calls, in order: suggest commanders for what the player described, then plan a deck
 * around the one they pick. The plan is deliberately not written until they accept it.
 */

export interface CommanderSuggestionRequest {
  /** The deck they want, in their own words. Optional. */
  brief: string | null;
  /** WUBRG letters, or empty for no colour constraint. */
  colors: string[];
  bracket: number;
  ownedOnly: boolean;
  count: number;
}

export interface CommanderSuggestion {
  oracleId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  imageUriArtCrop: string | null;
  imageUriNormal: string | null;
  colorIdentity: string[];
  /** The concrete mechanism that makes this commander fit — never filler. */
  reason: string;
  archetype: string;
  plan: string;
  owned: boolean;
}

export interface CommanderSuggestions {
  commanders: CommanderSuggestion[];
  /** Proposals the server refused: invented cards, non-commanders, wrong colours. */
  discarded: number;
  skippedByReason: Record<string, number>;
}

export interface PlannedCard {
  oracleId: string;
  name: string;
  scryfallId: string | null;
  manaCost: string | null;
  typeLine: string | null;
  imageUriArtCrop: string | null;
  /** "main" | "side" | "maybe". */
  board: string;
  quantity: number;
}

export interface ColorSource {
  color: string;
  count: number;
}

/**
 * What the built deck measurably contains. Facts, never a verdict.
 *
 * Deliberately carries no target numbers. The doctrine's quotas are baselines that move
 * with the deck — the land count follows the curve, and the value of mass removal inverts
 * with creature density — so a fixed table here would call a correctly-built deck broken.
 */
export interface DeckFacts {
  cards: number;
  lands: number;
  ramp: number;
  draw: number;
  interaction: number;
  /**
   * How many of `interaction` are creatures rather than spells.
   *
   * Each card is counted in one role, chosen from its rules text, so a creature whose
   * arrival makes every player sacrifice counts as interaction — which it is, and which in
   * a sacrifice deck is also the plan. "17 interaction" read as far over quota until you
   * saw that most of them were the deck's own payoffs.
   */
  interactionOnCreatures: number;
  other: number;
  creatures: number;
  /** Creature density — the archetype signal that decides how removal is judged. */
  creaturePercentOfNonland: number;
  /** Lands + ramp, which matters more than the land count alone. */
  manaSources: number;
  averageManaValue: number;
  colorSources: ColorSource[];
}

export interface DeckFinding {
  /** Plan | Mana | Interaction | Resilience. */
  area: string;
  /** critical | improve | note. */
  severity: string;
  finding: string;
  /** What to change, or empty when nothing needs to. */
  fix: string;
}

/** The model's judgement of the deck, against the doctrine and this commander. */
export interface DeckAssessment {
  verdict: string;
  findings: DeckFinding[];
  facts: DeckFacts;
}

export interface AiBuildPlan {
  commanderOracleId: string;
  commanderName: string;
  cards: PlannedCard[];
  mainTarget: number;
  /** Slots the plan could not fill. Non-zero means an incomplete deck. */
  mainShortfall: number;
  cardsSkipped: number;
  skippedByReason: Record<string, number>;
  assessment: DeckAssessment;
}

export interface AiApplyPlanRequest {
  commanderOracleId: string;
  bracket: number;
  cards: PlannedCard[];
}

export interface AiBuildResult {
  cardsAdded: number;
  sideboardAdded: number;
  maybeboardAdded: number;
  cardsSkipped: number;
  mainTarget: number;
  mainShortfall: number;
  skippedByReason: Record<string, number>;
}
