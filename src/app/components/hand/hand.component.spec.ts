import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { HandComponent } from './hand.component';
import {
  selectLocalPlayer, selectCurrentPhase, selectCurrentStep,
  selectIsActivePlayer, selectHasPriority, selectUIMode, selectSelectedCardId,
} from '../../store/selectors';
import { GameActions, UIActions } from '../../store';
import { CardDto, CardType, ManaColor, Phase, Step } from '../../models/game.models';

function makeCard(id: string, types: CardType[] = [CardType.Creature], cost = '1G'): CardDto {
  return {
    cardId: id, oracleId: id, name: `Card-${id}`,
    manaCost: cost, manaValue: 2,
    cardTypes: types, subtypes: [], supertypes: [], oracleText: '',
    power: 2, toughness: 2, startingLoyalty: null, keywords: [],
    imageUriNormal: null, imageUriSmall: null, imageUriArtCrop: null,
    colorIdentity: [ManaColor.Green], ownerId: 'p1',
    flavorText: null, artist: null, setCode: null,
  };
}

function makePlayer(hand: CardDto[] = []) {
  return {
    playerId: 'p1', name: 'Alice', life: 20, poisonCounters: 0,
    manaPool: { amounts: {}, total: 0 },
    handCount: hand.length, libraryCount: 30, graveyardCount: 0, exileCount: 0,
    hand, graveyard: [], exile: [], hasLandPlayedThisTurn: false,
  };
}

