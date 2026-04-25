import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CoverPickerModalComponent } from './cover-picker-modal.component';
import { GameApiService } from '../../services/game-api.service';
import { CardDto } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function makeCardDto(overrides: Partial<CardDto> = {}): CardDto {
  return makeCard({ imageUriNormal: 'normal.jpg', imageUriSmall: 'small.jpg', imageUriArtCrop: 'art.jpg', ...overrides });
}

async function setup(currentCoverUri: string | null = null) {
  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards']);
  gameApi.searchCards.and.returnValue(of([]));

  await TestBed.configureTestingModule({
    imports: [CoverPickerModalComponent],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [{ provide: GameApiService, useValue: gameApi }],
  }).compileComponents();

  const fixture = TestBed.createComponent(CoverPickerModalComponent);
  const component = fixture.componentInstance;
  component.currentCoverUri = currentCoverUri;
  fixture.detectChanges();
  return { component, fixture, gameApi };
}

describe('CoverPickerModalComponent — initial state', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates the component', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('loading is false by default', async () => {
    const { component } = await setup();
    expect(component.loading).toBeFalse();
  });

  it('searched is false by default', async () => {
    const { component } = await setup();
    expect(component.searched).toBeFalse();
  });

  it('results is empty by default', async () => {
    const { component } = await setup();
    expect(component.results).toHaveSize(0);
  });
});

describe('CoverPickerModalComponent — cardImageUri', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns imageUriNormal when available', async () => {
    const { component } = await setup();
    const card = makeCardDto({ imageUriNormal: 'n.jpg', imageUriSmall: 's.jpg' });
    expect(component.cardImageUri(card)).toBe('n.jpg');
  });

  it('falls back to imageUriSmall when imageUriNormal is null', async () => {
    const { component } = await setup();
    const card = makeCardDto({ imageUriNormal: null, imageUriSmall: 's.jpg' });
    expect(component.cardImageUri(card)).toBe('s.jpg');
  });

  it('returns null when both image uris are null', async () => {
    const { component } = await setup();
    const card = makeCardDto({ imageUriNormal: null, imageUriSmall: null });
    expect(component.cardImageUri(card)).toBeNull();
  });
});

describe('CoverPickerModalComponent — isSelected', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns true when currentCoverUri matches imageUriArtCrop', async () => {
    const { component } = await setup('art.jpg');
    const card = makeCardDto({ imageUriArtCrop: 'art.jpg', imageUriNormal: 'normal.jpg' });
    expect(component.isSelected(card)).toBeTrue();
  });

  it('returns true when currentCoverUri matches imageUriNormal', async () => {
    const { component } = await setup('normal.jpg');
    const card = makeCardDto({ imageUriArtCrop: 'art.jpg', imageUriNormal: 'normal.jpg' });
    expect(component.isSelected(card)).toBeTrue();
  });

  it('returns false when currentCoverUri matches neither', async () => {
    const { component } = await setup('other.jpg');
    const card = makeCardDto({ imageUriArtCrop: 'art.jpg', imageUriNormal: 'normal.jpg' });
    expect(component.isSelected(card)).toBeFalse();
  });

  it('returns false when currentCoverUri is null', async () => {
    const { component } = await setup(null);
    const card = makeCardDto({ imageUriArtCrop: 'art.jpg', imageUriNormal: 'normal.jpg' });
    expect(component.isSelected(card)).toBeFalse();
  });
});

describe('CoverPickerModalComponent — selectCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('emits imageUriArtCrop when available', async () => {
    const { component } = await setup();
    spyOn(component.coverSelected, 'emit');
    component.selectCard(makeCardDto({ imageUriArtCrop: 'art.jpg', imageUriNormal: 'normal.jpg' }));
    expect(component.coverSelected.emit).toHaveBeenCalledWith('art.jpg');
  });

  it('emits imageUriNormal when artCrop is null', async () => {
    const { component } = await setup();
    spyOn(component.coverSelected, 'emit');
    component.selectCard(makeCardDto({ imageUriArtCrop: null, imageUriNormal: 'normal.jpg' }));
    expect(component.coverSelected.emit).toHaveBeenCalledWith('normal.jpg');
  });

  it('emits null when both artCrop and imageUriNormal are null', async () => {
    const { component } = await setup();
    spyOn(component.coverSelected, 'emit');
    component.selectCard(makeCardDto({ imageUriArtCrop: null, imageUriNormal: null }));
    expect(component.coverSelected.emit).toHaveBeenCalledWith(null);
  });
});

describe('CoverPickerModalComponent — close / overlayClick', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('close emits closed event', async () => {
    const { component } = await setup();
    spyOn(component.closed, 'emit');
    component.close();
    expect(component.closed.emit).toHaveBeenCalled();
  });

  it('overlayClick emits closed when target has cp-overlay class', async () => {
    const { component } = await setup();
    spyOn(component.closed, 'emit');
    const div = document.createElement('div');
    div.classList.add('cp-overlay');
    const event = { target: div } as unknown as MouseEvent;
    component.overlayClick(event);
    expect(component.closed.emit).toHaveBeenCalled();
  });

  it('overlayClick does not emit closed when target is inner element', async () => {
    const { component } = await setup();
    spyOn(component.closed, 'emit');
    const div = document.createElement('div');
    div.classList.add('cp-modal');
    const event = { target: div } as unknown as MouseEvent;
    component.overlayClick(event);
    expect(component.closed.emit).not.toHaveBeenCalled();
  });
});
