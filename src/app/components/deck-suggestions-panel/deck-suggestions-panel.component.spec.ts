import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DeckSuggestionsPanelComponent } from './deck-suggestions-panel.component';
import { DeckApiService, DeckDetailDto } from '../../services/deck-api.service';
import { GameApiService } from '../../services/game-api.service';
import { PrintingsService } from '../../services/printings.service';
import { makeCard } from '../../testing/test-factories';

/**
 * The empty state is the whole panel until Generate has run, and Generate itself lives on
 * the commander bar — which only a deck with a commander has. Told to "click Generate", a
 * commanderless deck pointed at a button that was not on screen, with no way out of the
 * panel; these cover what each case now offers instead.
 */
function makeDeck(overrides: Partial<DeckDetailDto> = {}): DeckDetailDto {
  return {
    id: 'deck-1',
    name: 'Chief of the Wilds',
    coverUri: null,
    format: 'commander',
    commanderOracleId: null,
    tags: [],
    notes: null,
    isPublished: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cards: [],
    ...overrides,
  };
}

describe('DeckSuggestionsPanelComponent — empty state', () => {
  let fixture: ComponentFixture<DeckSuggestionsPanelComponent>;
  let component: DeckSuggestionsPanelComponent;

  const text = () =>
    (fixture.nativeElement.querySelector('.sugg-empty') as HTMLElement).textContent?.replace(
      /\s+/g,
      ' ',
    ) ?? '';
  const emptyButton = () =>
    fixture.nativeElement.querySelector('.sugg-empty .sugg-empty-btn') as HTMLButtonElement | null;

  /** The button wears the page's primary-action class, not a look of its own. */
  const emptyButtonIsPagePrimary = () => emptyButton()?.classList.contains('add-btn-primary');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeckSuggestionsPanelComponent],
      providers: [
        {
          provide: DeckApiService,
          useValue: jasmine.createSpyObj<DeckApiService>('DeckApiService', [
            'getSuggestionsStream',
          ]),
        },
        {
          provide: GameApiService,
          useValue: jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards']),
        },
        {
          provide: PrintingsService,
          useValue: jasmine.createSpyObj<PrintingsService>('PrintingsService', ['get']),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckSuggestionsPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('points at Generate only when the commander bar that carries it is on screen', () => {
    component.deck = makeDeck();
    component.commanderCard = makeCard({ name: 'Chief of the Wilds' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sugg-generate-btn')).toBeTruthy();
    expect(text()).toContain('Generate');
    expect(emptyButton()).toBeNull();
  });

  it('offers a way to pick a commander when the deck has none', () => {
    component.deck = makeDeck();
    component.commanderCard = null;
    fixture.detectChanges();

    expect(text()).not.toContain('Click Generate');
    const btn = emptyButton();
    expect(btn).toBeTruthy();
    expect(emptyButtonIsPagePrimary())
      .withContext('same button vocabulary as "+ Add Cards" on this page')
      .toBeTrue();
    expect(btn!.textContent).toContain('Choose a Commander');
  });

  it('the commander button asks the deck page to open the picker', () => {
    component.deck = makeDeck();
    component.commanderCard = null;
    fixture.detectChanges();
    const asked = jasmine.createSpy('commanderRequested');
    component.commanderRequested.subscribe(asked);

    emptyButton()!.click();

    expect(asked).toHaveBeenCalled();
  });

  it('says suggestions are Commander-only on a deck of another format, with no button', () => {
    component.deck = makeDeck({ format: 'standard' });
    component.commanderCard = null;
    fixture.detectChanges();

    expect(component.isCommanderDeck).toBeFalse();
    expect(text()).toContain('Commander-only');
    expect(emptyButton()).toBeNull();
  });
});