describe('HandComponent', () => {
  let component: HandComponent;
  let fixture: ComponentFixture<HandComponent>;
  let store: MockStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HandComponent],
      providers: [provideMockStore()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectLocalPlayer, makePlayer());
    store.overrideSelector(selectCurrentPhase, Phase.PreCombatMain);
    store.overrideSelector(selectCurrentStep, Step.Main);
    store.overrideSelector(selectIsActivePlayer, true);
    store.overrideSelector(selectHasPriority, true);
    store.overrideSelector(selectUIMode, 'idle');
    store.overrideSelector(selectSelectedCardId, null);
    store.refreshState();

    fixture = TestBed.createComponent(HandComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ---- Initial state ----------------------------------------

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('starts with empty hand when player has no cards', () => {
    expect(component.orderedCards).toEqual([]);
    expect(component.count).toBe(0);
  });

  it('populates orderedCards from store', () => {
    const card1 = makeCard('c1');
    const card2 = makeCard('c2');
    store.overrideSelector(selectLocalPlayer, makePlayer([card1, card2]));
    store.refreshState();

    expect(component.orderedCards.length).toBe(2);
    expect(component.count).toBe(2);
  });

  // ---- Card removal when played ----------------------------------------

  it('removes card from orderedCards when played from hand', () => {
    const card1 = makeCard('c1');
    const card2 = makeCard('c2');
    store.overrideSelector(selectLocalPlayer, makePlayer([card1, card2]));
    store.refreshState();
    expect(component.orderedCards.length).toBe(2);

    store.overrideSelector(selectLocalPlayer, makePlayer([card2]));
    store.refreshState();

    expect(component.orderedCards.length).toBe(1);
    expect(component.orderedCards[0].card.cardId).toBe('c2');
  });

  // ---- Castability ----------------------------------------

  it('marks creature as castable when active, has priority, main phase, can afford', () => {
    const creature = makeCard('c1', [CardType.Creature], '1G');
    store.overrideSelector(selectLocalPlayer, {
      ...makePlayer([creature]),
      manaPool: { amounts: { [ManaColor.Green]: 2 }, total: 2 },
    });
    store.overrideSelector(selectIsActivePlayer, true);
    store.overrideSelector(selectHasPriority, true);
    store.overrideSelector(selectCurrentPhase, Phase.PreCombatMain);
    store.overrideSelector(selectCurrentStep, Step.Main);
    store.refreshState();

    expect(component.orderedCards[0].isCastable).toBeTrue();
  });

  it('marks creature as not castable without enough mana', () => {
    const creature = makeCard('c1', [CardType.Creature], '3GGG');
    store.overrideSelector(selectLocalPlayer, {
      ...makePlayer([creature]),
      manaPool: { amounts: { [ManaColor.Green]: 1 }, total: 1 },
    });
    store.refreshState();

    expect(component.orderedCards[0].isCastable).toBeFalse();
  });

  it('marks land as castable when active, main phase, land not yet played', () => {
    const land = makeCard('c1', [CardType.Land], '');
    store.overrideSelector(selectLocalPlayer, {
      ...makePlayer([land]),
      hasLandPlayedThisTurn: false,
    });
    store.refreshState();

    expect(component.orderedCards[0].isCastable).toBeTrue();
  });

  it('marks land as not castable when already played one this turn', () => {
    const land = makeCard('c1', [CardType.Land], '');
    store.overrideSelector(selectLocalPlayer, {
      ...makePlayer([land]),
      hasLandPlayedThisTurn: true,
    });
    store.refreshState();

    expect(component.orderedCards[0].isCastable).toBeFalse();
  });

  // ---- Drag handlers ----------------------------------------

  it('sets draggingId on dragStart', () => {
    const dt = new DataTransfer();
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    component.onDragStart(event, 'card-1', false);

    expect(component.draggingId).toBe('card-1');
  });

  it('records isLand in dataTransfer on dragStart', () => {
    const dt = new DataTransfer();
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    component.onDragStart(event, 'land-1', true);

    expect(dt.getData('isLand')).toBe('1');
  });

  it('stores cardId in dataTransfer on dragStart', () => {
    const dt = new DataTransfer();
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    component.onDragStart(event, 'card-xyz', false);

    expect(dt.getData('cardId')).toBe('card-xyz');
  });

  it('clears drag state on dragEnd', () => {
    component.draggingId = 'card-1';
    component.dragOverId = 'card-2';
    component.onDragEnd();

    expect(component.draggingId).toBeNull();
    expect(component.dragOverId).toBeNull();
  });

  it('reorders cards when dragging over a different card', () => {
    const card1 = makeCard('c1');
    const card2 = makeCard('c2');
    store.overrideSelector(selectLocalPlayer, makePlayer([card1, card2]));
    store.refreshState();

    // Start dragging c1 over c2 → c1 should move after c2
    component.draggingId = 'c1';
    const event = new DragEvent('dragover');
    Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() });
    component.onDragOver(event, 'c2');

    expect(component.orderedCards[0].card.cardId).toBe('c2');
    expect(component.orderedCards[1].card.cardId).toBe('c1');
  });

  it('does not reorder when dragging over itself', () => {
    const card1 = makeCard('c1');
    const card2 = makeCard('c2');
    store.overrideSelector(selectLocalPlayer, makePlayer([card1, card2]));
    store.refreshState();

    component.draggingId = 'c1';
    const event = new DragEvent('dragover');
    Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() });
    component.onDragOver(event, 'c1');

    expect(component.orderedCards[0].card.cardId).toBe('c1');
    expect(component.orderedCards[1].card.cardId).toBe('c2');
  });

  it('preserves new order through subsequent store updates', () => {
    const card1 = makeCard('c1');
    const card2 = makeCard('c2');
    store.overrideSelector(selectLocalPlayer, makePlayer([card1, card2]));
    store.refreshState();

    // Reorder: c2, c1
    component.draggingId = 'c1';
    const event = new DragEvent('dragover');
    Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() });
    component.onDragOver(event, 'c2');

    // Simulate a store refresh (e.g. mana changes) without card changes
    store.overrideSelector(selectHasPriority, false);
    store.refreshState();

    expect(component.orderedCards[0].card.cardId).toBe('c2');
    expect(component.orderedCards[1].card.cardId).toBe('c1');
  });

  // ---- Click/double-click dispatches ----------------------------------------

  it('dispatches selectCard on card click', () => {
    spyOn(store, 'dispatch');
    const card = makeCard('c1');
    component.onCardClick(card);

    expect(store.dispatch).toHaveBeenCalledWith(UIActions.selectCard({ cardId: 'c1' }));
  });

  it('dispatches playLand on double-click of castable land', () => {
    spyOn(store, 'dispatch');
    const landCard = makeCard('land-1', [CardType.Land], '');
    const hc = { card: landCard, isCastable: true, isSelected: false };
    component.onCardDblClick(hc);

    expect(store.dispatch).toHaveBeenCalledWith(GameActions.playLand({ cardId: 'land-1' }));
  });

  it('dispatches castSpell on double-click of castable spell', () => {
    spyOn(store, 'dispatch');
    const creatureCard = makeCard('c1', [CardType.Creature], '1G');
    const hc = { card: creatureCard, isCastable: true, isSelected: false };
    component.onCardDblClick(hc);

    expect(store.dispatch).toHaveBeenCalledWith(
      GameActions.castSpell({ cardId: 'c1', targetIds: [] })
    );
  });

  it('does not dispatch on double-click of non-castable card', () => {
    spyOn(store, 'dispatch');
    const card = makeCard('c1');
    const hc = { card, isCastable: false, isSelected: false };
    component.onCardDblClick(hc);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  // ---- isLand helper ----------------------------------------

  it('isLand returns true for land cards', () => {
    const land = makeCard('l1', [CardType.Land], '');
    expect(component.isLand({ card: land, isCastable: false, isSelected: false })).toBeTrue();
  });

  it('isLand returns false for creature cards', () => {
    const creature = makeCard('c1', [CardType.Creature], '2G');
    expect(component.isLand({ card: creature, isCastable: false, isSelected: false })).toBeFalse();
  });

  // ---- cardDims ----------------------------------------

  it('cardDims scales proportionally with handHeight', () => {
    component.handHeight = 200;
    const { w, h } = component.cardDims;
    expect(h).toBe(Math.round(200 * 0.72));
    expect(w).toBe(Math.round(h * (88 / 123)));
  });

  it('cardDims clamps minimum card height to 80', () => {
    component.handHeight = 50;
    expect(component.cardDims.h).toBe(80);
  });

  it('cardDims clamps maximum card height to 380', () => {
    component.handHeight = 700;
    expect(component.cardDims.h).toBe(380);
  });
});
