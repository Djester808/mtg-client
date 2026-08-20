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
    choose: jasmine.Spy;
    declareAttackers: jasmine.Spy;
    declareBlockers: jasmine.Spy;
    step: () => string | null;
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
    commanderDamage: {},
    commanderName: null,
    ...over,
  });

  const view = (over: Partial<GameView> = {}): GameView => ({
    gameId: 'game-1',
    viewer: ME,
    turnNumber: 3,
    activePlayerId: ME,
    players: [player(), player({ playerId: THEM, name: 'Bob', hand: null, life: 12 })],
    currentStep: 'PrecombatMain',
    attackers: {},
    blockers: {},
    battlefield: [],
    stack: [],
    exile: [],
    command: [],
    choice: null,
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
      choose: jasmine.createSpy('choose').and.resolveTo(undefined),
      declareAttackers: jasmine.createSpy('declareAttackers').and.resolveTo(undefined),
      declareBlockers: jasmine.createSpy('declareBlockers').and.resolveTo(undefined),
      step: () => hub.view()?.currentStep ?? null,
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

  it('plays a land immediately, because a land has nothing to target', () => {
    // CR 305.1: a land is played, not cast, and it never targets — so it goes straight through
    // while everything else stops to ask.
    const fixture = create();
    const page = fixture.componentInstance;

    page.play(card({ id: 'forest', typeLine: 'Basic Land — Forest' }));

    expect(hub.playLand).toHaveBeenCalledWith('forest');
    expect(page.targetingCardId).toBeNull();
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

  it('waits for a target instead of casting a spell that would be refused', () => {
    // A targeted spell cast with no target is refused every time. Sending it anyway and showing
    // the refusal teaches the player nothing they could have acted on.
    const fixture = create();
    hub.view.set(view());
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.play(card({ id: 'bolt', typeLine: 'Instant' }));

    expect(hub.castSpell).not.toHaveBeenCalled();
    expect(page.targetingCardId).toBe('bolt');
  });

  it('casts at the target that was picked', () => {
    const fixture = create();
    hub.view.set(view());
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.play(card({ id: 'bolt', typeLine: 'Instant' }));
    page.targetPlayer(THEM);

    expect(hub.castSpell).toHaveBeenCalledWith('bolt', [
      { kind: 'player', objectId: null, playerId: THEM },
    ]);
    expect(page.targetingCardId).toBeNull();
  });

  it('can cast with no target, for a spell that needs none', () => {
    const fixture = create();
    const page = fixture.componentInstance;

    page.play(card({ id: 'divination', typeLine: 'Sorcery' }));
    page.castAt(null);

    expect(hub.castSpell).toHaveBeenCalledWith('divination', []);
  });

  it('shows the prompt when the decision belongs to the viewer', () => {
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: ME,
          kind: 'Mulligan',
          prompt: 'Keep this hand, or take a mulligan?',
          minPicks: 1,
          maxPicks: 1,
          isOrdering: false,
          isDivision: false,
          totalToDivide: 0,
          options: [
            { id: 'keep', label: 'Keep' },
            { id: 'mulligan', label: 'Mulligan' },
          ],
        },
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Keep this hand');
    expect(el.querySelectorAll('.gb-prompt-actions .gb-btn').length).toBe(2);
  });

  it('says who is thinking rather than freezing, when the decision belongs to someone else', () => {
    // The other player is sent no options at all, so a board that only reacted to its own
    // choices would simply stop with nothing on screen explaining why.
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: THEM,
          kind: 'Mulligan',
          prompt: 'Keep this hand, or take a mulligan?',
          minPicks: 1,
          maxPicks: 1,
          isOrdering: false,
          isDivision: false,
          totalToDivide: 0,
          options: null,
        },
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Waiting for the other player');
    expect(el.querySelectorAll('.gb-prompt-actions .gb-btn').length).toBe(0);
  });

  it('sends a single-pick answer as soon as it is confirmed', () => {
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: ME,
          kind: 'Mulligan',
          prompt: 'Keep?',
          minPicks: 1,
          maxPicks: 1,
          isOrdering: false,
          isDivision: false,
          totalToDivide: 0,
          options: [
            { id: 'keep', label: 'Keep' },
            { id: 'mulligan', label: 'Mulligan' },
          ],
        },
      }),
    );
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePick('mulligan');
    page.submitChoice();

    expect(hub.choose).toHaveBeenCalledWith(['mulligan']);
  });

  it('keeps the order of picks, because the order is the answer', () => {
    // CR 603.3b: which trigger the player puts on last is the one that resolves first, so the
    // order has to survive to the server rather than being sorted or set-ified on the way.
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: ME,
          kind: 'OrderTriggers',
          prompt: 'Order your triggers.',
          minPicks: 2,
          maxPicks: 2,
          isOrdering: true,
          isDivision: false,
          totalToDivide: 0,
          options: [
            { id: 'a', label: 'First ability' },
            { id: 'b', label: 'Second ability' },
          ],
        },
      }),
    );
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePick('b');
    page.togglePick('a');
    expect(page.pickOrder('b')).toBe(1);
    expect(page.pickOrder('a')).toBe(2);

    page.submitChoice();
    expect(hub.choose).toHaveBeenCalledWith(['b', 'a']);
  });

  it('offers an attack only in the declare attackers step of your own turn', () => {
    // CR 508.1: declaring attackers happens before anyone has priority, so "my turn and I have
    // priority" is not the moment — the step is.
    const fixture = create();
    hub.view.set(view({ currentStep: 'PrecombatMain' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDeclaringAttackers).toBeFalse();

    hub.view.set(view({ currentStep: 'DeclareAttackers' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDeclaringAttackers).toBeTrue();

    hub.view.set(view({ currentStep: 'DeclareAttackers', activePlayerId: THEM }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDeclaringAttackers).toBeFalse();
  });

  it('declares the attackers that were chosen', () => {
    const fixture = create();
    hub.view.set(view({ currentStep: 'DeclareAttackers' }));
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.tapMine(card({ id: 'bear' }));
    page.tapMine(card({ id: 'ox' }));
    page.tapMine(card({ id: 'ox' }));
    page.declareAttackers();

    expect(hub.declareAttackers).toHaveBeenCalledWith({ bear: THEM });
  });

  it('declares no attackers, which is itself a declaration', () => {
    const fixture = create();
    hub.view.set(view({ currentStep: 'DeclareAttackers' }));
    fixture.detectChanges();

    fixture.componentInstance.declareAttackers();

    expect(hub.declareAttackers).toHaveBeenCalledWith({});
  });

  it('assigns a blocker to the attacker it was pointed at', () => {
    const fixture = create();
    hub.view.set(
      view({
        currentStep: 'DeclareBlockers',
        activePlayerId: THEM,
        attackers: { attacker: ME },
      }),
    );
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.tapTheirs(card({ id: 'attacker', controllerId: THEM }));
    page.tapMine(card({ id: 'blocker' }));
    page.declareBlockers();

    expect(hub.declareBlockers).toHaveBeenCalledWith({ attacker: ['blocker'] });
  });

  it('adds a point each time a blocker is tapped, for a division', () => {
    // CR 510.1c is answered by picking a blocker once per point of damage, so tapping the same
    // one again means "and another point to it". Everywhere else a repeat means undo, and a
    // board that treated it that way here would make most divisions unsayable.
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: ME,
          kind: 'DivideCombatDamage',
          prompt: 'Divide 4 damage.',
          minPicks: 4,
          maxPicks: 4,
          isOrdering: false,
          isDivision: true,
          totalToDivide: 4,
          options: [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
          ],
        },
      }),
    );
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePick('first');
    page.togglePick('first');
    page.togglePick('second');
    page.togglePick('second');

    expect(page.assigned('first')).toBe(2);
    expect(page.assigned('second')).toBe(2);
    expect(page.leftToDivide).toBe(0);

    page.submitChoice();
    expect(hub.choose).toHaveBeenCalledWith(['first', 'first', 'second', 'second']);
  });

  it('will not assign more than there is to divide', () => {
    const fixture = create();
    hub.view.set(
      view({
        choice: {
          id: 'c1',
          playerId: ME,
          kind: 'DivideCombatDamage',
          prompt: 'Divide 2 damage.',
          minPicks: 2,
          maxPicks: 2,
          isOrdering: false,
          isDivision: true,
          totalToDivide: 2,
          options: [{ id: 'first', label: 'First' }],
        },
      }),
    );
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePick('first');
    page.togglePick('first');
    page.togglePick('first');

    expect(page.assigned('first')).toBe(2);
  });

  it('shows commander damage beside the life total', () => {
    // CR 903.10a: twenty-one from one commander is a second life total, and a player who cannot
    // see it is blocking blind.
    const fixture = create();
    hub.view.set(
      view({
        players: [
          player(),
          player({
            playerId: THEM,
            name: 'Bob',
            hand: null,
            commanderDamage: { Tovolar: 14 },
          }),
        ],
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gb-cmdr')?.textContent).toContain('14');
    expect(el.querySelector('.gb-cmdr')?.getAttribute('title')).toBe('Tovolar');
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
