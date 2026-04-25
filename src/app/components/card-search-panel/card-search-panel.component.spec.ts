import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { CardSearchPanelComponent } from './card-search-panel.component';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { makeCard } from '../../testing/test-factories';
import { CardDto } from '../../models/game.models';
import { PrintingDto } from '../../models/collection.models';

function makeCards(n: number): CardDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
  );
}

function makePrinting(scryfallId: string, setCode = 'lea'): PrintingDto {
  return {
    scryfallId, setCode, setName: 'Alpha', collectorNumber: '1',
    imageUriSmall: null, imageUriNormal: null, imageUriNormalBack: null,
    oracleText: null, flavorText: null, artist: null, manaCost: null,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildModule(gameApi: jasmine.SpyObj<GameApiService>, collectionApi: jasmine.SpyObj<CollectionApiService>) {
  return TestBed.configureTestingModule({
    imports: [CardSearchPanelComponent, CommonModule, ReactiveFormsModule, FormsModule],
    providers: [
      { provide: GameApiService,       useValue: gameApi },
      { provide: CollectionApiService, useValue: collectionApi },
    ],
  })
  .overrideComponent(CardSearchPanelComponent, {
    remove: { imports: [ManaCostComponent, CardModalComponent] },
  })
  .compileComponents();
}

function makeSpies() {
  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards', 'getSets']);
  gameApi.searchCards.and.returnValue(of([]));
  gameApi.getSets.and.returnValue(of([]));
  const collectionApi = jasmine.createSpyObj<CollectionApiService>('CollectionApiService', ['getPrintings']);
  collectionApi.getPrintings.and.returnValue(of([]));
  return { gameApi, collectionApi };
}

/** Init component inside fakeAsync, flush the initial empty-query debounce. */
function initComponent(fixture: ComponentFixture<CardSearchPanelComponent>): void {
  fixture.detectChanges(); // triggers ngOnInit inside fakeAsync zone
  tick(400);               // flush the initial empty-query debounce (returns of(null))
}

// ── Search flags (toggle state) ───────────────────────────────────────────────

describe('CardSearchPanelComponent — search flags (state)', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, collectionApi } = makeSpies();
    await buildModule(gameApi, collectionApi);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('defaults matchCase, matchWord, useRegex to false', () => {
    expect(component.matchCase).toBeFalse();
    expect(component.matchWord).toBeFalse();
    expect(component.useRegex).toBeFalse();
  });

  it('toggleMatchCase flips matchCase', () => {
    component.toggleMatchCase(); expect(component.matchCase).toBeTrue();
    component.toggleMatchCase(); expect(component.matchCase).toBeFalse();
  });

  it('toggleMatchWord flips matchWord', () => {
    component.toggleMatchWord(); expect(component.matchWord).toBeTrue();
    component.toggleMatchWord(); expect(component.matchWord).toBeFalse();
  });

  it('toggleUseRegex flips useRegex', () => {
    component.toggleUseRegex(); expect(component.useRegex).toBeTrue();
    component.toggleUseRegex(); expect(component.useRegex).toBeFalse();
  });
});

// ── Search flags (passed to API) ──────────────────────────────────────────────

