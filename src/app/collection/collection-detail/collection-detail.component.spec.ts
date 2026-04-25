import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { CollectionDetailComponent } from './collection-detail.component';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { makeCard } from '../../testing/test-factories';
import { CardDto } from '../../models/game.models';
import { PrintingDto } from '../../models/collection.models';

function makeCards(n: number): CardDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
  );
}

const INITIAL_STATE = {
  collection: {
    collections: [],
    activeCollection: { id: 'col-1', name: 'Test', description: null, createdAt: '', updatedAt: '', cards: [] },
    loading: false,
    error: null,
  },
};

describe('CollectionDetailComponent — search flags', () => {
  let component: CollectionDetailComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;
  let searchSpy: jasmine.Spy;

  beforeEach(async () => {
    gameApi = jasmine.createSpyObj('GameApiService', ['searchCards']);
    gameApi.searchCards.and.returnValue(of([]));

    const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CollectionDetailComponent, CommonModule, FormsModule],
      providers: [
        provideMockStore({ initialState: INITIAL_STATE }),
        { provide: GameApiService,       useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: Router,               useValue: { navigate: jasmine.createSpy() } },
        { provide: ActivatedRoute,       useValue: { snapshot: { paramMap: { get: () => 'col-1' } } } },
      ],
    })
    .overrideComponent(CollectionDetailComponent, {
      remove: { imports: [ManaCostComponent, OracleSymbolsPipe, CardModalComponent] },
    })
    .compileComponents();

    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    searchSpy = gameApi.searchCards;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  // ---- Initial state ------------------------------------------

  it('defaults all search flags to false', () => {
    expect(component.searchMatchCase).toBeFalse();
    expect(component.searchMatchWord).toBeFalse();
    expect(component.searchUseRegex).toBeFalse();
  });

  // ---- Toggle methods -----------------------------------------

  it('toggleSearchMatchCase flips searchMatchCase', () => {
    component.toggleSearchMatchCase();
    expect(component.searchMatchCase).toBeTrue();
    component.toggleSearchMatchCase();
    expect(component.searchMatchCase).toBeFalse();
  });

  it('toggleSearchMatchWord flips searchMatchWord', () => {
    component.toggleSearchMatchWord();
    expect(component.searchMatchWord).toBeTrue();
    component.toggleSearchMatchWord();
    expect(component.searchMatchWord).toBeFalse();
  });

  it('toggleSearchUseRegex flips searchUseRegex', () => {
    component.toggleSearchUseRegex();
    expect(component.searchUseRegex).toBeTrue();
    component.toggleSearchUseRegex();
    expect(component.searchUseRegex).toBeFalse();
  });

  // ---- Flags passed to searchCards ----------------------------

  it('passes matchCase=true when flag is active', fakeAsync(() => {
    component.searchMatchCase = true;
    component.onSearchInput('rat');
    tick(200);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue();  // matchCase
    expect(args[6]).toBeFalse(); // matchWord
    expect(args[7]).toBeFalse(); // useRegex
  }));

  it('passes matchWord=true when flag is active', fakeAsync(() => {
    component.searchMatchWord = true;
    component.onSearchInput('rat');
    tick(200);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeTrue();
    expect(args[7]).toBeFalse();
  }));

  it('passes useRegex=true when flag is active', fakeAsync(() => {
    component.searchUseRegex = true;
    component.onSearchInput('^Rat');
    tick(200);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeFalse();
    expect(args[7]).toBeTrue();
  }));

  it('passes all flags false when none active', fakeAsync(() => {
    component.onSearchInput('bolt');
    tick(200);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeFalse();
    expect(args[7]).toBeFalse();
  }));

  // ---- Toggling a flag while searching re-runs search ---------

  it('toggleSearchMatchCase re-triggers search when query is active', fakeAsync(() => {
    component.searchQuery = 'rat';
    component.onSearchInput('rat');
    tick(200);
    const callsBefore = searchSpy.calls.count();

    component.toggleSearchMatchCase();
    tick(200);

    expect(searchSpy.calls.count()).toBeGreaterThan(callsBefore);
    expect(searchSpy.calls.mostRecent().args[5]).toBeTrue();
  }));

  it('toggleSearchMatchWord re-triggers search when query is active', fakeAsync(() => {
    component.searchQuery = 'rat';
    component.onSearchInput('rat');
    tick(200);
    const callsBefore = searchSpy.calls.count();

    component.toggleSearchMatchWord();
    tick(200);

    expect(searchSpy.calls.count()).toBeGreaterThan(callsBefore);
    expect(searchSpy.calls.mostRecent().args[6]).toBeTrue();
  }));

  it('toggleSearchUseRegex re-triggers search when query is active', fakeAsync(() => {
    component.searchQuery = '^Rat';
    component.onSearchInput('^Rat');
    tick(200);
    const callsBefore = searchSpy.calls.count();

    component.toggleSearchUseRegex();
    tick(200);

    expect(searchSpy.calls.count()).toBeGreaterThan(callsBefore);
    expect(searchSpy.calls.mostRecent().args[7]).toBeTrue();
  }));

  it('toggling flag does NOT trigger search when query is empty', fakeAsync(() => {
    component.searchQuery = '';
    const callsBefore = searchSpy.calls.count();

    component.toggleSearchMatchCase();
    tick(200);

    expect(searchSpy.calls.count()).toBe(callsBefore);
  }));

  // ---- Pagination ---------------------------------------------

  it('searchHasMore is false initially', () => {
    expect(component.searchHasMore).toBeFalse();
  });

  it('searchHasMore is true when first page is full (20 results)', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);

    expect(component.searchHasMore).toBeTrue();
  }));

  it('searchHasMore is false when results fewer than page size', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(7)));
    component.onSearchInput('rat');
    tick(200);

    expect(component.searchHasMore).toBeFalse();
  }));

  it('loadMoreSearch appends results to existing list', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);
    expect(component.searchResults).toHaveSize(20);

    gameApi.searchCards.and.returnValue(of(makeCards(10)));
    component.loadMoreSearch();
    tick(10);

    expect(component.searchResults).toHaveSize(30);
  }));

  it('loadMoreSearch clears searchHasMore when page is partial', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);

    gameApi.searchCards.and.returnValue(of(makeCards(5)));
    component.loadMoreSearch();
    tick(10);

    expect(component.searchHasMore).toBeFalse();
  }));

  it('loadMoreSearch passes current offset to searchCards', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);

    gameApi.searchCards.and.returnValue(of(makeCards(5)));
    component.loadMoreSearch();
    tick(10);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[2]).toBe(20); // offset = first page size
  }));

  it('loadMoreSearch carries current flags forward', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.searchMatchCase = true;
    component.onSearchInput('Rat');
    tick(200);

    gameApi.searchCards.and.returnValue(of(makeCards(5)));
    component.loadMoreSearch();
    tick(10);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue(); // matchCase forwarded
  }));

  it('new search resets offset back to 0', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);
    component.loadMoreSearch();
    tick(10);

    // New query should start from 0
    gameApi.searchCards.and.returnValue(of(makeCards(5)));
    component.onSearchInput('bolt');
    tick(200);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[2]).toBe(0);
  }));
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makePrinting(scryfallId: string, setCode = 'lea'): PrintingDto {
  return {
    scryfallId,
    setCode,
    setName: 'Alpha',
    collectorNumber: '1',
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriNormalBack: null,
    oracleText: null,
    flavorText: null,
    artist: null,
    manaCost: null,
  };
}

