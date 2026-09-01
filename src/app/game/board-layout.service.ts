import { Injectable } from '@angular/core';
import { GameView, ObjectView, PlayerView } from '../models/play.models';

/** The board arranged from one player's point of view. */
export interface BoardLayout {
  me: PlayerView;
  opponents: PlayerView[];
  /** Permanents the viewer controls. */
  mine: ObjectView[];
  /** Permanents anyone else controls. */
  theirs: ObjectView[];
  /** Top of the stack first, which is the order things resolve in. */
  stack: ObjectView[];
  hand: ObjectView[];
  isMyTurn: boolean;
  /** Ids of creatures currently attacking (CR 508.1). */
  attackingIds: ReadonlySet<string>;
  /** Ids of creatures currently blocking something (CR 509.1). */
  blockingIds: ReadonlySet<string>;
  /** Exile is one shared zone in the view, so its size is a board-level number. */
  exileCount: number;
}

/**
 * Arranges a view into the two halves a board is drawn as.
 *
 * Pure and memoized on the view's identity, because the template binds it and a template-called
 * getter runs on every change-detection pass. The view is replaced wholesale by each server
 * push, so reference equality is exactly the right cache key — a new view means new work, and
 * the same view never needs it twice.
 */
@Injectable({ providedIn: 'root' })
export class BoardLayoutService {
  private lastView: GameView | null = null;
  private lastResult: BoardLayout | null = null;

  layout(view: GameView): BoardLayout {
    if (this.lastView === view && this.lastResult) {
      return this.lastResult;
    }

    const me =
      view.players.find((p) => p.playerId === view.viewer) ??
      ({
        playerId: view.viewer,
        name: 'You',
        life: 0,
        poisonCounters: 0,
        libraryCount: 0,
        handCount: 0,
        hand: [],
        graveyard: [],
        hasLost: false,
        landsPlayedThisTurn: 0,
        commanderDamage: {},
        commanderName: null,
        manaPool: {},
      } satisfies PlayerView);

    const result: BoardLayout = {
      me,
      opponents: view.players.filter((p) => p.playerId !== view.viewer),
      mine: view.battlefield.filter((o) => o.controllerId === view.viewer),
      theirs: view.battlefield.filter((o) => o.controllerId !== view.viewer),
      stack: view.stack,
      hand: me.hand ?? [],
      isMyTurn: view.activePlayerId === view.viewer,
      attackingIds: new Set(Object.keys(view.attackers ?? {})),
      blockingIds: new Set(Object.values(view.blockers ?? {}).flat()),
      exileCount: view.exile.length,
    };

    this.lastView = view;
    this.lastResult = result;
    return result;
  }

  /**
   * How a permanent's power and toughness should read, or null when it has none.
   *
   * Printed values, and labelled as such wherever they are shown. Counters are added because
   * the client can see them; everything else a continuous effect does is invisible from here,
   * which is why the board says "printed" rather than pretending to know.
   */
  printedStats(card: ObjectView): string | null {
    if (card.printedPower === null || card.printedToughness === null) {
      return null;
    }

    const plus = card.counters?.['+1/+1'] ?? 0;
    const minus = card.counters?.['-1/-1'] ?? 0;
    const delta = plus - minus;

    return `${card.printedPower + delta}/${card.printedToughness + delta}`;
  }

  /**
   * A planeswalker's loyalty, for the slot power and toughness use on a creature (CR 306.5b).
   *
   * A planeswalker with no number on it is a permanent whose only interesting quantity is
   * invisible: attacking one is a decision about how much loyalty it has left, and the board
   * was asking players to make it blind.
   */
  loyalty(card: ObjectView): string | null {
    if (!card.isPlaneswalker) {
      return null;
    }

    // Absent rather than zero when it has none: a planeswalker at zero loyalty is already on
    // its way to the graveyard (CR 704.5i), so there is no board state where "0" is the answer.
    const counters = card.counters?.['loyalty'];
    return counters === undefined ? null : String(counters);
  }

  /**
   * The step, in words a player reads (CR 500.1).
   *
   * The board said whose turn it was and nothing more, so the only way to find out where in the
   * turn you were was to press something and read the refusal — "a land is played during your
   * main phase with an empty stack" is a fine explanation and a poor way to learn the game is in
   * combat. Every harness written against this board had to ask the server for the step, which
   * is a tell: a player has no such option.
   *
   * Short on purpose. It sits beside the turn number in a strip that has to fit 375px, and the
   * longest of these is "Declare blockers".
   */
  stepLabel(step: string | null): string | null {
    switch (step) {
      case 'Untap':
        return 'Untap';
      case 'Upkeep':
        return 'Upkeep';
      case 'Draw':
        return 'Draw';
      case 'PrecombatMain':
        return 'Main phase';
      case 'BeginningOfCombat':
        return 'Combat';
      case 'DeclareAttackers':
        return 'Declare attackers';
      case 'DeclareBlockers':
        return 'Declare blockers';
      case 'CombatDamage':
        return 'Combat damage';
      case 'EndOfCombat':
        return 'End of combat';
      case 'PostcombatMain':
        return 'Second main';
      case 'End':
        return 'End step';
      case 'Cleanup':
        return 'Cleanup';
      default:
        return step;
    }
  }

  /** Whether a card in hand is a land, which decides whether it is played or cast. */
  isLand(card: ObjectView): boolean {
    return (card.typeLine ?? '').includes('Land');
  }

  /**
   * Whether casting this needs the board to ask for a target (CR 601.2c).
   *
   * Read off the card, because the card is where it is written: a spell that targets says
   * "target" in its rules text. Without this the board stopped on every cast — a Goblin Piker
   * asked "choose a target, or cast it with none", which is a question about a creature spell
   * that has no answer and no purpose.
   *
   * A heuristic, and the safe direction: a spell whose text does not say "target" is cast
   * straight away, and if the engine disagrees it refuses and says so. Modal and keyworded
   * targeting that never spells the word will fall through to that refusal.
   */
  needsATarget(card: ObjectView): boolean {
    return /\btargets?\b/i.test(card.oracleText ?? '');
  }
}
