import { BoardLayoutService } from './board-layout.service';
import { GameView, ObjectView, PlayerView } from '../models/play.models';

/**
 * Arranging a view into a board.
 *
 * The memoization is tested because the template binds this: a getter Angular calls on every
 * change-detection pass and that rebuilds its answer each time is the performance trap the
 * client standard names by hand.
 */
describe('BoardLayoutService', () => {
  const ME = 'me-0000';
  const THEM = 'them-0000';

  let service: BoardLayoutService;

  const card = (over: Partial<ObjectView> = {}): ObjectView => ({
    id: 'card-1',
    name: 'Bear',
    oracleId: 'oracle-bear',
    controllerId: ME,
    manaCost: '{1}{G}',
    typeLine: 'Creature — Bear',
    oracleText: null,
    artUri: null,
    imageUri: null,
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    announcesVariable: false,
    colors: [],
    printedPower: 2,
    printedToughness: 2,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    ...over,
  });

  const player = (over: Partial<PlayerView> = {}): PlayerView => ({
    playerId: ME,
    name: 'Alice',
    life: 20,
    poisonCounters: 0,
    libraryCount: 40,
    handCount: 7,
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
    viewer: ME,
    turnNumber: 1,
    activePlayerId: ME,
    players: [player(), player({ playerId: THEM, name: 'Bob', hand: null })],
    currentStep: 'PrecombatMain',
    priorityPlayerId: null,
    attackers: {},
    attackersDeclared: false,
    blockersDeclared: false,
    blockers: {},
    battlefield: [],
    stack: [],
    exile: [],
    command: [],
    choice: null,
    ...over,
  });

  beforeEach(() => {
    service = new BoardLayoutService();
  });

  it('splits the battlefield by who controls each permanent', () => {
    const board = service.layout(
      view({
        battlefield: [card({ id: 'a' }), card({ id: 'b', controllerId: THEM })],
      }),
    );

    expect(board.mine.map((c) => c.id)).toEqual(['a']);
    expect(board.theirs.map((c) => c.id)).toEqual(['b']);
  });

  it('puts everyone who is not the viewer on the other side', () => {
    const board = service.layout(view());

    expect(board.me.playerId).toBe(ME);
    expect(board.opponents.map((p) => p.playerId)).toEqual([THEM]);
  });

  it('knows whose turn it is', () => {
    expect(service.layout(view()).isMyTurn).toBeTrue();
    expect(service.layout(view({ activePlayerId: THEM })).isMyTurn).toBeFalse();
  });

  it('takes the hand from the viewer, which is the only one that has one', () => {
    const board = service.layout(
      view({ players: [player({ hand: [card()] }), player({ playerId: THEM, hand: null })] }),
    );

    expect(board.hand.length).toBe(1);
  });

  it('returns the same object for the same view', () => {
    // Memoized on identity: the server replaces the view wholesale on each push, so reference
    // equality is exactly the right key.
    const v = view();

    expect(service.layout(v)).toBe(service.layout(v));
  });

  it('recomputes when a new view arrives', () => {
    expect(service.layout(view())).not.toBe(service.layout(view()));
  });

  it('applies counters to the printed stats', () => {
    expect(service.printedStats(card())).toBe('2/2');
    expect(service.printedStats(card({ counters: { '+1/+1': 2 } }))).toBe('4/4');
    expect(service.printedStats(card({ counters: { '-1/-1': 1 } }))).toBe('1/1');
  });

  it('reports no stats for something that is not a creature', () => {
    expect(service.printedStats(card({ printedPower: null, printedToughness: null }))).toBeNull();
  });

  it('tells a land from a spell, because one is played and the other is cast', () => {
    expect(service.isLand(card({ typeLine: 'Basic Land — Forest' }))).toBeTrue();
    expect(service.isLand(card({ typeLine: 'Creature — Bear' }))).toBeFalse();
    expect(service.isLand(card({ typeLine: null }))).toBeFalse();
  });

  describe('loyalty', () => {
    it('reads the loyalty counters on a planeswalker', () => {
      // CR 306.5b. A planeswalker with no number on it asks the player to decide whether to
      // attack it blind, which is the one decision a planeswalker exists to present.
      const walker = card({ isPlaneswalker: true, isCreature: false, counters: { loyalty: 4 } });

      expect(service.loyalty(walker)).toBe('4');
    });

    it('says nothing for a creature', () => {
      expect(service.loyalty(card({ counters: { '+1/+1': 2 } }))).toBeNull();
    });

    it('says nothing for a planeswalker with no loyalty left', () => {
      // Absent rather than zero: at zero it is already on its way to the graveyard (CR 704.5i),
      // so there is no board state where a zero is the honest answer.
      const walker = card({ isPlaneswalker: true, isCreature: false, counters: {} });

      expect(service.loyalty(walker)).toBeNull();
    });
  });

  describe('stepLabel', () => {
    it('names every step the server can send', () => {
      // The board used to say whose turn it was and nothing more, so the only way to learn
      // where in the turn you were was to press something and read the refusal. Every step the
      // engine has is named here, because the one that is missing is the one a player meets.
      const steps = [
        'Untap',
        'Upkeep',
        'Draw',
        'PrecombatMain',
        'BeginningOfCombat',
        'DeclareAttackers',
        'DeclareBlockers',
        'CombatDamage',
        'EndOfCombat',
        'PostcombatMain',
        'End',
        'Cleanup',
      ];

      for (const step of steps) {
        const label = service.stepLabel(step) ?? '';
        expect(label).toBeTruthy();
        // A step that fell through still reads as an identifier — 'PrecombatMain' rather than
        // 'Main phase'. Some steps are already a word (Untap, Draw, Cleanup) and keep it, so
        // the test is that no label has a camelCase seam, not that every one changed.
        expect(/[a-z][A-Z]/.test(label))
          .withContext(step + ' -> ' + label)
          .toBeFalse();
      }
    });

    it('reads as words rather than as an enum', () => {
      expect(service.stepLabel('PrecombatMain')).toBe('Main phase');
      expect(service.stepLabel('DeclareBlockers')).toBe('Declare blockers');
      expect(service.stepLabel('PostcombatMain')).toBe('Second main');
    });

    it('says nothing when the game has not told us where it is', () => {
      expect(service.stepLabel(null)).toBeNull();
    });
  });
});
