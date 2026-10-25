import { Injectable } from '@angular/core';
import {
  CardDto,
  CardType,
  ManaPoolDto,
  PermanentAbilityDto,
  PermanentDto,
} from '../models/game.models';

/**
 * What the rules let a player do with what is in front of them.
 *
 * Every question here is one the engine also answers, and answers authoritatively — it refuses
 * an illegal action and quotes the rule. The board asks them anyway, because an action offered
 * and then refused is worse than one never offered: declaring an attack with one ineligible
 * creature throws the *whole* declaration away, and the player finds out from a toast.
 *
 * So this is deliberately a second implementation of a handful of rules, and the risk that comes
 * with that — the two drifting apart — is why it is one file with the rule numbers written down
 * rather than a predicate here and another there. It lives in a service rather than in the
 * components because it is pure logic about the game and nothing to do with drawing it, which
 * also means it can be tested without a fixture.
 *
 * The engine stays the authority. Nothing here may permit something the engine forbids; where
 * they disagree, this one is wrong.
 */
@Injectable({ providedIn: 'root' })
export class PlayLegalityService {
  /**
   * Whether this is a creature that has not been around since the turn began (CR 302.6).
   *
   * One rule, two uses: it stops a creature attacking (CR 302.6, 702.10b) and it stops a
   * creature paying {T} for an activated ability (CR 302.6, 702.10c). It applies only to
   * creatures, which is why a Sol Ring may be tapped the turn it lands.
   */
  summoningSick(p: PermanentDto): boolean {
    if (!p.sourceCard.cardTypes.includes(CardType.Creature)) return false;
    return p.hasSummoningSickness && !p.sourceCard.keywords.includes('Haste');
  }

  /** Whether this permanent may be declared as an attacker (CR 508.1a). */
  canAttack(p: PermanentDto): boolean {
    if (!p.sourceCard.cardTypes.includes(CardType.Creature)) return false;
    if (p.isTapped) return false; // CR 508.1a
    if (p.sourceCard.keywords.includes('Defender')) return false; // CR 702.3b
    return !this.summoningSick(p);
  }

  /** Why it cannot attack, in the engine's voice. */
  whyNotAttacking(p: PermanentDto): string {
    if (p.isTapped) return 'A tapped creature cannot be declared as an attacker (CR 508.1a).';
    if (p.sourceCard.keywords.includes('Defender')) {
      return 'A creature with defender cannot attack (CR 702.3b).';
    }
    return 'That creature has summoning sickness and no haste (CR 302.6).';
  }

  /**
   * The ability this permanent is ready to use, if there is exactly one to offer.
   *
   * Tapping a land for mana is this case, not a special one. One is deliberate: a permanent
   * with two abilities needs a menu to choose between them, and a click that silently picked
   * the first would be worse than one that does nothing.
   */
  readyAbility(permanent: PermanentDto): PermanentAbilityDto | null {
    const usable = this.usableAbilities(permanent);
    return usable.length === 1 ? usable[0] : null;
  }

  /**
   * Every ability on this permanent whose cost could be paid right now (CR 602.5b).
   *
   * The list `readyAbility` narrows to one, kept separately because more than one is not a
   * failure — it is a permanent that needs a menu. Answering only "is there exactly one" is
   * what left a Prodigal Pyromancer's two abilities with no way in at all.
   */
  usableAbilities(permanent: PermanentDto): PermanentAbilityDto[] {
    return (permanent.abilities ?? []).filter((a) => {
      if (!a.requiresTap) return true;
      // CR 602.5b: only an untapped permanent can pay {T}. CR 302.6: and a creature must have
      // been controlled since the turn began to pay it, unless it has haste (CR 702.10c).
      return !permanent.isTapped && !this.summoningSick(permanent);
    });
  }

  /**
   * Whether this card would choose targets as it is cast (CR 601.2c).
   *
   * Only an instant or a sorcery. A permanent spell chooses none: where its text says "target"
   * the word almost always belongs to an ability that targets later, from the battlefield. Bond
   * Beetle is the case that proved it — "put a +1/+1 counter on target creature" is its
   * enters-the-battlefield trigger, and the board stopped to ask who the *creature spell* was
   * aimed at, which is not a question the rules ask.
   *
   * An Aura is the exception the rules do have, and this gets it wrong. The honest fix is for
   * the engine to say which spells take targets rather than the board reading prose; none are
   * implemented yet, so the guess stays until then.
   */
  targetsOnCast(card: CardDto): boolean {
    if (card.targetCount !== undefined) return card.targetCount > 0;
    const isSpellThatTargets =
      card.cardTypes.includes(CardType.Instant) || card.cardTypes.includes(CardType.Sorcery);

    return isSpellThatTargets && /\btargets?\b/i.test(card.oracleText ?? '');
  }

