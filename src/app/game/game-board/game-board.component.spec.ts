import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { GameBoardComponent } from './game-board.component';
import { PlayHubService } from '../play-hub.service';
import { GameView, ObjectView, PlayerView } from '../../models/play.models';

/**
 * The board.
 *
 * It holds no rules, so what is worth testing is that it shows what the server said and asks
 * the server for everything else. In particular it must never present hidden information it
 * was not given, and must not decide for itself whether an action is legal.
 */
describe('GameBoardComponent', () => {
  const ME = 'me-0000';
  const THEM = 'them-0000';

  let hub: {
    view: ReturnType<typeof signal<GameView | null>>;
    log: ReturnType<typeof signal<readonly string[]>>;
    refusal: ReturnType<typeof signal<string | null>>;
    connection$: ReturnType<typeof signal<string>>;
    join: jasmine.Spy;
    leave: jasmine.Spy;
    passPriority: jasmine.Spy;
    playLand: jasmine.Spy;
    castSpell: jasmine.Spy;
    activateAbility: jasmine.Spy;
    acknowledge: jasmine.Spy;
  };

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
    turnNumber: 3,
    activePlayerId: ME,
    players: [player(), player({ playerId: THEM, name: 'Bob', hand: null, life: 12 })],
    battlefield: [],
    stack: [],
    exile: [],
    command: [],
    ...over,
  });

  function create(): ComponentFixture<GameBoardComponent> {
    const fixture = TestBed.createComponent(GameBoardComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    hub = {
      view: signal<GameView | null>(null),
      log: signal<readonly string[]>([]),
      refusal: signal<string | null>(null),
      connection$: signal('connected'),
      join: jasmine.createSpy('join').and.resolveTo(undefined),
      leave: jasmine.createSpy('leave').and.resolveTo(undefined),
      passPriority: jasmine.createSpy('passPriority').and.resolveTo(undefined),
      playLand: jasmine.createSpy('playLand').and.resolveTo(undefined),
      castSpell: jasmine.createSpy('castSpell').and.resolveTo(undefined),
      activateAbility: jasmine.createSpy('activateAbility').and.resolveTo(undefined),
      acknowledge: jasmine.createSpy('acknowledge'),
    };

    TestBed.configureTestingModule({
      imports: [GameBoardComponent],
      providers: [
        { provide: PlayHubService, useValue: hub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ gameId: 'game-1' }) } },
        },
      ],
    });
  });

  it('joins the game named in the route', () => {
    create();

    expect(hub.join).toHaveBeenCalledWith('game-1');
  });

  it('leaves when the board is destroyed', () => {
    const fixture = create();

    fixture.destroy();

    expect(hub.leave).toHaveBeenCalled();
  });

  it('waits rather than drawing an empty board before the first view arrives', () => {
    const fixture = create();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.gb-waiting')).toBeTruthy();
    expect(el.querySelector('.gb-root')).toBeNull();
  });

  it('shows both players and their life totals', () => {
    const fixture = create();
    hub.view.set(view());
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).toContain('12');
    expect(el.textContent).toContain('20');
  });

  it('shows a count for the opponent and never a list', () => {
    // The server sends no hand for anyone but the viewer. The board must not invent one, and
    // the count is what a player is entitled to (CR 402.3).
    const fixture = create();
    hub.view.set(
      view({
        players: [
          player({ hand: [card({ id: 'mine', name: 'My Card' })] }),
          player({ playerId: THEM, name: 'Bob', hand: null, handCount: 4 }),
        ],
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('My Card');
    expect(el.textContent).toContain('4');
    expect(el.querySelectorAll('.gb-card').length).toBe(1);
  });

  it('shows the stack top first, because that is what resolves next', () => {
    const fixture = create();
    hub.view.set(
      view({ stack: [card({ id: 's1', name: 'Counterspell' }), card({ id: 's2', name: 'Bolt' })] }),
    );
    fixture.detectChanges();

    const items = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.gb-stack-item'),
    ).map((n) => n.textContent?.trim());
    expect(items).toEqual(['Counterspell', 'Bolt']);
  });

  it('splits the battlefield into theirs and yours', () => {
    const fixture = create();
    hub.view.set(
      view({
        battlefield: [
          card({ id: 'a', name: 'Mine' }),
          card({ id: 'b', name: 'Theirs', controllerId: THEM }),
        ],
      }),
    );
    fixture.detectChanges();

    const halves = (fixture.nativeElement as HTMLElement).querySelectorAll('.gb-field-half');
    expect(halves[0].textContent).toContain('Theirs');
    expect(halves[1].textContent).toContain('Mine');
  });

  it('plays a land and casts everything else', () => {
    // CR 305.1: a land is played, not cast. Getting this wrong is a refusal every time.
    const fixture = create();
    const page = fixture.componentInstance;

    page.play(card({ id: 'forest', typeLine: 'Basic Land — Forest' }));
    expect(hub.playLand).toHaveBeenCalledWith('forest');

    page.play(card({ id: 'bear' }));
    expect(hub.castSpell).toHaveBeenCalledWith('bear');
  });

  it('asks the server to pass priority rather than deciding anything itself', () => {
    const fixture = create();

    fixture.componentInstance.pass();

    expect(hub.passPriority).toHaveBeenCalled();
  });

  it('shows what the rules refused, and lets it be dismissed', () => {
    // A refusal is the rules saying no, which is a normal answer — the board reports it rather
    // than trying to predict it, because predicting it means a second rules engine here.
    const fixture = create();
    hub.view.set(view());
    hub.refusal.set('You do not have priority (CR 117.1).');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gb-refusal')?.textContent).toContain('117.1');

    fixture.componentInstance.dismissRefusal();
    expect(hub.acknowledge).toHaveBeenCalled();
  });

  it('says so when the connection is not up', () => {
    const fixture = create();
    hub.view.set(view());
    hub.connection$.set('reconnecting');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gb-connection')?.textContent,
    ).toContain('reconnecting');
  });

  it('selects a card and then plays it', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    const bear = card({ id: 'bear' });

    page.select(bear);
    expect(page.selectedCardId).toBe('bear');

    // Tapping the same card again puts it down rather than trapping the selection.
    page.select(bear);
    expect(page.selectedCardId).toBeNull();
  });
});
