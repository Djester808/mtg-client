import { TestBed } from '@angular/core/testing';
import { GameViewAdapter } from './game-view.adapter';
import { CardType, CounterType, GameResult, ManaColor, Phase, Step } from '../models/game.models';
import { GameView, ObjectView, PlayerView } from '../models/play.models';

const object = (over: Partial<ObjectView> = {}): ObjectView => ({
  id: 'o1',
  name: 'Grizzly Bears',
  oracleId: 'oracle-1',
  controllerId: 'alice',
  manaCost: '{1}{G}',
  typeLine: 'Creature — Bear',
  oracleText: 'A bear.',
  artUri: 'art.jpg',
  imageUri: 'card.jpg',
  isPlaneswalker: false,
  isCreature: true,
  isLand: false,
  announcesVariable: false,
  colors: ['Green'],
  printedPower: 2,
  printedToughness: 2,
  isTapped: false,
  hasSummoningSickness: false,
  damageMarked: 0,
  counters: null,
  ...over,
});

const player = (over: Partial<PlayerView> = {}): PlayerView => ({
  playerId: 'alice',
  name: 'Alice',
  life: 20,
  poisonCounters: 0,
  libraryCount: 50,
  handCount: 3,
  hand: [],
  graveyard: [],
  hasLost: false,
  landsPlayedThisTurn: 0,
  commanderDamage: {},
  commanderName: null,
  manaPool: {},
  ...over,
});

const view = (over: Partial<GameView> = {}): GameView => ({
  gameId: 'game-1',
  viewer: 'alice',
  turnNumber: 4,
  activePlayerId: 'alice',
  currentStep: 'PrecombatMain',
  priorityPlayerId: 'alice',
  attackers: {},
  attackersDeclared: false,
  blockersDeclared: false,
  blockers: {},
  players: [player(), player({ playerId: 'bob', name: 'Bob', hand: null })],
  battlefield: [],
  stack: [],
  exile: [],
  command: [],
  choice: null,
  ...over,
});

/**
 * The seam between the rebuilt rules engine and the board that predates it.
 *
 * Everything the board draws comes through here, so this is where a mistranslation would show
 * up as a board that is subtly lying — the wrong phase, a creature the wrong size, combat that
 * looks declared when it is not.
 */
