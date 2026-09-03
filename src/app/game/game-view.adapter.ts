import { Injectable } from '@angular/core';
import {
  CardDto,
  CardType,
  ChoiceDto,
  CombatStateDto,
  CounterType,
  GameResult,
  GameStateDto,
  ManaColor,
  ManaPoolDto,
  PermanentDto,
  Phase,
  PlayerStateDto,
  StackObjectDto,
  StackObjectType,
  Step,
} from '../models/game.models';
import { GameView, ObjectView, PlayerView } from '../models/play.models';

/**
 * Turns what the rules engine sends into what the board reads.
 *
 * The board, the NgRx game slice and the components under it were written against
 * `GameStateDto` — the shape the first engine served. That engine was removed for being
 * structurally wrong (no effect model, priority hardcoded to two players, continuous effects
 * written into state as mutations) and replaced by `MtgEngine.Rules`, which is event-sourced,
 * cites the Comprehensive Rules, and sends a per-player `GameView` instead.
 *
 * Rather than rewrite the board against the new shape — which is how the board stopped looking
 * like itself in the first place — the translation happens here, in one file, and the board is
 * left exactly as it was. Everything above this line is the original UI; everything below it is
 * the rebuilt engine.
 *
 * What the new view does not carry, this does not invent: printed power and toughness stand in
 * for effective values, because the client is not told what continuous effects (CR 613) did.
 */
@Injectable({ providedIn: 'root' })
export class GameViewAdapter {
  /** The whole state, as the board's store expects it. */
  toGameState(view: GameView): GameStateDto {
    return {
      gameId: view.gameId,
      turn: view.turnNumber,
      activePlayerId: view.activePlayerId,
      // Nobody holds priority during untap, cleanup, or while something resolves (CR 502.4,
      // 514.3, 117.2e). The old shape has no way to say that, and its consumers compare it
      // against a player id, so nobody is spelled as nobody's id.
      priorityPlayerId: view.priorityPlayerId ?? '',
      currentPhase: this.phaseOf(view.currentStep),
      currentStep: this.stepOf(view.currentStep),
      result: this.resultOf(view),
      players: view.players.map((p) => this.player(p, view)),
      battlefield: view.battlefield.map((o) => this.permanent(o)),
      // Reversed, because the two contracts disagree about which end is the top. The engine
      // sends index 0 as the next thing to resolve; the board's stack panel marks the *last*
      // entry as the top and lays them out column-reverse. Passed through as they came, the
      // panel labelled the wrong spell "(top)", numbered them backwards, and showed them in the
      // opposite order to the one they resolve in (CR 405.1).
      stack: [...view.stack].reverse().map((o) => this.stackObject(o)),
      combat: this.combat(view),
      choice: this.choice(view),
    };
  }

  // ---- Players ---------------------------------------------------------------------------

  private player(p: PlayerView, view: GameView): PlayerStateDto {
    return {
      playerId: p.playerId,
      name: p.name,
      life: p.life,
      poisonCounters: p.poisonCounters,
      manaPool: this.manaPool(p.manaPool),
      handCount: p.handCount,
      libraryCount: p.libraryCount,
      graveyardCount: p.graveyard.length,
      // One shared exile zone in the new view, split back out by who controls each card.
      exileCount: view.exile.filter((o) => o.controllerId === p.playerId).length,
      hand: (p.hand ?? []).map((o) => this.card(o)),
      graveyard: p.graveyard.map((o) => this.card(o)),
      exile: view.exile.filter((o) => o.controllerId === p.playerId).map((o) => this.card(o)),
      hasLandPlayedThisTurn: p.landsPlayedThisTurn > 0,
    };
  }

  private manaPool(pool: Record<string, number> | undefined): ManaPoolDto {
    const amounts: Partial<Record<ManaColor, number>> = {};
    let total = 0;
    for (const [symbol, amount] of Object.entries(pool ?? {})) {
      if (amount > 0 && this.isManaColor(symbol)) {
        amounts[symbol] = amount;
        total += amount;
      }
    }
    return { amounts, total };
  }