  /**
   * Whether a card in hand could be cast right now (CR 117.1a, 304.1, 307.1).
   *
   * A land is not cast at all — it is a special action taken at sorcery speed with an empty
   * stack, once a turn (CR 305.1, 505.6b) — which is why it is its own arm.
   */
  isCastable(card: CardDto, timing: CastingWindow, pool: ManaPoolDto | undefined): boolean {
    return this.castingProblem(card, timing, pool) === null;
  }

  /** Explain the same predicate used to offer a play; the server remains authoritative. */
  castingProblem(
    card: CardDto,
    timing: CastingWindow,
    pool: ManaPoolDto | undefined,
    requireMana = true,
  ): string | null {
    if (!timing.uiIsIdle) return 'Finish or cancel the current decision first.';
    if (!timing.hasPriority) return 'Wait until you have priority.';
    const land = card.cardTypes.includes(CardType.Land);
    const instant = card.cardTypes.includes(CardType.Instant) || card.keywords.includes('Flash');
    if (land || !instant) {
      if (!timing.isActivePlayer || !timing.inMainPhase) return 'Play this during your main phase.';
      if (!timing.stackIsEmpty) return 'Wait until the stack is empty.';
    }
    if (land)
      return timing.hasPlayedLandThisTurn ? 'You have already played a land this turn.' : null;
    return !requireMana || this.canAfford(card.manaCost, pool)
      ? null
      : 'Add enough mana of the required colors before casting this spell.';
  }

  /**
   * Whether the pool could pay this cost (CR 202.1, 601.2f).
   *
   * The cost arrives as the card prints it — `{2}{R}`, not `2R`. This walked the string a
   * character at a time and read the opening brace as a coloured pip, so the very first symbol
   * of every cost asked the pool for mana of colour "{" and got none. Nothing but a land was
   * ever castable from the board, and a land never reaches here: its arm returns above. Seven
   * turns of a real game went by with six lands played and not one spell.
   *
   * Coloured pips are taken first and the generic part from whatever is left, because spending
   * a coloured source on generic mana while a coloured pip still needs it would report a payable
   * cost as unpayable.
   */
  canAfford(manaCost: string, pool: ManaPoolDto | undefined): boolean {
    if (!manaCost || manaCost === '0' || manaCost === '{0}') return true;
    if (!pool) return false;

    const remaining: Record<string, number> = { ...(pool.amounts as Record<string, number>) };
    let generic = 0;

    for (const symbol of this.symbolsOf(manaCost)) {
      if (/^\d+$/.test(symbol)) {
        generic += parseInt(symbol, 10);
        continue;
      }

      // {X} is chosen as the spell is cast and is zero until then (CR 202.3b). Hybrid and
      // phyrexian symbols are not read here: they are payable more than one way, and guessing
      // which would refuse casts that are legal. They count as one generic instead, which is
      // the cheapest they can ever be.
      if (symbol === 'X') continue;
      if (symbol.length > 1) {
        generic += 1;
        continue;
      }

      const have = remaining[symbol] ?? 0;
      if (have <= 0) return false;
      remaining[symbol] = have - 1;
    }

    const leftover = Object.values(remaining).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
    return leftover >= generic;
  }

  /**
   * A cost split into its symbols, whether or not it is written with braces.
   *
   * `{2}{R}` gives `['2', 'R']`; a bare `2R` gives the same, so a caller that has already
   * stripped the braces is not punished for it.
   */
  private symbolsOf(manaCost: string): string[] {
    const braced = [...manaCost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].toUpperCase());
    if (braced.length > 0) return braced;

    const bare: string[] = [];
    let i = 0;
    while (i < manaCost.length) {
      if (manaCost[i] >= '0' && manaCost[i] <= '9') {
        let digits = '';
        while (i < manaCost.length && manaCost[i] >= '0' && manaCost[i] <= '9') {
          digits += manaCost[i++];
        }
        bare.push(digits);
      } else {
        bare.push(manaCost[i++].toUpperCase());
      }
    }
    return bare;
  }
}

/** The moment a cast is being judged against (CR 117.1a). */
export interface CastingWindow {
  isActivePlayer: boolean;
  hasPriority: boolean;
  inMainPhase: boolean;
  stackIsEmpty: boolean;
  hasPlayedLandThisTurn: boolean;
  /** The board is not already in the middle of another decision. */
  uiIsIdle: boolean;
}
