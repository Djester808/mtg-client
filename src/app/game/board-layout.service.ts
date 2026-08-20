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
      } satisfies PlayerView);

    const result: BoardLayout = {
      me,
      opponents: view.players.filter((p) => p.playerId !== view.viewer),
      mine: view.battlefield.filter((o) => o.controllerId === view.viewer),
      theirs: view.battlefield.filter((o) => o.controllerId !== view.viewer),
      stack: view.stack,
      hand: me.hand ?? [],
      isMyTurn: view.activePlayerId === view.viewer,
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

  /** Whether a card in hand is a land, which decides whether it is played or cast. */
  isLand(card: ObjectView): boolean {
    return (card.typeLine ?? '').includes('Land');
  }
}
