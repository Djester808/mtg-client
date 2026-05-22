import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CardComponent } from './card.component';
import { CardType } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

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

  // ---- cardData -------------------------------------------

  it('cardData returns null when no card input', () => {
    expect(component.cardData).toBeNull();
  });

  it('cardData returns the card input when set', () => {
    component.card = makeCard({ name: 'My Card' });
    expect(component.cardData!.name).toBe('My Card');
  });

  // ---- isCreature / isLand --------------------------------

  it('isCreature returns true for a creature card', () => {
    component.card = makeCard({ cardTypes: [CardType.Creature] });
    expect(component.isCreature).toBeTrue();
  });

  it('isCreature returns false for a land card', () => {
    component.card = makeCard({ cardTypes: [CardType.Land] });
    expect(component.isCreature).toBeFalse();
  });

  it('isLand returns true for a land card', () => {
    component.card = makeCard({ cardTypes: [CardType.Land] });
    expect(component.isLand).toBeTrue();
  });

  it('isLand returns false for a creature card', () => {
    component.card = makeCard({ cardTypes: [CardType.Creature] });
    expect(component.isLand).toBeFalse();
  });

  // ---- typeLineText ----------------------------------------

  it('typeLineText returns card type when no subtypes', () => {
    component.card = makeCard({ cardTypes: [CardType.Instant], subtypes: [] });
    expect(component.typeLineText).toBe('Instant');
  });

  it('typeLineText includes em dash and subtypes when present', () => {
    component.card = makeCard({ cardTypes: [CardType.Creature], subtypes: ['Beast', 'Cat'] });
    expect(component.typeLineText).toBe('Creature — Beast Cat');
  });

  it('typeLineText returns empty string when cardData is null', () => {
    expect(component.typeLineText).toBe('');
  });

  // ---- events ---------------------------------------------

  it('emits clicked on click', () => {
    spyOn(component.clicked, 'emit');
    component.onClick();
    expect(component.clicked.emit).toHaveBeenCalled();
  });

  it('emits dblClicked on double-click', () => {
    spyOn(component.dblClicked, 'emit');
    component.onDblClick();
    expect(component.dblClicked.emit).toHaveBeenCalled();
  });

  it('emits hoverEnter with card when mouseenter fires', () => {
    const card = makeCard({ name: 'Hover Card' });
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
