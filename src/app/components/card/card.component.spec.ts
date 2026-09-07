import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CardComponent } from './card.component';
import { CardType, CounterType } from '../../models/game.models';
import { makeCard, makePermanent, emptyCounters } from '../../testing/test-factories';

const makeCardDto = makeCard;

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

  // ---- which admission the object is on the board under ----
  //
  // A card is enforced, badged honour-system, or refused (CARD_ENGINE_PLAN.md). Both of the two
  // that reach a table are badged: no badge would read as "nobody has said", which is the one
  // thing a table playing some cards by hand cannot be left to infer.

  it('badges a permanent the engine plays as enforced', () => {
    component.permanent = makePermanent({ enforced: true });
    expect(component.admission).toBe('enforced');
  });

  it('badges a permanent the players play as honour-system', () => {
    component.permanent = makePermanent({ enforced: false });
    expect(component.admission).toBe('honour');
  });

  it('badges a card that is not a permanent at all with neither (CR 110.1)', () => {
    component.card = makeCard();
    expect(component.admission).toBeNull();
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
    const labels = component.counters.map((c) => c.label);
    expect(labels).toContain('+1');
  });

  it('counters includes -1 badge when MinusOneMinusOne is set', () => {
    component.permanent = makePermanent({
      counters: { ...emptyCounters, [CounterType.MinusOneMinusOne]: 1 },
    });
    const cls = component.counters.map((c) => c.cls);
    expect(cls).toContain('minus');
  });

  it('counters includes loyalty badge when Loyalty counter is set', () => {
    component.permanent = makePermanent({
      counters: { ...emptyCounters, [CounterType.Loyalty]: 4 },
    });
    const found = component.counters.find((c) => c.cls === 'loyalty');
    expect(found).toBeDefined();
    expect(found!.label).toBe('4');
  });

  // ---- attachments (CR 303.4, 704.5m) --------------------------------

  it('hasAttachments is false when no permanent', () => {
    expect(component.hasAttachments).toBeFalse();
  });

  it('hasAttachments is false for an ordinary, unattached permanent', () => {
    // The negative control: a bare creature carries nothing.
    component.permanent = makePermanent({ attachments: [] });
    expect(component.hasAttachments).toBeFalse();
  });

  it('reports what is attached, by name, when the engine says something is', () => {
    component.permanent = makePermanent({ attachments: ['Rancor'] });
    expect(component.hasAttachments).toBeTrue();
    expect(component.attachments).toEqual(['Rancor']);
  });

  it('renders a badge on the card face for an attached permanent', () => {
    // setInput, not a plain property assignment: this component is OnPush, and a directly
    // mutated field never marks the view dirty, so `fixture.detectChanges()` would leave the
    // old DOM standing — see `applies tapped CSS class` above for the same pattern.
    fixture.componentRef.setInput(
      'permanent',
      makePermanent({ sourceCard: makeCard({ name: 'Bear' }), attachments: ['Rancor'] }),
    );
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.counter-badge.attached');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('🔗');
  });

  it('renders two-or-more attachments as a count on the badge', () => {
    fixture.componentRef.setInput(
      'permanent',
      makePermanent({
        sourceCard: makeCard({ name: 'Bear' }),
        attachments: ['Rancor', 'Sword of Fire and Ice'],
      }),
    );
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.counter-badge.attached');
    expect(badge.textContent.trim()).toBe('🔗2');
  });

  it('renders no attachment badge for an ordinary permanent', () => {
    // The negative control for the DOM assertion above: nothing attached, nothing drawn.
    fixture.componentRef.setInput(
      'permanent',
      makePermanent({ sourceCard: makeCard({ name: 'Bear' }), attachments: [] }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.counter-badge.attached')).toBeFalsy();
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
