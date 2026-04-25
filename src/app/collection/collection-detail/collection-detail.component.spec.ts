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
