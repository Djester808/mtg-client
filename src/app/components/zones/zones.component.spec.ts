import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ZonesComponent } from './zones.component';
import { GameActions, UIActions } from '../../store';
import { makePermanent, makeCard } from '../../testing/test-factories';
import { CardType } from '../../models/game.models';
import { of } from 'rxjs';

describe('ZonesComponent', () => {
  let component: ZonesComponent;
  let fixture: ComponentFixture<ZonesComponent>;
  let store: MockStore;

  function makeDropEvent(cardId: string, isLand: boolean): DragEvent {
    const dt = new DataTransfer();
    dt.setData('cardId', cardId);
    dt.setData('isLand', isLand ? '1' : '0');
    return new DragEvent('drop', { dataTransfer: dt });
  }

  function makeDragOverEvent(): DragEvent {
    const dt = new DataTransfer();
    return new DragEvent('dragover', { dataTransfer: dt, cancelable: true });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonesComponent],
      providers: [provideMockStore()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(ZonesComponent);
    component = fixture.componentInstance;
    component.isOpponent = false;
    component.permanents = [];
    component.label = 'Your Battlefield';
    fixture.detectChanges();
  });

  // ---- Who may be declared as an attacker (CR 302.6, 508.1a, 702.3b) ----
  //
  // The board used to mark anything on your side, and the engine refused the finished
  // declaration — which throws away the whole attack because one creature was ineligible.
  // These are the rules the view already has everything it needs to apply.

  const creature = (over = {}) =>
    makePermanent({
      sourceCard: makeCard({ cardTypes: [CardType.Creature], keywords: [] }),
      ...over,
    });

  it('lets a creature you have controlled since your turn began attack', () => {
    expect(component.canAttack(creature())).toBe(true);
  });

  it('refuses a creature with summoning sickness (CR 302.6)', () => {
    expect(component.canAttack(creature({ hasSummoningSickness: true }))).toBe(false);
  });

  it('lets a summoning-sick creature with haste attack (CR 702.10b)', () => {
    const hasty = creature({ hasSummoningSickness: true });
    hasty.sourceCard = makeCard({ cardTypes: [CardType.Creature], keywords: ['Haste'] });
    expect(component.canAttack(hasty)).toBe(true);
  });

  it('refuses a tapped creature (CR 508.1a)', () => {
    expect(component.canAttack(creature({ isTapped: true }))).toBe(false);
  });

  it('refuses a creature with defender (CR 702.3b)', () => {
    const wall = creature();
    wall.sourceCard = makeCard({ cardTypes: [CardType.Creature], keywords: ['Defender'] });
    expect(component.canAttack(wall)).toBe(false);
  });

  it('refuses something that is not a creature', () => {
    const land = makePermanent({ sourceCard: makeCard({ cardTypes: [CardType.Land] }) });
    expect(component.canAttack(land)).toBe(false);
  });

  it('does not mark an illegal attacker when it is clicked', () => {
    const spy = spyOn(store, 'dispatch');
    component.onCardClick(
      creature({ hasSummoningSickness: true }),
      'declaring-attackers',
      true,
      [],
    );

    expect(spy).not.toHaveBeenCalledWith(UIActions.toggleAttacker({ permanentId: 'perm-1' }));
  });

  it('marks a legal attacker when it is clicked', () => {
    const spy = spyOn(store, 'dispatch');
    component.onCardClick(creature(), 'declaring-attackers', true, []);

    expect(spy).toHaveBeenCalledWith(UIActions.toggleAttacker({ permanentId: 'perm-1' }));
  });

  // ---- Activating what a permanent can actually do (CR 602.1) ----
  //
  // The board used to know one ability: the word "mana", on a card whose type was Land. A Sol
  // Ring is an artifact, so it could not be tapped; a pinger's ability had no way in at all.
  // What a permanent can do now comes from the engine, and tapping a land is the ordinary case
  // rather than the only one.

  const ability = (over = {}) => ({
    id: 'mana',
    text: '{T}: Add {C}.',
    requiresTap: true,
    targetCount: 0,
    isManaAbility: true,
    announcesVariable: false,
    ...over,
  });

  it('activates the one ability a permanent is ready to use', () => {
    const rock = makePermanent({ abilities: [ability()] });
    const spy = spyOn(store, 'dispatch');

    component.onCardClick(rock, 'idle', true, []);

    // What an ability needs before it can be sent — a number, targets, neither — is answered
    // once in `abilityChosen$`, because the menu below reaches the very same code.
    expect(spy).toHaveBeenCalledWith(
      UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'mana' }),
    );
  });

  it('offers the list when a permanent has two abilities to choose between', () => {
    // The case a tap cannot express. Before the menu the click fell through to selecting the
    // card, so a Prodigal Pyromancer's ping and its pump were both unreachable and nothing on
    // screen said either existed.
    const twoWays = makePermanent({
      abilities: [
        ability({ id: 'ping', text: '{T}: Deal 1 damage to any target.', isManaAbility: false }),
        ability({ id: 'pump', text: '{1}: +1/+0 until end of turn.', requiresTap: false }),
      ],
    });
    const spy = spyOn(store, 'dispatch');

    component.onCardClick(twoWays, 'idle', true, []);

    expect(spy).toHaveBeenCalledWith(UIActions.openAbilityMenu({ permanentId: 'perm-1' }));
    expect(spy).not.toHaveBeenCalledWith(UIActions.selectCard({ permanentId: 'perm-1' }));
  });

  it('does not offer a tap ability on something already tapped', () => {
    const spent = makePermanent({ isTapped: true, abilities: [ability()] });

    expect(component.readyAbility(spent)).toBeNull();
  });

  it('offers nothing on a permanent with no abilities', () => {
    expect(component.readyAbility(makePermanent({ abilities: [] }))).toBeNull();
  });

  it('sends nothing straight away for an ability that needs a target (CR 602.2b)', () => {
    // The asking itself moved to `abilityChosen$`, which is where the rules' order lives; what
    // matters here is that the click still does not put an activation on the wire by itself.
    const icy = makePermanent({
      abilities: [ability({ id: 'tap', targetCount: 1, isManaAbility: false })],
    });
    const spy = spyOn(store, 'dispatch');

    component.onCardClick(icy, 'idle', true, []);

    expect(spy).toHaveBeenCalledWith(
      UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'tap' }),
    );
    expect(spy).not.toHaveBeenCalledWith(
      GameActions.activateAbility({ permanentId: 'perm-1', abilityId: 'tap', targetIds: [] }),
    );
  });

  it('does not offer a creature tap ability the turn it arrives (CR 302.6)', () => {
    // The same rule that stops it attacking also stops it paying {T} for an ability, and the
    // board applied it to attacking only — so a pinger offered a ping the engine would refuse.
    const pinger = makePermanent({
      hasSummoningSickness: true,
      sourceCard: makeCard({ cardTypes: [CardType.Creature], keywords: [] }),
      abilities: [ability({ id: 'ping', isManaAbility: false })],
    });

    expect(component.readyAbility(pinger)).toBeNull();
  });

  it('offers it when the creature has haste (CR 702.10c)', () => {
    const hasty = makePermanent({
      hasSummoningSickness: true,
      sourceCard: makeCard({ cardTypes: [CardType.Creature], keywords: ['Haste'] }),
      abilities: [ability({ id: 'ping', isManaAbility: false })],
    });

    expect(component.readyAbility(hasty)?.id).toBe('ping');
  });

  it('lets a fresh noncreature permanent be tapped at once', () => {
    // CR 302.6 is about creatures. A Sol Ring taps for mana the turn it lands.
    const rock = makePermanent({
      hasSummoningSickness: true,
      sourceCard: makeCard({ cardTypes: [CardType.Artifact] }),
      abilities: [ability()],
    });

    expect(component.readyAbility(rock)?.id).toBe('mana');
  });

  it('does not guess between two abilities', () => {
    // A click that silently picked the first would be worse than one that does nothing.
    const twoWays = makePermanent({
      abilities: [ability({ id: 'a' }), ability({ id: 'b' })],
    });

    expect(component.readyAbility(twoWays)).toBeNull();
  });

  it('still taps a land for mana, as the ordinary case', () => {
    const forest = makePermanent({
      sourceCard: makeCard({ cardTypes: [CardType.Land] }),
      abilities: [ability()],
    });
    const spy = spyOn(store, 'dispatch');

    component.onCardClick(forest, 'idle', true, []);

    expect(spy).toHaveBeenCalledWith(
      UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'mana' }),
    );
  });

  // ---- Initial state ----------------------------------------

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('starts with dropActive = false', () => {
    expect(component.dropActive).toBeFalse();
  });

  // ---- onZoneDragOver ----------------------------------------

  it('sets dropActive when dragging over own zone', () => {
    component.isOpponent = false;
    const event = makeDragOverEvent();
    component.onZoneDragOver(event);

    expect(component.dropActive).toBeTrue();
  });

  it('does not set dropActive when dragging over opponent zone', () => {
    component.isOpponent = true;
    const event = makeDragOverEvent();
    component.onZoneDragOver(event);

    expect(component.dropActive).toBeFalse();
  });

  it('calls preventDefault on dragover for own zone', () => {
    component.isOpponent = false;
    const event = makeDragOverEvent();
    spyOn(event, 'preventDefault');
    component.onZoneDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('does not call preventDefault on dragover for opponent zone', () => {
    component.isOpponent = true;
    const event = makeDragOverEvent();
    spyOn(event, 'preventDefault');
    component.onZoneDragOver(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  // ---- onZoneDragLeave ----------------------------------------

  it('clears dropActive on dragleave', () => {
    component.dropActive = true;
    component.onZoneDragLeave();

    expect(component.dropActive).toBeFalse();
  });

  // ---- onZoneDrop ----------------------------------------

  it('dispatches playLand when a land card is dropped on own zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = makeDropEvent('land-1', true);

    component.onZoneDrop(event);

    expect(store.dispatch).toHaveBeenCalledWith(GameActions.playLand({ cardId: 'land-1' }));
  });

  it('dispatches castSpell when a non-land card is dropped on own zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = makeDropEvent('spell-1', false);

    component.onZoneDrop(event);

    expect(store.dispatch).toHaveBeenCalledWith(
      GameActions.castSpell({ cardId: 'spell-1', targetIds: [] }),
    );
  });

  it('does not dispatch when dropped on opponent zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = true;
    const event = makeDropEvent('card-1', false);

    component.onZoneDrop(event);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when dataTransfer has no cardId', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });

    component.onZoneDrop(event);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('clears dropActive after drop', () => {
    component.dropActive = true;
    component.isOpponent = false;
    const event = makeDropEvent('card-1', false);

    component.onZoneDrop(event);

    expect(component.dropActive).toBeFalse();
  });

  it('calls preventDefault on drop', () => {
    component.isOpponent = false;
    const event = makeDropEvent('card-1', false);
    spyOn(event, 'preventDefault');

    component.onZoneDrop(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  // ---- onBattlefieldClick ----------------------------------------

  it('dispatches deselectCard when the battlefield background is clicked', () => {
    spyOn(store, 'dispatch');
    component.onBattlefieldClick();

    expect(store.dispatch).toHaveBeenCalledWith(UIActions.deselectCard());
  });

  it('keeps idle creature clicks reserved for game actions rather than opening the inspector', () => {
    const spy = spyOn(store, 'dispatch');
    component.onCardClick(creature(), 'idle', true, []);
    expect(spy).not.toHaveBeenCalled();
  });
  it('keeps opponent idle clicks reserved for game actions', () => {
    const spy = spyOn(store, 'dispatch');
    component.isOpponent = true;
    component.onCardClick(creature(), 'idle', false, []);
    expect(spy).not.toHaveBeenCalled();
  });

  it('routes a flat battlefield card click to exactly one primary action', () => {
    component.ui$ = of({
      mode: 'idle',
      canAct: true,
      pendingAttackers: [],
      selectedPermId: null,
      combat: null,
      isActive: true,
      blocker: null,
      blocks: {},
      attackerTargets: {},
      players: [],
    });
    spyOn(fixture.nativeElement, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 800, 320),
    );
    fixture.componentRef.setInput('permanents', [makePermanent({ abilities: [ability()] })]);
    fixture.detectChanges();
    const spy = spyOn(store, 'dispatch');
    const wrapper: HTMLElement = fixture.nativeElement.querySelector('.flat-card');
    expect(wrapper).withContext(fixture.nativeElement.innerHTML).not.toBeNull();
    wrapper.click();
    expect(spy).toHaveBeenCalledOnceWith(
      UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'mana' }),
    );
    wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    const outside = jasmine.createSpy('outside click');
    document.addEventListener('click', outside);
    try {
      const inspect: HTMLButtonElement = fixture.nativeElement.querySelector('[role="menuitem"]');
      inspect.click();
      expect(spy).toHaveBeenCalledWith(UIActions.selectCard({ permanentId: 'perm-1' }));
      expect(outside).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', outside);
    }
  });

  it('does not activate an ability while a decision or another players priority blocks actions', () => {
    const dispatch = spyOn(store, 'dispatch');
    component.onCardClick(makePermanent({ abilities: [ability()] }), 'idle', true, [], null, false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
