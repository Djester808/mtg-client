import { Injectable } from '@angular/core';
import { CollectionCardDto, CardType } from '../models/game.models';
import { DeckDetailDto } from '../services/deck-api.service';
import { colorIdentityViolations as identityViolations } from '../utils/card.utils';

/**
 * All deck-legality and power-level derivations, extracted from DeckDetailComponent.
 *
 * Every method is a pure function of the deck: no DOM, no store, no change detection.
 * The heavy derivations are computed once per deck emission and cached on the deck's
 * object identity — the store hands out a new deck object on every mutation, so identity
 * is a sound key. The violation classes are bound on every tile and the header reads the
 * arrays repeatedly, so without the cache this did O(N) deck scans per card per
 * change-detection pass (O(N²) at pointer-event frequency).
 */
@Injectable({ providedIn: 'root' })
export class DeckLegalityService {
  private cache: {
    deck: DeckDetailDto;
    singleton: CollectionCardDto[];
    colorId: CollectionCardDto[];
    banned: CollectionCardDto[];
    gameChangers: CollectionCardDto[];
    formatViolations: CollectionCardDto[];
    typeByCardId: Map<string, string | null>;
    oracleCounts: Map<string, number>;
  } | null = null;

  private cardCount(card: CollectionCardDto): number {
    return card.quantity + card.quantityFoil;
  }

  private isBasicLand(card: CollectionCardDto): boolean {
    return card.cardDetails?.supertypes?.includes('Basic') ?? false;
  }

  private mainTotal(deck: DeckDetailDto): number {
    return deck.cards
      .filter((c) => (c.board ?? 'main') === 'main')
      .reduce((s, c) => s + this.cardCount(c), 0);
  }

  commanderCard(deck: DeckDetailDto): CollectionCardDto | null {
    if (!deck.commanderOracleId) return null;
    return deck.cards.find((c) => c.oracleId === deck.commanderOracleId) ?? null;
  }

  private compute(deck: DeckDetailDto): NonNullable<typeof this.cache> {
    if (this.cache?.deck === deck) return this.cache;

    const isCommander = deck.format === 'commander';
    const mainCards = deck.cards.filter((c) => (c.board ?? 'main') === 'main');

    // Singleton: non-basic cards whose total copies (across printings) exceed one.
    const totalByOracle = new Map<string, number>();
    for (const c of mainCards) {
      if (!this.isBasicLand(c))
        totalByOracle.set(c.oracleId, (totalByOracle.get(c.oracleId) ?? 0) + this.cardCount(c));
    }
    const singleton = mainCards.filter(
      (c) => !this.isBasicLand(c) && (totalByOracle.get(c.oracleId) ?? 0) > 1,
    );

    // Color identity outside the commander's.
    const cmdr = this.commanderCard(deck);
    const colorId = cmdr?.cardDetails
      ? mainCards.filter(
          (c) =>
            c.oracleId !== cmdr.oracleId &&
            identityViolations(c.cardDetails?.colorIdentity, cmdr.cardDetails!.colorIdentity)
              .length > 0,
        )
      : [];

    const banned = mainCards.filter((c) => c.cardDetails?.legalities?.['commander'] === 'banned');
    const gameChangers = mainCards.filter((c) => c.cardDetails?.gameChanger === true);

    const fmt = deck.format;
    const formatViolations =
      !fmt || fmt === 'commander'
        ? []
        : deck.cards.filter((c) => {
            const leg = c.cardDetails?.legalities?.[fmt];
            return !!leg && leg !== 'legal';
          });

    const singletonIds = new Set(singleton.map((c) => c.id));
    const colorIdIds = new Set(colorId.map((c) => c.id));
    const typeByCardId = new Map<string, string | null>();
    if (isCommander) {
      for (const c of deck.cards) {
        if (c.cardDetails?.legalities?.['commander'] === 'banned') {
          typeByCardId.set(c.id, 'banned');
          continue;
        }
        const s = singletonIds.has(c.id);
        const ci = colorIdIds.has(c.id);
        typeByCardId.set(c.id, s && ci ? 'both' : s ? 'singleton' : ci ? 'color-id' : null);
      }
    }

    const oracleCounts = new Map<string, number>();
    for (const c of deck.cards) {
      const key = `${c.oracleId}|${c.board ?? 'main'}`;
      oracleCounts.set(key, (oracleCounts.get(key) ?? 0) + this.cardCount(c));
    }

    this.cache = {
      deck,
      singleton,
      colorId,
      banned,
      gameChangers,
      formatViolations,
      typeByCardId,
      oracleCounts,
    };
    return this.cache;
  }