// ── Eager printing load & auto-select ────────────────────────────────────────

describe('CollectionDetailComponent — eager printing load & auto-select', () => {
  let component: CollectionDetailComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;
  let collectionApi: jasmine.SpyObj<CollectionApiService>;

  const CARDS_3 = () => makeCards(3);  // oracle-0, oracle-1, oracle-2

  beforeEach(async () => {
    gameApi = jasmine.createSpyObj('GameApiService', ['searchCards']);
    gameApi.searchCards.and.returnValue(of(CARDS_3()));

    collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CollectionDetailComponent, CommonModule, FormsModule],
      providers: [
        provideMockStore({ initialState: INITIAL_STATE }),
        { provide: GameApiService,       useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: Router,               useValue: { navigate: jasmine.createSpy() } },
        { provide: ActivatedRoute,       useValue: { snapshot: { paramMap: { get: () => 'col-1' } } } },
      ],
    })
    .overrideComponent(CollectionDetailComponent, {
      remove: { imports: [ManaCostComponent, OracleSymbolsPipe, CardModalComponent] },
    })
    .compileComponents();

    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  // ---- Eager loading ------------------------------------------

  it('calls getPrintings for each new search result', fakeAsync(() => {
    component.onSearchInput('rat');
    tick(200);

    expect(collectionApi.getPrintings.calls.count()).toBe(3);
  }));

  it('calls getPrintings with each result card oracleId', fakeAsync(() => {
    component.onSearchInput('rat');
    tick(200);

    const ids = collectionApi.getPrintings.calls.allArgs().map(a => a[0] as string);
    expect(ids).toContain('oracle-0');
    expect(ids).toContain('oracle-1');
    expect(ids).toContain('oracle-2');
  }));

  it('skips getPrintings for cards already in printingsCache', fakeAsync(() => {
    component.printingsCache.set('oracle-0', [makePrinting('cached-scry')]);

    component.onSearchInput('rat');
    tick(200);

    expect(collectionApi.getPrintings.calls.count()).toBe(2);
    const ids = collectionApi.getPrintings.calls.allArgs().map(a => a[0] as string);
    expect(ids).not.toContain('oracle-0');
  }));

  it('calls getPrintings for load-more results', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);
    collectionApi.getPrintings.calls.reset();

    const newCards = [20, 21, 22].map(i =>
      makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
    );
    gameApi.searchCards.and.returnValue(of(newCards));
    component.loadMoreSearch();
    tick(10);

    expect(collectionApi.getPrintings.calls.count()).toBe(3);
    const ids = collectionApi.getPrintings.calls.allArgs().map(a => a[0] as string);
    expect(ids).toContain('oracle-20');
    expect(ids).toContain('oracle-21');
    expect(ids).toContain('oracle-22');
  }));

  it('skips getPrintings on load-more for cards already in cache', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    component.onSearchInput('rat');
    tick(200);
    // oracle-0..19 are now in printingsCache (getPrintings returned [])
    collectionApi.getPrintings.calls.reset();

    // Load-more returns cards already in cache
    gameApi.searchCards.and.returnValue(of(makeCards(3))); // oracle-0, oracle-1, oracle-2
    component.loadMoreSearch();
    tick(10);

    expect(collectionApi.getPrintings.calls.count()).toBe(0);
  }));

  // ---- Auto-select single print ------------------------------

  it('auto-selects scryfallId when card has exactly one printing', fakeAsync(() => {
    collectionApi.getPrintings.and.returnValue(of([makePrinting('scry-only')]));

    component.onSearchInput('rat');
    tick(200);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-only');
  }));

  it('auto-selects the correct scryfallId per card', fakeAsync(() => {
    collectionApi.getPrintings.and.callFake((oracleId: string) =>
      of([makePrinting(`scry-for-${oracleId}`)]),
    );

    component.onSearchInput('rat');
    tick(200);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-for-oracle-0');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-for-oracle-1');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-for-oracle-2');
  }));

  it('does NOT auto-select when card has multiple printings', fakeAsync(() => {
    collectionApi.getPrintings.and.returnValue(
      of([makePrinting('scry-1'), makePrinting('scry-2')]),
    );

    component.onSearchInput('rat');
    tick(200);

    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeFalse();
  }));

  it('clears old auto-selections when a new search starts', fakeAsync(() => {
    collectionApi.getPrintings.and.returnValue(of([makePrinting('scry-only')]));
    component.onSearchInput('rat');
    tick(200);
    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeTrue();

    // New search with multi-print cards — old selections wiped, none auto-selected
    collectionApi.getPrintings.and.returnValue(
      of([makePrinting('scry-1'), makePrinting('scry-2')]),
    );
    component.onSearchInput('bolt');
    tick(200);

    expect(component.searchSelectedScryfallId.has('oracle-0')).toBeFalse();
  }));

  it('load-more auto-selects new single-print cards', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    collectionApi.getPrintings.and.returnValue(of([]));
    component.onSearchInput('rat');
    tick(200);

    const newCards = [20, 21].map(i =>
      makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
    );
    gameApi.searchCards.and.returnValue(of(newCards));
    collectionApi.getPrintings.and.callFake((oracleId: string) =>
      of([makePrinting(`scry-${oracleId}`)]),
    );
    component.loadMoreSearch();
    tick(10);

    expect(component.searchSelectedScryfallId.get('oracle-20')).toBe('scry-oracle-20');
    expect(component.searchSelectedScryfallId.get('oracle-21')).toBe('scry-oracle-21');
  }));

  it('does not overwrite a manual selection when load-more reloads the same card', fakeAsync(() => {
    // First page: oracle-0 gets a single-print auto-selection
    gameApi.searchCards.and.returnValue(of(makeCards(20)));
    collectionApi.getPrintings.and.returnValue(of([makePrinting('scry-auto')]));
    component.onSearchInput('rat');
    tick(200);

    // User changes their mind and picks a different printing
    component.searchSelectedScryfallId.set('oracle-0', 'scry-manual');

    // Remove oracle-0 from cache so load-more would re-fetch it
    component.printingsCache.delete('oracle-0');
    // Load-more returns oracle-0 again (edge case) with one printing
    gameApi.searchCards.and.returnValue(of(makeCards(1)));
    collectionApi.getPrintings.and.callFake((oracleId: string) =>
      of(oracleId === 'oracle-0' ? [makePrinting('scry-new')] : []),
    );
    component.loadMoreSearch();
    tick(10);

    // Manual selection must be preserved
    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-manual');
  }));
});

