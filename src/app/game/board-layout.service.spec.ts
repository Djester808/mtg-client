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
    ...over,
  });

  const view = (over: Partial<GameView> = {}): GameView => ({
    gameId: 'game-1',
    viewer: ME,
    turnNumber: 1,
    activePlayerId: ME,
    players: [player(), player({ playerId: THEM, name: 'Bob', hand: null })],
    battlefield: [],
    stack: [],
    exile: [],
    command: [],
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
});
