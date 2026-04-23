import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CardComponent } from './card.component';
import { CardDto, CardType, CounterType, ManaColor, PermanentDto } from '../../models/game.models';

function makeCardDto(overrides: Partial<CardDto> = {}): CardDto {
  return {
    cardId: 'card-1', oracleId: 'oracle-1', name: 'Test Creature',
    manaCost: '1G', manaValue: 2,
    cardTypes: [CardType.Creature], subtypes: ['Beast'], supertypes: [],
    oracleText: 'Trample', power: 2, toughness: 2, startingLoyalty: null,
    keywords: [], imageUriNormal: null, imageUriSmall: null, imageUriArtCrop: null,
    colorIdentity: [ManaColor.Green], ownerId: 'p1',
    flavorText: null, artist: null, setCode: null,
    ...overrides,
  };
}

const emptyCounters: Record<CounterType, number> = {
  [CounterType.PlusOnePlusOne]:   0,
  [CounterType.MinusOneMinusOne]: 0,
  [CounterType.Loyalty]:          0,
  [CounterType.Charge]:           0,
  [CounterType.Poison]:           0,
};

function makePermanent(overrides: Partial<PermanentDto> = {}): PermanentDto {
  return {
    permanentId: 'perm-1',
    sourceCard: makeCardDto(),
    controllerId: 'p1',
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: { ...emptyCounters },
    attachments: [],
    effectivePower: 2,
    effectiveToughness: 2,
    ...overrides,
  };
}

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  // ---- cardData ----------------------------------------

  it('cardData returns null when no inputs provided', () => {
    expect(component.cardData).toBeNull();
  });

  it('cardData returns card when only card input is set', () => {
    component.card = makeCardDto({ name: 'My Card' });
    expect(component.cardData!.name).toBe('My Card');
  });

  it('cardData returns sourceCard from permanent, not the card input', () => {
    const permCard = makeCardDto({ name: 'Perm Card' });
    component.permanent = makePermanent({ sourceCard: permCard });
    component.card = makeCardDto({ name: 'Hand Card' });
    expect(component.cardData!.name).toBe('Perm Card');
  });

  // ---- isTapped ----------------------------------------

  it('isTapped is false when no permanent is provided', () => {
    expect(component.isTapped).toBeFalse();
  });

  it('isTapped is false when permanent is not tapped', () => {
    component.permanent = makePermanent({ isTapped: false });
    expect(component.isTapped).toBeFalse();
  });

  it('isTapped is true when permanent.isTapped is true', () => {
    component.permanent = makePermanent({ isTapped: true });
    expect(component.isTapped).toBeTrue();
  });

  it('applies tapped CSS class when isTapped is true', () => {
    fixture.componentRef.setInput('permanent', makePermanent({ isTapped: true }));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.card');
    expect(el.classList).toContain('tapped');
  });

  // ---- isCreature / isLand ----------------------------------------

  it('isCreature returns true for a creature card', () => {
    component.card = makeCardDto({ cardTypes: [CardType.Creature] });
    expect(component.isCreature).toBeTrue();
  });

  it('isCreature returns false for a land card', () => {
    component.card = makeCardDto({ cardTypes: [CardType.Land] });
    expect(component.isCreature).toBeFalse();
  });

  it('isLand returns true for a land card', () => {
    component.card = makeCardDto({ cardTypes: [CardType.Land] });
    expect(component.isLand).toBeTrue();
  });

  it('isLand returns false for a creature card', () => {
    component.card = makeCardDto({ cardTypes: [CardType.Creature] });
    expect(component.isLand).toBeFalse();
  });

  // ---- typeLineText ----------------------------------------

  it('typeLineText returns card types joined when no subtypes', () => {
    component.card = makeCardDto({ cardTypes: [CardType.Instant], subtypes: [] });
    expect(component.typeLineText).toBe('Instant');
  });

  it('typeLineText includes em dash and subtypes when present', () => {
    component.card = makeCardDto({
      cardTypes: [CardType.Creature],
      subtypes: ['Beast', 'Cat'],
    });
    expect(component.typeLineText).toBe('Creature — Beast Cat');
  });

  it('typeLineText returns empty string when cardData is null', () => {
    expect(component.typeLineText).toBe('');
  });

  // ---- effectivePower / Toughness ----------------------------------------

  it('effectivePower returns null when no permanent', () => {
    expect(component.effectivePower).toBeNull();
  });

  it('effectivePower returns value from permanent', () => {
    component.permanent = makePermanent({ effectivePower: 5 });
    expect(component.effectivePower).toBe(5);
  });

  it('effectiveToughness returns value from permanent', () => {
    component.permanent = makePermanent({ effectiveToughness: 7 });
    expect(component.effectiveToughness).toBe(7);
  });

  // ---- damageMarked ----------------------------------------

  it('damageMarked is 0 when no permanent', () => {
    expect(component.damageMarked).toBe(0);
  });

  it('damageMarked reflects permanent value', () => {
    component.permanent = makePermanent({ damageMarked: 3 });
    expect(component.damageMarked).toBe(3);
  });

  // ---- counters ----------------------------------------

  it('counters returns empty array when no permanent', () => {
    expect(component.counters).toEqual([]);
  });

  it('counters returns empty array when permanent has no counters', () => {
    component.permanent = makePermanent({ counters: { ...emptyCounters } });
    expect(component.counters).toEqual([]);
  });

  it('counters includes +1 badge when PlusOnePlusOne is set', () => {
    component.permanent = makePermanent({
      counters: { ...emptyCounters, [CounterType.PlusOnePlusOne]: 2 },
    });
    const labels = component.counters.map(c => c.label);
    expect(labels).toContain('+1');
  });

  it('counters includes -1 badge when MinusOneMinusOne is set', () => {
    component.permanent = makePermanent({
      counters: { ...emptyCounters, [CounterType.MinusOneMinusOne]: 1 },
    });
    const cls = component.counters.map(c => c.cls);
    expect(cls).toContain('minus');
  });

  it('counters includes loyalty badge when Loyalty counter is set', () => {
    component.permanent = makePermanent({
      counters: { ...emptyCounters, [CounterType.Loyalty]: 4 },
    });
    const found = component.counters.find(c => c.cls === 'loyalty');
    expect(found).toBeDefined();
    expect(found!.label).toBe('4');
  });

  // ---- isCastable CSS class ----------------------------------------

  it('castable class is absent by default', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.card');
    expect(el.classList).not.toContain('castable');
  });

  it('castable class is applied when isCastable input is true', () => {
    fixture.componentRef.setInput('isCastable', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.card');
    expect(el.classList).toContain('castable');
  });

  // ---- events ----------------------------------------

  it('emits clicked event on click', () => {
    spyOn(component.clicked, 'emit');
    component.onClick();
    expect(component.clicked.emit).toHaveBeenCalled();
  });

  it('emits dblClicked event on double-click', () => {
    spyOn(component.dblClicked, 'emit');
    component.onDblClick();
    expect(component.dblClicked.emit).toHaveBeenCalled();
  });

  it('emits hoverEnter with cardData when mouseenter fires and cardData is set', () => {
    const card = makeCardDto({ name: 'Hover Card' });
    component.card = card;
    spyOn(component.hoverEnter, 'emit');
    component.onMouseEnter();
    expect(component.hoverEnter.emit).toHaveBeenCalledWith(card);
  });

  it('does not emit hoverEnter when cardData is null', () => {
    spyOn(component.hoverEnter, 'emit');
    component.onMouseEnter();
    expect(component.hoverEnter.emit).not.toHaveBeenCalled();
  });

  it('emits hoverLeave on mouse leave', () => {
    spyOn(component.hoverLeave, 'emit');
    component.onMouseLeave();
    expect(component.hoverLeave.emit).toHaveBeenCalled();
  });
});