describe('CardSearchPanelComponent — search flags (API args)', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    const spies = makeSpies();
    gameApi = spies.gameApi;
    await buildModule(gameApi, spies.collectionApi);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('passes matchCase=true to searchCards when flag is active', fakeAsync(() => {
    initComponent(fixture);
    component.matchCase = true;
    component.searchText.setValue('rat');
    tick(400);

    const args = gameApi.searchCards.calls.mostRecent().args;
    expect(args[5]).toBeTrue();  // matchCase
    expect(args[6]).toBeFalse(); // matchWord
    expect(args[7]).toBeFalse(); // useRegex
  }));

  it('passes matchWord=true to searchCards when flag is active', fakeAsync(() => {
    initComponent(fixture);
    component.matchWord = true;
    component.searchText.setValue('rat');
    tick(400);

    const args = gameApi.searchCards.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeTrue();
    expect(args[7]).toBeFalse();
  }));

  it('passes useRegex=true to searchCards when flag is active', fakeAsync(() => {
    initComponent(fixture);
    component.useRegex = true;
    component.searchText.setValue('^Rat');
    tick(400);

    const args = gameApi.searchCards.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeFalse();
    expect(args[7]).toBeTrue();
  }));

  it('passes all flags false when none active', fakeAsync(() => {
    initComponent(fixture);
    component.searchText.setValue('bolt');
    tick(400);

    const args = gameApi.searchCards.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeFalse();
    expect(args[7]).toBeFalse();
  }));
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('CardSearchPanelComponent — pagination', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    const spies = makeSpies();
    gameApi = spies.gameApi;
    await buildModule(gameApi, spies.collectionApi);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('hasMore is false initially', fakeAsync(() => {
    initComponent(fixture);
    expect(component.hasMore).toBeFalse();
  }));

  it('hasMore is true when first page is full (PAGE_SIZE results)', fakeAsync(() => {
    initComponent(fixture);
    gameApi.searchCards.and.returnValue(of(makeCards(component.PAGE_SIZE)));
    component.searchText.setValue('rat');
    tick(400);

    expect(component.hasMore).toBeTrue();
  }));

  it('hasMore is false when results fewer than page size', fakeAsync(() => {
    initComponent(fixture);
    gameApi.searchCards.and.returnValue(of(makeCards(7)));
    component.searchText.setValue('rat');
    tick(400);

    expect(component.hasMore).toBeFalse();
  }));

  it('loadMore appends results to the existing list', fakeAsync(() => {
    initComponent(fixture);
    gameApi.searchCards.and.returnValue(of(makeCards(component.PAGE_SIZE)));
    component.searchText.setValue('rat');
    tick(400);
    expect(component.results).toHaveSize(component.PAGE_SIZE);

    gameApi.searchCards.and.returnValue(of(makeCards(10)));
    component.loadMore();
    tick(10);

    expect(component.results).toHaveSize(component.PAGE_SIZE + 10);
  }));

  it('loadMore passes current offset to searchCards', fakeAsync(() => {
    initComponent(fixture);
    gameApi.searchCards.and.returnValue(of(makeCards(component.PAGE_SIZE)));
    component.searchText.setValue('rat');
    tick(400);

    gameApi.searchCards.and.returnValue(of(makeCards(5)));
    component.loadMore();
    tick(10);

    const args = gameApi.searchCards.calls.mostRecent().args;
    expect(args[2]).toBe(component.PAGE_SIZE); // offset = first page size
  }));
});

// ── Eager printing load & auto-select ────────────────────────────────────────

describe('CardSearchPanelComponent — eager printing load & auto-select', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;
  let collectionApi: jasmine.SpyObj<CollectionApiService>;

  beforeEach(async () => {
    const spies = makeSpies();
    gameApi = spies.gameApi;
    collectionApi = spies.collectionApi;
    gameApi.searchCards.and.returnValue(of(makeCards(3)));
    await buildModule(gameApi, collectionApi);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('calls getPrintings for each new search result', fakeAsync(() => {
    initComponent(fixture);
    component.searchText.setValue('rat');
    tick(400);

    expect(collectionApi.getPrintings.calls.count()).toBe(3);
  }));

  it('calls getPrintings with each result oracle id', fakeAsync(() => {
    initComponent(fixture);
    component.searchText.setValue('rat');
    tick(400);

    const ids = collectionApi.getPrintings.calls.allArgs().map(a => a[0] as string);
    expect(ids).toContain('oracle-0');
    expect(ids).toContain('oracle-1');
    expect(ids).toContain('oracle-2');
  }));

  it('skips getPrintings for cards already in printingsCache', fakeAsync(() => {
    initComponent(fixture);
    component.printingsCache.set('oracle-0', [makePrinting('cached-scry')]);

    component.searchText.setValue('rat');
    tick(400);

    expect(collectionApi.getPrintings.calls.count()).toBe(2);
    const ids = collectionApi.getPrintings.calls.allArgs().map(a => a[0] as string);
    expect(ids).not.toContain('oracle-0');
  }));

  it('auto-selects scryfallId when card has exactly one printing', fakeAsync(() => {
    initComponent(fixture);
    collectionApi.getPrintings.and.returnValue(of([makePrinting('scry-only')]));

    component.searchText.setValue('rat');
    tick(400);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-only');
  }));

  it('auto-selects the correct scryfallId per card', fakeAsync(() => {
    initComponent(fixture);
    collectionApi.getPrintings.and.callFake((oracleId: string) =>
      of([makePrinting(`scry-for-${oracleId}`)]),
    );

    component.searchText.setValue('rat');
    tick(400);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-for-oracle-0');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-for-oracle-1');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-for-oracle-2');
  }));

  it('does NOT auto-select when card has multiple printings', fakeAsync(() => {
    initComponent(fixture);
    collectionApi.getPrintings.and.returnValue(
      of([makePrinting('scry-1'), makePrinting('scry-2')]),
    );

    component.searchText.setValue('rat');
    tick(400);

    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeFalse();
  }));

  it('clears old auto-selections when a new search starts', fakeAsync(() => {
    initComponent(fixture);
    collectionApi.getPrintings.and.returnValue(of([makePrinting('scry-only')]));
    component.searchText.setValue('rat');
    tick(400);
    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeTrue();

    collectionApi.getPrintings.and.returnValue(
      of([makePrinting('scry-1'), makePrinting('scry-2')]),
    );
    component.searchText.setValue('bolt');
    tick(400);

    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeFalse();
  }));
});