  /** Non-basic cards with more than one total copy — violates singleton. */
  singletonViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.compute(deck).singleton;
  }

  /** Cards whose color identity falls outside the commander's. */
  colorIdentityViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.compute(deck).colorId;
  }

  /** Cards that are banned in Commander. */
  bannedInCommander(deck: DeckDetailDto): CollectionCardDto[] {
    return this.compute(deck).banned;
  }

  /** Cards on the Commander game changers list (legal but flagged as highly impactful). */
  gameChangerCards(deck: DeckDetailDto): CollectionCardDto[] {
    return this.compute(deck).gameChangers;
  }

  formatViolations(deck: DeckDetailDto): CollectionCardDto[] {
    return this.compute(deck).formatViolations;
  }

  /** Total copies of a card across all records with the same oracleId on the same board. */
  totalOracleCount(card: CollectionCardDto, deck: DeckDetailDto): number {
    return this.compute(deck).oracleCounts.get(`${card.oracleId}|${card.board ?? 'main'}`) ?? 0;
  }

  gameChangerNames(deck: DeckDetailDto): string {
    return this.gameChangerCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  /** Cards eligible to be commander: legendary creatures or planeswalkers. */
  eligibleCommanders(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter((c) => {
      const d = c.cardDetails;
      if (!d) return false;
      const legendary = d.supertypes?.includes('Legendary') ?? false;
      const creature = d.cardTypes?.includes(CardType.Creature) ?? false;
      const pw = d.cardTypes?.includes(CardType.Planeswalker) ?? false;
      return legendary && (creature || pw);
    });
  }

  /** Cards that grant an extra turn. */
  extraTurnCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(
      (c) =>
        (c.board ?? 'main') === 'main' &&
        /takes? an extra turn/i.test(c.cardDetails?.oracleText ?? ''),
    );
  }

  /** Cards that destroy or exile all (or all nonbasic) lands. */
  mldCards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter((c) => {
      if ((c.board ?? 'main') !== 'main') return false;
      const text = c.cardDetails?.oracleText ?? '';
      return (
        /destroy all (?:nonbasic )?lands/i.test(text) ||
        /exile all (?:\w+, )*lands/i.test(text) ||
        /destroy all permanents/i.test(text) ||
        /exile all permanents/i.test(text)
      );
    });
  }

  /** True if the deck can chain extra turns (2+ extra-turn spells, or 1 + graveyard recursion). */
  hasChainingExtraTurns(deck: DeckDetailDto): boolean {
    const etCards = this.extraTurnCards(deck);
    if (etCards.length === 0) return false;
    if (etCards.length >= 2) return true;
    return deck.cards
      .filter((c) => (c.board ?? 'main') === 'main')
      .some((c) => {
        const text = c.cardDetails?.oracleText ?? '';
        return (
          /return target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(
            text,
          ) ||
          /cast target (?:instant or sorcery |instant |sorcery )?card from your graveyard/i.test(
            text,
          ) ||
          /you may cast (?:a card|target (?:instant or sorcery|instant|sorcery)) from your graveyard/i.test(
            text,
          )
        );
      });
  }

  /** Estimated Commander Bracket (1–4). Bracket 5 is intent-based and not computed. */
  commanderBracket(deck: DeckDetailDto): number {
    const gcCount = this.gameChangerCards(deck).length;
    const mld = this.mldCards(deck).length > 0;
    const chain = this.hasChainingExtraTurns(deck);
    if (gcCount > 3 || mld || chain) return 4;
    if (gcCount > 0) return 3;
    if (this.extraTurnCards(deck).length > 0) return 2;
    return 1;
  }

  mldCardNames(deck: DeckDetailDto): string {
    return this.mldCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  extraTurnCardNames(deck: DeckDetailDto): string {
    return this.extraTurnCards(deck)
      .map((c) => c.cardDetails?.name ?? '')
      .join(', ');
  }

  formatLabel(format: string | null): string {
    const labels: Record<string, string> = {
      commander: 'CMDR',
      brawl: 'BRAWL',
      oathbreaker: 'OATH',
      standard: 'STD',
      pioneer: 'PIO',
      modern: 'MOD',
      legacy: 'LEG',
      vintage: 'VIN',
      pauper: 'PAU',
    };
    return format ? (labels[format] ?? format.toUpperCase()) : 'FORMAT';
  }

  hasFormatViolations(deck: DeckDetailDto): boolean {
    return this.hasCommanderViolations(deck) || this.formatViolations(deck).length > 0;
  }

  hasCommanderViolations(deck: DeckDetailDto): boolean {
    if (deck.format !== 'commander') return false;
    return (
      this.mainTotal(deck) !== 100 ||
      !deck.commanderOracleId ||
      this.singletonViolations(deck).length > 0 ||
      this.colorIdentityViolations(deck).length > 0 ||
      this.bannedInCommander(deck).length > 0
    );
  }

  /** Returns 'banned', 'singleton', 'color-id', 'both', or null. Banned takes highest priority. */
  cardViolationType(card: CollectionCardDto, deck: DeckDetailDto): string | null {
    if (deck.format !== 'commander') return null;
    if (card.cardDetails?.legalities?.['commander'] === 'banned') return 'banned';
    return this.compute(deck).typeByCardId.get(card.id) ?? null;
  }

  cardViolationClass(card: CollectionCardDto, deck: DeckDetailDto): string {
    const classes: string[] = [];
    const type = this.cardViolationType(card, deck);
    if (type) classes.push(`violation-${type}`);
    if (deck.format === 'commander' && card.cardDetails?.gameChanger)
      classes.push('is-game-changer');
    return classes.join(' ');
  }
}
