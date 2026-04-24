import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CardModalComponent } from './card-modal.component';
import { CardDto, CardType, ManaColor, PrintingDto } from '../../models/game.models';

function makeCard(overrides: Partial<CardDto> = {}): CardDto {
  return {
    cardId: 'card-1', oracleId: 'oracle-1', name: 'Test Creature',
    manaCost: '1G', manaValue: 2,
    cardTypes: [CardType.Creature], subtypes: ['Beast'], supertypes: [],
    oracleText: 'Trample', power: 2, toughness: 2, startingLoyalty: null,
    keywords: [], imageUriNormal: null, imageUriNormalBack: null,
    imageUriSmall: null, imageUriArtCrop: null,
    colorIdentity: [ManaColor.Green], ownerId: 'p1',
    flavorText: null, artist: null, setCode: null,
    legalities: {},
    ...overrides,
  };
}

function makePrinting(overrides: Partial<PrintingDto> = {}): PrintingDto {
  return {
    scryfallId: 'scryfall-1', setCode: 'm21', setName: 'Core Set 2021',
    collectorNumber: '123', imageUriSmall: null, imageUriNormal: null,
    imageUriNormalBack: null, oracleText: null, flavorText: null,
    artist: null, manaCost: null,
    ...overrides,
  };
}

describe('CardModalComponent', () => {
  let component: CardModalComponent;
  let fixture: ComponentFixture<CardModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardModalComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CardModalComponent);
    component = fixture.componentInstance;
    component.card = makeCard();
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  // ---- displayName ----------------------------------------

  it('displayName returns full name for non-DFC card', () => {
    component.card = makeCard({ name: 'Lightning Bolt' });
    expect(component.displayName).toBe('Lightning Bolt');
  });

  it('displayName returns front name for DFC when not flipped', () => {
    component.card = makeCard({ name: 'Delver of Secrets // Insectile Aberration', imageUriNormalBack: 'back.jpg' });
    component.printings = [makePrinting({ scryfallId: 's1', imageUriNormalBack: 'back.jpg' })];
    component.viewedScryfallId = 's1';
    component.flipped = false;
    expect(component.displayName).toBe('Delver of Secrets');
  });

  it('displayName returns back name for DFC when flipped', () => {
    component.card = makeCard({ name: 'Delver of Secrets // Insectile Aberration', imageUriNormalBack: 'back.jpg' });
    component.printings = [makePrinting({ scryfallId: 's1', imageUriNormalBack: 'back.jpg' })];
    component.viewedScryfallId = 's1';
    component.flipped = true;
    expect(component.displayName).toBe('Insectile Aberration');
  });

  // ---- displayOracleText ----------------------------------------

  it('displayOracleText returns full oracle text for single-faced card', () => {
    component.card = makeCard({ oracleText: 'Flying' });
    expect(component.displayOracleText).toBe('Flying');
  });

  it('displayOracleText returns front oracle text for DFC when not flipped', () => {
    component.card = makeCard({
      name: 'Front // Back', oracleText: 'Front text\n//\nBack text', imageUriNormalBack: 'back.jpg',
    });
    component.printings = [makePrinting({ scryfallId: 's1', imageUriNormalBack: 'back.jpg' })];
    component.viewedScryfallId = 's1';
    component.flipped = false;
    expect(component.displayOracleText).toBe('Front text');
  });

  it('displayOracleText returns back oracle text for DFC when flipped', () => {
    component.card = makeCard({
      name: 'Front // Back', oracleText: 'Front text\n//\nBack text', imageUriNormalBack: 'back.jpg',
    });
    component.printings = [makePrinting({ scryfallId: 's1', imageUriNormalBack: 'back.jpg' })];
    component.viewedScryfallId = 's1';
    component.flipped = true;
    expect(component.displayOracleText).toBe('Back text');
  });

  // ---- typeLine ----------------------------------------

  it('typeLine returns card type for simple card', () => {
    component.card = makeCard({ cardTypes: [CardType.Instant], subtypes: [], supertypes: [] });
    expect(component.typeLine).toBe('Instant');
  });

  it('typeLine includes em dash and subtypes', () => {
    component.card = makeCard({
      cardTypes: [CardType.Creature], subtypes: ['Human', 'Wizard'], supertypes: [],
    });
    expect(component.typeLine).toBe('Creature — Human Wizard');
  });

  it('typeLine includes supertype prefix', () => {
    component.card = makeCard({
      cardTypes: [CardType.Land], subtypes: ['Forest'], supertypes: ['Basic'],
    });
    expect(component.typeLine).toBe('Basic Land — Forest');
  });

  // ---- isLand ----------------------------------------

  it('isLand returns true for Land card', () => {
    component.card = makeCard({ cardTypes: [CardType.Land] });
    expect(component.isLand).toBeTrue();
  });

  it('isLand returns false for Creature card', () => {
    component.card = makeCard({ cardTypes: [CardType.Creature] });
    expect(component.isLand).toBeFalse();
  });

  // ---- hasLegalities ----------------------------------------

  it('hasLegalities returns false when legalities is empty', () => {
    component.card = makeCard({ legalities: {} });
    expect(component.hasLegalities).toBeFalse();
  });

  it('hasLegalities returns true when legalities has entries', () => {
    component.card = makeCard({ legalities: { modern: 'legal', standard: 'not_legal' } });
    expect(component.hasLegalities).toBeTrue();
  });

  // ---- legalFormats ----------------------------------------

  it('legalFormats includes legal formats', () => {
    component.card = makeCard({ legalities: { modern: 'legal', legacy: 'legal', standard: 'not_legal' } });
    const labels = component.legalFormats.map(f => f.label);
    expect(labels).toContain('Modern');
    expect(labels).toContain('Legacy');
    expect(labels).not.toContain('Standard');
  });

  it('legalFormats includes restricted formats', () => {
    component.card = makeCard({ legalities: { vintage: 'restricted', modern: 'not_legal' } });
    const labels = component.legalFormats.map(f => f.label);
    expect(labels).toContain('Vintage');
  });

  it('legalFormats excludes not_legal formats', () => {
    component.card = makeCard({ legalities: { standard: 'not_legal', modern: 'legal' } });
    const labels = component.legalFormats.map(f => f.label);
    expect(labels).not.toContain('Standard');
  });

  // ---- illegalFormats ----------------------------------------

  it('illegalFormats includes not_legal formats', () => {
    component.card = makeCard({ legalities: { standard: 'not_legal', modern: 'legal' } });
    const labels = component.illegalFormats.map(f => f.label);
    expect(labels).toContain('Standard');
    expect(labels).not.toContain('Modern');
  });

  it('illegalFormats excludes legal and restricted formats', () => {
    component.card = makeCard({ legalities: { modern: 'legal', vintage: 'restricted', standard: 'not_legal' } });
    const labels = component.illegalFormats.map(f => f.label);
    expect(labels).not.toContain('Modern');
    expect(labels).not.toContain('Vintage');
    expect(labels).toContain('Standard');
  });

  // ---- close ----------------------------------------

  it('close emits the closed event', () => {
    spyOn(component.closed, 'emit');
    component.close();
    expect(component.closed.emit).toHaveBeenCalled();
  });

  // ---- toggleFlip ----------------------------------------

  it('toggleFlip flips from false to true', () => {
    component.flipped = false;
    spyOn(component.flippedChange, 'emit');
    component.toggleFlip();
    expect(component.flipped).toBeTrue();
    expect(component.flippedChange.emit).toHaveBeenCalledWith(true);
  });

  it('toggleFlip flips from true to false', () => {
    component.flipped = true;
    spyOn(component.flippedChange, 'emit');
    component.toggleFlip();
    expect(component.flipped).toBeFalse();
    expect(component.flippedChange.emit).toHaveBeenCalledWith(false);
  });

  // ---- selectPrinting ----------------------------------------

  it('selectPrinting updates viewedScryfallId and resets flip', () => {
    const printing = makePrinting({ scryfallId: 'neo-123' });
    component.flipped = true;
    spyOn(component.viewedScryfallIdChange, 'emit');
    spyOn(component.flippedChange, 'emit');

    component.selectPrinting(printing);

    expect(component.viewedScryfallId).toBe('neo-123');
    expect(component.viewedScryfallIdChange.emit).toHaveBeenCalledWith('neo-123');
    expect(component.flipped).toBeFalse();
    expect(component.flippedChange.emit).toHaveBeenCalledWith(false);
  });

  // ---- carousel ----------------------------------------

  it('carouselCanPrev is false when at start', () => {
    component.printings = [1, 2, 3].map(i => makePrinting({ scryfallId: `s${i}` }));
    component.carouselStart = 0;
    expect(component.carouselCanPrev).toBeFalse();
  });

  it('carouselCanNext is false when all fit on one page', () => {
    component.printings = [1, 2].map(i => makePrinting({ scryfallId: `s${i}` }));
    expect(component.carouselCanNext).toBeFalse();
  });

  it('carouselCanNext is true when more printings exist beyond page', () => {
    component.printings = [1, 2, 3, 4, 5, 6].map(i => makePrinting({ scryfallId: `s${i}` }));
    component.carouselStart = 0;
    expect(component.carouselCanNext).toBeTrue();
  });

  it('carouselNext advances by CAROUSEL_PAGE', () => {
    component.printings = Array.from({ length: 10 }, (_, i) => makePrinting({ scryfallId: `s${i}` }));
    component.carouselStart = 0;
    component.carouselNext();
    expect(component.carouselStart).toBe(component.CAROUSEL_PAGE);
  });

  it('carouselPrev retreats by CAROUSEL_PAGE', () => {
    component.printings = Array.from({ length: 10 }, (_, i) => makePrinting({ scryfallId: `s${i}` }));
    component.carouselStart = component.CAROUSEL_PAGE;
    component.carouselPrev();
    expect(component.carouselStart).toBe(0);
  });
});