// ── Flip ─────────────────────────────────────────────────────────────────────

describe('CardSearchPanelComponent — flip', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;

  const DFC = makeCard({
    cardId: 'dfc-1', oracleId: 'oracle-dfc',
    imageUriSmall: 'front-small.jpg', imageUriNormalBack: 'back-normal.jpg',
  });
  const NORMAL = makeCard({
    cardId: 'normal-1', oracleId: 'oracle-normal',
    imageUriSmall: 'front-small.jpg', imageUriNormalBack: null,
  });

  beforeEach(async () => {
    const { gameApi, collectionApi } = makeSpies();
    await buildModule(gameApi, collectionApi);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('toggleFlip adds oracleId to flippedIds on first toggle', () => {
    component.toggleFlip('oracle-dfc', new MouseEvent('click'));
    expect(component.flippedIds.has('oracle-dfc')).toBeTrue();
  });

  it('toggleFlip removes oracleId on second toggle', () => {
    component.toggleFlip('oracle-dfc', new MouseEvent('click'));
    component.toggleFlip('oracle-dfc', new MouseEvent('click'));
    expect(component.flippedIds.has('oracle-dfc')).toBeFalse();
  });

  it('toggleFlip stops event propagation', () => {
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', ['stopPropagation']);
    component.toggleFlip('oracle-dfc', event);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('cardImage returns imageUriSmall when not flipped', () => {
    expect(component.cardImage(DFC)).toBe('front-small.jpg');
  });

  it('cardImage returns imageUriNormalBack when flipped', () => {
    component.toggleFlip('oracle-dfc', new MouseEvent('click'));
    expect(component.cardImage(DFC)).toBe('back-normal.jpg');
  });

  it('cardImage returns imageUriSmall when flipped but no back face', () => {
    component.toggleFlip('oracle-normal', new MouseEvent('click'));
    expect(component.cardImage(NORMAL)).toBe('front-small.jpg');
  });

  it('clears flippedIds when a new search fires', fakeAsync(() => {
    initComponent(fixture);
    component.toggleFlip('oracle-dfc', new MouseEvent('click'));
    expect(component.flippedIds.size).toBe(1);

    component.searchText.setValue('rat');
    tick(400);

    expect(component.flippedIds.size).toBe(0);
  }));
});

// ── addCard event ─────────────────────────────────────────────────────────────

describe('CardSearchPanelComponent — addCard', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, collectionApi } = makeSpies();
    await buildModule(gameApi, collectionApi);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('emits cardAdd with oracleId and scryfallId when printing is selected', () => {
    const card = makeCard({ oracleId: 'oracle-x' });
    component.searchSelectedScryfallId.set('oracle-x', 'scry-x');

    const emitted: { oracleId: string; scryfallId: string }[] = [];
    component.cardAdd.subscribe(e => emitted.push(e));

    component.addCard(card);

    expect(emitted.length).toBe(1);
    expect(emitted[0].oracleId).toBe('oracle-x');
    expect(emitted[0].scryfallId).toBe('scry-x');
  });

  it('sets addError and does NOT emit when no printing selected', () => {
    const card = makeCard({ oracleId: 'oracle-y' });

    let emitted = false;
    component.cardAdd.subscribe(() => (emitted = true));

    component.addCard(card);

    expect(emitted).toBeFalse();
    expect(component.addErrors.has('oracle-y')).toBeTrue();
  });

  it('clears addError after a printing is selected and added', () => {
    const card = makeCard({ oracleId: 'oracle-z' });
    component.addErrors.add('oracle-z');
    component.searchSelectedScryfallId.set('oracle-z', 'scry-z');

    component.addCard(card);

    expect(component.addErrors.has('oracle-z')).toBeFalse();
  });
});