  private isManaColor(symbol: string): symbol is ManaColor {
    return (Object.values(ManaColor) as string[]).includes(symbol);
  }

  // ---- Objects ----------------------------------------------------------------------------

  private permanent(o: ObjectView): PermanentDto {
    return {
      permanentId: o.id,
      sourceCard: this.card(o),
      controllerId: o.controllerId,
      // What the engine says this permanent can be asked to do (CR 602.1). The board used to
      // guess — "mana", on a land — which is why a Sol Ring could not be tapped.
      abilities: (o.abilities ?? []).map((a) => ({
        id: a.id,
        text: a.text,
        requiresTap: a.requiresTap,
        targetCount: a.targetCount,
        isManaAbility: a.isManaAbility,
        // CR 601.2b: a cost written with {X} is a number the player names, and it travels with
        // the activation. Dropped here, every such ability was activated for zero — a storage
        // land that taps for no mana, a search for a card with mana value 0 or less.
        announcesVariable: a.announcesVariable ?? false,
      })),
      isTapped: o.isTapped ?? false,
      hasSummoningSickness: o.hasSummoningSickness ?? false,
      damageMarked: o.damageMarked ?? 0,
      counters: this.counters(o.counters),
      // Attachments are not projected by the new view; an empty list is the truth here, not a
      // placeholder for something the board should have shown.
      attachments: [],
      // Printed, plus counters — the same arithmetic the board's own sidebar does. What a
      // continuous effect did to this permanent is not in the view (CR 613), so this is the
      // most the client can honestly say.
      effectivePower: this.withCounters(o.printedPower, o.counters),
      effectiveToughness: this.withCounters(o.printedToughness, o.counters),
    };
  }

  private withCounters(
    printed: number | null,
    counters: Record<string, number> | null,
  ): number | null {
    if (printed === null) {
      return null;
    }
    const plus = counters?.['+1/+1'] ?? 0;
    const minus = counters?.['-1/-1'] ?? 0;
    return printed + plus - minus;
  }

  private counters(counters: Record<string, number> | null): Record<CounterType, number> {
    return {
      [CounterType.PlusOnePlusOne]: counters?.['+1/+1'] ?? 0,
      [CounterType.MinusOneMinusOne]: counters?.['-1/-1'] ?? 0,
      [CounterType.Loyalty]: counters?.['loyalty'] ?? 0,
      [CounterType.Charge]: counters?.['charge'] ?? 0,
      [CounterType.Poison]: counters?.['poison'] ?? 0,
    };
  }

  private card(o: ObjectView): CardDto {
    const typeLine = o.typeLine ?? '';
    return {
      cardId: o.id,
      oracleId: o.oracleId,
      name: o.name,
      manaCost: this.costFor(o.manaCost),
      manaValue: this.manaValueOf(o.manaCost),
      cardTypes: this.typesOf(typeLine, o),
      subtypes: this.subtypesOf(typeLine),
      supertypes: this.supertypesOf(typeLine),
      oracleText: o.oracleText ?? '',
      power: o.printedPower,
      toughness: o.printedToughness,
      startingLoyalty: o.counters?.['loyalty'] ?? null,
      keywords: [],
      imageUriNormal: o.imageUri,
      imageUriLarge: o.imageUri,
      imageUriNormalBack: null,
      imageUriSmall: o.imageUri,
      imageUriArtCrop: o.artUri,
      colorIdentity: this.colorsOf(o.colors),
      ownerId: o.controllerId,
      // The engine's answer, not a reading of `manaCost`: the X can be in an additional cost the
      // printed mana never mentions (Harvest Pyre is {1}{R} and exiles X cards).
      announcesVariable: o.announcesVariable ?? false,
      // Not projected by the engine's view, and not invented here. The rules engine sends what
      // it reasons about — a card's printed characteristics — and nothing a deck builder or a
      // price page would want. Null is the honest answer; the board shows none of these.
      flavorText: null,
      artist: null,
      setCode: null,
      rarity: null,
      legalities: {},
      gameChanger: false,
    };
  }