// ── Search-panel flip ─────────────────────────────────────────────────────────

describe('CollectionDetailComponent — search panel flip', () => {
  let component: CollectionDetailComponent;

  const DFC_CARD = makeCard({
    cardId: 'dfc-1', oracleId: 'oracle-dfc',
    imageUriSmall: 'front-small.jpg', imageUriNormalBack: 'back-normal.jpg',
  });
  const NORMAL_CARD = makeCard({
    cardId: 'normal-1', oracleId: 'oracle-normal',
    imageUriSmall: 'front-small.jpg', imageUriNormalBack: null,
  });

  beforeEach(async () => {
    const gameApi = jasmine.createSpyObj('GameApiService', ['searchCards']);
    gameApi.searchCards.and.returnValue(of([]));
    const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CollectionDetailComponent, CommonModule, FormsModule],
      providers: [
        provideMockStore({ initialState: INITIAL_STATE }),
        { provide: GameApiService,       useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: Router,               useValue: { navigate: jasmine.createSpy() } },
        { provide: ActivatedRoute,       useValue: { snapshot: { paramMap: { get: () => 'col-1' } } } },
      ],
    })
    .overrideComponent(CollectionDetailComponent, {
      remove: { imports: [ManaCostComponent, OracleSymbolsPipe, CardModalComponent] },
    })
    .compileComponents();

    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  // ---- toggleSearchFlip ----------------------------------------

  it('adds oracleId to searchFlippedIds on first toggle', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    expect(component.searchFlippedIds.has('oracle-dfc')).toBeTrue();
  });

  it('removes oracleId from searchFlippedIds on second toggle', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    component.toggleSearchFlip('oracle-dfc', event);
    expect(component.searchFlippedIds.has('oracle-dfc')).toBeFalse();
  });

  it('stops propagation so the preview modal does not open', () => {
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', ['stopPropagation']);
    component.toggleSearchFlip('oracle-dfc', event);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  // ---- searchCardImage -----------------------------------------

  it('returns imageUriSmall when card is not flipped', () => {
    expect(component.searchCardImage(DFC_CARD)).toBe('front-small.jpg');
  });

  it('returns imageUriNormalBack when card is flipped', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    expect(component.searchCardImage(DFC_CARD)).toBe('back-normal.jpg');
  });

  it('returns imageUriSmall even when flipped if card has no back face', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-normal', event);
    expect(component.searchCardImage(NORMAL_CARD)).toBe('front-small.jpg');
  });

  // ---- State resets -------------------------------------------

  it('clears searchFlippedIds when a new search fires', fakeAsync(() => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    expect(component.searchFlippedIds.size).toBe(1);

    component.onSearchInput('rat');
    tick(200);

    expect(component.searchFlippedIds.size).toBe(0);
  }));

  it('clears searchFlippedIds when the search panel is closed', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    component.showSearchPanel = true;

    component.toggleSearchPanel();

    expect(component.searchFlippedIds.size).toBe(0);
  });

  it('does not clear searchFlippedIds when panel opens', () => {
    const event = new MouseEvent('click');
    component.toggleSearchFlip('oracle-dfc', event);
    component.showSearchPanel = false;

    component.toggleSearchPanel(); // opens

    expect(component.searchFlippedIds.has('oracle-dfc')).toBeTrue();
  });
});