describe('GameViewAdapter', () => {
  let adapter: GameViewAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(GameViewAdapter);
  });

  it('carries the turn, the active player and who may act', () => {
    const state = adapter.toGameState(view({ turnNumber: 7, activePlayerId: 'bob' }));

    expect(state.gameId).toBe('game-1');
    expect(state.turn).toBe(7);
    expect(state.activePlayerId).toBe('bob');
    expect(state.priorityPlayerId).toBe('alice');
  });

  it('spells "nobody has priority" as nobody, not as a player', () => {
    // CR 502.4, 514.3, 117.2e. The old shape has no null here and its consumers compare the
    // value against a player id, so an empty string is the one answer that is nobody.
    const state = adapter.toGameState(view({ priorityPlayerId: null }));
    expect(state.priorityPlayerId).toBe('');
  });

  describe('where in the turn it is (CR 500.1)', () => {
    const cases: [string, Phase, Step][] = [
      ['Untap', Phase.Beginning, Step.Untap],
      ['Upkeep', Phase.Beginning, Step.Upkeep],
      ['Draw', Phase.Beginning, Step.Draw],
      ['PrecombatMain', Phase.PreCombatMain, Step.Main],
      ['BeginningOfCombat', Phase.Combat, Step.BeginningOfCombat],
      ['DeclareAttackers', Phase.Combat, Step.DeclareAttackers],
      ['DeclareBlockers', Phase.Combat, Step.DeclareBlockers],
      ['FirstStrikeCombatDamage', Phase.Combat, Step.FirstStrikeDamage],
      ['CombatDamage', Phase.Combat, Step.CombatDamage],
      ['EndOfCombat', Phase.Combat, Step.EndOfCombat],
      ['PostcombatMain', Phase.PostCombatMain, Step.Main],
      ['End', Phase.Ending, Step.End],
      ['Cleanup', Phase.Ending, Step.Cleanup],
    ];

    for (const [step, phase, expected] of cases) {
      it(`maps ${step}`, () => {
        const state = adapter.toGameState(view({ currentStep: step }));
        expect(state.currentPhase).toBe(phase);
        expect(state.currentStep).toBe(expected);
      });
    }

    it('tells the two main phases apart, which share a step name', () => {
      expect(adapter.toGameState(view({ currentStep: 'PrecombatMain' })).currentPhase).toBe(
        Phase.PreCombatMain,
      );
      expect(adapter.toGameState(view({ currentStep: 'PostcombatMain' })).currentPhase).toBe(
        Phase.PostCombatMain,
      );
    });
  });

  describe('players', () => {
    it('counts every zone, and lists the ones a player may look at', () => {
      const state = adapter.toGameState(
        view({
          players: [
            player({ hand: [object({ id: 'h1' })], graveyard: [object({ id: 'g1' })] }),
            player({ playerId: 'bob', hand: null }),
          ],
          exile: [object({ id: 'x1', controllerId: 'alice' })],
        }),
      );

      const alice = state.players[0];
      expect(alice.handCount).toBe(3);
      expect(alice.hand.length).toBe(1);
      expect(alice.graveyardCount).toBe(1);
      expect(alice.exileCount).toBe(1);
      expect(alice.exile[0].cardId).toBe('x1');
    });

    it('gives another player an empty hand rather than inventing one', () => {
      // CR 402.3: the count is public, the cards are not — and the view sends null for them.
      const state = adapter.toGameState(view());
      const bob = state.players[1];

      expect(bob.hand).toEqual([]);
      expect(bob.handCount).toBe(3);
    });

    it('splits the one shared exile zone back to its owners', () => {
      const state = adapter.toGameState(
        view({
          exile: [
            object({ id: 'x1', controllerId: 'alice' }),
            object({ id: 'x2', controllerId: 'bob' }),
            object({ id: 'x3', controllerId: 'bob' }),
          ],
        }),
      );

      expect(state.players[0].exileCount).toBe(1);
      expect(state.players[1].exileCount).toBe(2);
    });

    it('reads the land drop as spent or not (CR 305.2)', () => {
      const spent = adapter.toGameState(view({ players: [player({ landsPlayedThisTurn: 1 })] }));
      const unspent = adapter.toGameState(view({ players: [player({ landsPlayedThisTurn: 0 })] }));

      expect(spent.players[0].hasLandPlayedThisTurn).toBe(true);
      expect(unspent.players[0].hasLandPlayedThisTurn).toBe(false);
    });

    it('converts the mana pool, dropping kinds the player has none of', () => {
      const state = adapter.toGameState(
        view({ players: [player({ manaPool: { R: 2, G: 1, U: 0 } })] }),
      );

      expect(state.players[0].manaPool.amounts).toEqual({
        [ManaColor.Red]: 2,
        [ManaColor.Green]: 1,
      });
      expect(state.players[0].manaPool.total).toBe(3);
    });
  });

  describe('permanents', () => {
    it('carries tapped, sick, damage and counters', () => {
      const state = adapter.toGameState(
        view({
          battlefield: [
            object({
              id: 'p1',
              isTapped: true,
              hasSummoningSickness: true,
              damageMarked: 1,
              counters: { '+1/+1': 2, loyalty: 3 },
            }),
          ],
        }),
      );

      const permanent = state.battlefield[0];
      expect(permanent.permanentId).toBe('p1');
      expect(permanent.isTapped).toBe(true);
      expect(permanent.hasSummoningSickness).toBe(true);
      expect(permanent.damageMarked).toBe(1);
      expect(permanent.counters[CounterType.PlusOnePlusOne]).toBe(2);
      expect(permanent.counters[CounterType.Loyalty]).toBe(3);
      expect(permanent.counters[CounterType.Poison]).toBe(0);
    });

    it('adds counters to printed power and toughness', () => {
      const state = adapter.toGameState(
        view({ battlefield: [object({ counters: { '+1/+1': 2, '-1/-1': 1 } })] }),
      );

      expect(state.battlefield[0].effectivePower).toBe(3);
      expect(state.battlefield[0].effectiveToughness).toBe(3);
    });

    it('leaves a permanent with no power and toughness without one', () => {
      const state = adapter.toGameState(
        view({
          battlefield: [
            object({
              typeLine: 'Basic Land — Mountain',
              printedPower: null,
              printedToughness: null,
            }),
          ],
        }),
      );

      expect(state.battlefield[0].effectivePower).toBeNull();
      expect(state.battlefield[0].effectiveToughness).toBeNull();
    });
  });

  describe('cards', () => {
    it('reads types, subtypes and supertypes off the type line (CR 205.2)', () => {
      const state = adapter.toGameState(
        view({ battlefield: [object({ typeLine: 'Legendary Creature — Goblin Warrior' })] }),
      );

      const card = state.battlefield[0].sourceCard;
      expect(card.cardTypes).toEqual([CardType.Creature]);
      expect(card.subtypes).toEqual(['Goblin', 'Warrior']);
      expect(card.supertypes).toEqual(['Legendary']);
    });

    it('falls back to what the view says when there is no type line', () => {
      const state = adapter.toGameState(
        view({ battlefield: [object({ typeLine: null, isCreature: false, isLand: true })] }),
      );

      expect(state.battlefield[0].sourceCard.cardTypes).toEqual([CardType.Land]);
    });

    it('writes the cost in the notation the board parses', () => {
      // The engine sends it printed — {1}{R} — and the hand decides castability by walking the
      // string a character at a time, so a brace reads as a colour nobody has and nothing is
      // ever castable. Found by watching two Mountains refuse to pay for a Goblin Piker.
      const cost = (manaCost: string | null) =>
        adapter.toGameState(view({ battlefield: [object({ manaCost })] })).battlefield[0].sourceCard
          .manaCost;

      expect(cost('{1}{R}')).toBe('1R');
      expect(cost('{2}{W}{W}')).toBe('2WW');
      expect(cost('{G}')).toBe('G');
      expect(cost('{10}')).toBe('10');
      expect(cost(null)).toBe('');
      // X is zero until it is chosen (CR 202.3b), and the old parser would read it as a colour.
      expect(cost('{X}{R}')).toBe('R');
      // Hybrid has no spelling in that notation; one generic is the cheapest it could be.
      expect(cost('{2/W}{2/W}')).toBe('11');
    });

    it('adds up the mana value from the printed cost (CR 202.3)', () => {
      const cost = (manaCost: string | null) =>
        adapter.toGameState(view({ battlefield: [object({ manaCost })] })).battlefield[0].sourceCard
          .manaValue;

      expect(cost('{1}{G}')).toBe(2);
      expect(cost('{3}')).toBe(3);
      expect(cost('{W}{U}{B}{R}{G}')).toBe(5);
      // X is zero anywhere but on the stack (CR 202.3b), and hybrid counts as one.
      expect(cost('{X}{R}')).toBe(1);
      expect(cost('{2/W}{2/W}')).toBe(2);
      expect(cost(null)).toBe(0);
    });

    it('turns the colours it is given into the letters the board uses', () => {
      const state = adapter.toGameState(
        view({ battlefield: [object({ colors: ['Red', 'White'] })] }),
      );

      expect(state.battlefield[0].sourceCard.colorIdentity).toEqual([
        ManaColor.Red,
        ManaColor.White,
      ]);
    });

    it('carries the art through, which is what the board actually draws', () => {
      const state = adapter.toGameState(view({ battlefield: [object()] }));
      const card = state.battlefield[0].sourceCard;

      expect(card.imageUriArtCrop).toBe('art.jpg');
      expect(card.imageUriNormal).toBe('card.jpg');
    });
  });

  describe('combat', () => {
    it('is nothing at all before anyone attacks', () => {
      expect(adapter.toGameState(view()).combat).toBeNull();
    });

    it('reports attackers and who is blocking each of them', () => {
      const state = adapter.toGameState(
        view({
          attackers: { a1: { defendingPlayer: 'bob' }, a2: { defendingPlayer: 'bob' } },
          attackersDeclared: true,
          blockers: { a1: ['b1', 'b2'] },
          blockersDeclared: true,
        }),
      );

      expect(state.combat?.attackers).toEqual(['a1', 'a2']);
      expect(state.combat?.attackersToBlockers).toEqual({ a1: ['b1', 'b2'], a2: [] });
      expect(state.combat?.attackersDeclared).toBe(true);
      expect(state.combat?.blockersDeclared).toBe(true);
    });

    it('knows that declaring no attackers is still a declaration (CR 508.1)', () => {
      const state = adapter.toGameState(view({ attackers: {}, attackersDeclared: true }));

      expect(state.combat).not.toBeNull();
      expect(state.combat?.attackers).toEqual([]);
      expect(state.combat?.attackersDeclared).toBe(true);
    });
  });

  describe('who has won', () => {
    it('is nobody while everyone is still in', () => {
      expect(adapter.toGameState(view()).result).toBe(GameResult.InProgress);
    });

    it('names the player left standing', () => {
      const state = adapter.toGameState(
        view({ players: [player({ hasLost: true }), player({ playerId: 'bob', hasLost: false })] }),
      );
      expect(state.result).toBe(GameResult.Player2Wins);
    });

    it('is a draw when everybody has lost (CR 104.4b)', () => {
      const state = adapter.toGameState(
        view({ players: [player({ hasLost: true }), player({ playerId: 'bob', hasLost: true })] }),
      );
      expect(state.result).toBe(GameResult.Draw);
    });
  });

  it('hands the stack over with the top last, which is where the board looks for it', () => {
    // The two contracts disagree about which end is the top. The engine sends index 0 as the
    // next thing to resolve (CR 405.1); the board's panel marks the *last* entry as the top and
    // lays them out column-reverse. Passed straight through, the panel called the wrong spell
    // the top, numbered them backwards, and showed them in the opposite order to the one they
    // resolve in.
    const state = adapter.toGameState(
      view({
        stack: [
          object({ id: 'resolves-first', name: 'Counterspell', typeLine: 'Instant' }),
          object({ id: 'resolves-second', name: 'Bolt', typeLine: 'Instant' }),
        ],
      }),
    );

    expect(state.stack.map((s) => s.sourceCardName)).toEqual(['Bolt', 'Counterspell']);
    expect(state.stack[state.stack.length - 1].stackObjectId).toBe('resolves-first');
  });

  it('leaves a stack of one alone', () => {
    const state = adapter.toGameState(
      view({ stack: [object({ id: 'only', name: 'Shock', typeLine: 'Instant' })] }),
    );

    expect(state.stack.length).toBe(1);
    expect(state.stack[0].stackObjectId).toBe('only');
  });

  // ---- What the engine says about {X} (CR 601.2b) ----------------------------------------

  it("carries an ability's text and the number its cost asks for", () => {
    // Both were dropped here. The text was carried from the engine to a DTO nobody read, which
    // is what made r25-43's fix — 416 permanents whose two buttons read identically —
    // unobservable in this client. The flag was not carried at all, so every {X} ability was
    // activated for zero: a storage land tapping for no mana.
    const state = adapter.toGameState(
      view({
        battlefield: [
          object({
            id: 'pools',
            name: 'Calciform Pools',
            isCreature: false,
            isLand: true,
            abilities: [
              {
                id: 'release',
                text: '{X}, {T}, Remove X storage counters: Add X mana.',
                requiresTap: true,
                targetCount: 0,
                isManaAbility: true,
                announcesVariable: true,
              },
            ],
          }),
        ],
      }),
    );

    expect(state.battlefield[0].abilities[0].text).toBe(
      '{X}, {T}, Remove X storage counters: Add X mana.',
    );
    expect(state.battlefield[0].abilities[0].announcesVariable).toBe(true);
  });

  it('carries the flag on a card in hand, where the printed mana does not show it', () => {
    // Harvest Pyre is {1}{R} and its only X is in an additional cost, which is why this is the
    // engine's answer and not a reading of `manaCost`.
    const state = adapter.toGameState(
      view({
        players: [
          player({
            hand: [
              object({
                id: 'pyre',
                name: 'Harvest Pyre',
                manaCost: '{1}{R}',
                typeLine: 'Instant',
                isCreature: false,
                announcesVariable: true,
              }),
            ],
          }),
          player({ playerId: 'bob', name: 'Bob' }),
        ],
      }),
    );

    const pyre = state.players[0].hand.find((c) => c.name === 'Harvest Pyre');
    expect(pyre?.announcesVariable).toBe(true);
    expect(pyre?.manaCost).toBe('1R');
  });
});