  /**
   * The printed cost in the notation the board reads.
   *
   * The engine sends it as it is printed — `{1}{R}` — and the board's `CardDto.manaCost` is the
   * older brace-less form, `1R`. That is not cosmetic: the hand decides what is castable by
   * walking the string a character at a time, so a brace is read as a colour it does not have
   * and nothing is ever castable. Found by watching a hand with two Mountains and two red mana
   * refuse to light up a Goblin Piker.
   *
   * X is dropped rather than kept: the old parser has no notion of it and would read it as a
   * colour nobody has, and X is zero until it is chosen anyway (CR 202.3b). Anything else with
   * a slash in it — hybrid, phyrexian — becomes one generic, which is the cheapest it could be.
   */
  private costFor(cost: string | null): string {
    let out = '';
    for (const symbol of (cost ?? '').match(/\{[^}]+\}/g) ?? []) {
      const inner = symbol.slice(1, -1);
      if (inner === 'X') continue;
      out += inner.includes('/') ? '1' : inner;
    }
    return out;
  }

  /**
   * Mana value from the cost, by adding up its symbols (CR 202.3).
   *
   * The new view sends the printed cost string and not its value. Generic symbols count as
   * their number, X counts as zero outside the stack (CR 202.3b), and every other symbol —
   * coloured, hybrid, phyrexian — counts as one.
   */
  private manaValueOf(cost: string | null): number {
    let value = 0;
    for (const symbol of (cost ?? '').match(/\{[^}]+\}/g) ?? []) {
      const inner = symbol.slice(1, -1);
      const generic = Number(inner);
      value += Number.isFinite(generic) ? generic : inner === 'X' ? 0 : 1;
    }
    return value;
  }

  /** The types on the card's type line, before the dash (CR 205.2). */
  private typesOf(typeLine: string, o: ObjectView): CardType[] {
    const front = typeLine.split('—')[0];
    const types = (Object.values(CardType) as CardType[]).filter((t) =>
      new RegExp('\\b' + t + '\\b').test(front),
    );
    if (types.length > 0) {
      return types;
    }

    // A type line the engine did not send still has to say what the board needs to lay it out.
    if (o.isCreature) return [CardType.Creature];
    if (o.isLand) return [CardType.Land];
    if (o.isPlaneswalker) return [CardType.Planeswalker];
    return [CardType.Other];
  }

  private subtypesOf(typeLine: string): string[] {
    const parts = typeLine.split('—');
    return parts.length > 1 ? parts[1].trim().split(/\s+/).filter(Boolean) : [];
  }

  private supertypesOf(typeLine: string): string[] {
    const front = typeLine.split('—')[0];
    return ['Basic', 'Legendary', 'Snow', 'World'].filter((s) =>
      new RegExp('\\b' + s + '\\b').test(front),
    );
  }

  /** The engine names colours in full; the board's enum is keyed by letter. */
  private colorsOf(colors: string[] | undefined): ManaColor[] {
    const byName: Record<string, ManaColor> = {
      White: ManaColor.White,
      Blue: ManaColor.Blue,
      Black: ManaColor.Black,
      Red: ManaColor.Red,
      Green: ManaColor.Green,
      Colorless: ManaColor.Colorless,
    };
    return (colors ?? [])
      .map((c) => byName[c] ?? (this.isManaColor(c) ? (c as ManaColor) : null))
      .filter((c): c is ManaColor => c !== null);
  }

  // ---- The stack -------------------------------------------------------------------------

  private stackObject(o: ObjectView): StackObjectDto {
    return {
      stackObjectId: o.id,
      // A card on the stack is a spell (CR 111.1); an object with no card behind it is an
      // ability. The view does not distinguish activated from triggered, so this does not
      // guess between them.
      type:
        (o.typeLine ?? '').length > 0 ? StackObjectType.Spell : StackObjectType.ActivatedAbility,
      controllerId: o.controllerId,
      sourceCardName: o.name,
      description: o.oracleText ?? '',
      targets: [],
    };
  }

  // ---- Combat ----------------------------------------------------------------------------

  private combat(view: GameView): CombatStateDto | null {
    const attackers = Object.keys(view.attackers ?? {});
    if (!view.attackersDeclared && attackers.length === 0) {
      return null;
    }

    const attackersToBlockers: Record<string, string[]> = {};
    for (const id of attackers) {
      attackersToBlockers[id] = view.blockers?.[id] ?? [];
    }

    return {
      attackers,
      attackersToBlockers,
      attackersDeclared: view.attackersDeclared,
      blockersDeclared: view.blockersDeclared,
    };
  }

  // ---- Decisions ---------------------------------------------------------------------------

  /**
   * What the game is waiting to be told, if anything.
   *
   * Passed through as it comes, including the null `options` that everybody but the player
   * being asked receives — the board uses the difference to say "waiting for them" rather than
   * offering buttons nobody may press.
   */
  private choice(view: GameView): ChoiceDto | null {
    const choice = view.choice;
    if (!choice) {
      return null;
    }

    return {
      id: choice.id,
      playerId: choice.playerId,
      kind: choice.kind,
      prompt: choice.prompt,
      minPicks: choice.minPicks,
      maxPicks: choice.maxPicks,
      isOrdering: choice.isOrdering,
      isDivision: choice.isDivision,
      totalToDivide: choice.totalToDivide,
      options: choice.options ? choice.options.map((o) => ({ id: o.id, label: o.label })) : null,
    };
  }

  // ---- Where in the turn -------------------------------------------------------------------

  /**
   * The engine names a step; the board wants a phase and a step (CR 500.1).
   *
   * The two main phases are one step called Main in the old shape, told apart by their phase —
   * which is why this cannot be a single lookup.
   */
  private phaseOf(step: string): Phase {
    switch (step) {
      case 'Untap':
      case 'Upkeep':
      case 'Draw':
        return Phase.Beginning;
      case 'PrecombatMain':
        return Phase.PreCombatMain;
      case 'BeginningOfCombat':
      case 'DeclareAttackers':
      case 'DeclareBlockers':
      case 'FirstStrikeCombatDamage':
      case 'CombatDamage':
      case 'EndOfCombat':
        return Phase.Combat;
      case 'PostcombatMain':
        return Phase.PostCombatMain;
      default:
        return Phase.Ending;
    }
  }

  private stepOf(step: string): Step {
    switch (step) {
      case 'Untap':
        return Step.Untap;
      case 'Upkeep':
        return Step.Upkeep;
      case 'Draw':
        return Step.Draw;
      case 'PrecombatMain':
      case 'PostcombatMain':
        return Step.Main;
      case 'BeginningOfCombat':
        return Step.BeginningOfCombat;
      case 'DeclareAttackers':
        return Step.DeclareAttackers;
      case 'DeclareBlockers':
        return Step.DeclareBlockers;
      case 'FirstStrikeCombatDamage':
        return Step.FirstStrikeDamage;
      case 'CombatDamage':
        return Step.CombatDamage;
      case 'EndOfCombat':
        return Step.EndOfCombat;
      case 'Cleanup':
        return Step.Cleanup;
      default:
        return Step.End;
    }
  }

  /**
   * Who has won, if anyone.
   *
   * The new view says which players have lost rather than naming a winner, because a game can
   * end with everybody losing (CR 104.4b) — a draw, which the old shape has a name for.
   */
  private resultOf(view: GameView): GameResult {
    const standing = view.players.filter((p) => !p.hasLost);
    if (standing.length === view.players.length) {
      return GameResult.InProgress;
    }
    if (standing.length === 0) {
      return GameResult.Draw;
    }
    return standing[0].playerId === view.players[0].playerId
      ? GameResult.Player1Wins
      : GameResult.Player2Wins;
  }
}
