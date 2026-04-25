import { TestBed, fakeAsync, tick, ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ElementRef, ChangeDetectorRef } from '@angular/core';
import { provideMockStore } from '@ngrx/store/testing';
import { of, Subject } from 'rxjs';
import { HomeComponent } from './home.component';
import { GameApiService } from '../services/game-api.service';
import { CollectionApiService } from '../services/collection-api.service';
import { ManaCostComponent } from '../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../components/card-modal/card-modal.component';
import { makeCard } from '../testing/test-factories';
import { CardDto } from '../models/game.models';

function makeCards(n: number): CardDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
  );
}

describe('HomeComponent — search flags', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let gameApi: jasmine.SpyObj<GameApiService>;
  let searchSpy: jasmine.Spy;

  beforeEach(async () => {
    gameApi = jasmine.createSpyObj('GameApiService', ['searchCards', 'getSets']);
    gameApi.getSets.and.returnValue(of([]));
    gameApi.searchCards.and.returnValue(of([]));

    const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent, CommonModule, ReactiveFormsModule, FormsModule],
      providers: [
        provideMockStore({ initialState: { game: { cards: {} } } }),
        { provide: GameApiService,      useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: ElementRef, useValue: { nativeElement: document.createElement('div') } },
        ChangeDetectorRef,
      ],
    })
    .overrideComponent(HomeComponent, { remove: { imports: [ManaCostComponent, CardModalComponent] } })
    .compileComponents();
  });

  // Create the component inside fakeAsync so ngOnInit's debounce timers are
  // fake timers from the start, allowing tick() to control them reliably.
  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    searchSpy = gameApi.searchCards;
    fixture.detectChanges();
    tick(400); // drain initial debounce (empty query → no searchCards call)
    searchSpy.calls.reset();
  }));

  afterEach(() => TestBed.resetTestingModule());

  // ---- Initial state ------------------------------------------

  it('defaults all flags to false', () => {
    expect(component.matchCase).toBeFalse();
    expect(component.matchWord).toBeFalse();
    expect(component.useRegex).toBeFalse();
  });

  // ---- Toggle methods -----------------------------------------

  it('toggleMatchCase flips matchCase', () => {
    component.toggleMatchCase();
    expect(component.matchCase).toBeTrue();
    component.toggleMatchCase();
    expect(component.matchCase).toBeFalse();
  });

  it('toggleMatchWord flips matchWord', () => {
    component.toggleMatchWord();
    expect(component.matchWord).toBeTrue();
    component.toggleMatchWord();
    expect(component.matchWord).toBeFalse();
  });

  it('toggleUseRegex flips useRegex', () => {
    component.toggleUseRegex();
    expect(component.useRegex).toBeTrue();
    component.toggleUseRegex();
    expect(component.useRegex).toBeFalse();
  });

  // ---- clearFilters resets flags ------------------------------

  it('clearFilters resets all flags to false', () => {
    component.matchCase = true;
    component.matchWord = true;
    component.useRegex  = true;

    component.clearFilters();

    expect(component.matchCase).toBeFalse();
    expect(component.matchWord).toBeFalse();
    expect(component.useRegex).toBeFalse();
  });

  // ---- Flags passed to searchCards ----------------------------

  it('passes matchCase=true to searchCards when flag is active', fakeAsync(() => {
    component.matchCase = true;
    component.searchText.setValue('lightning');
    tick(400);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue();  // matchCase
    expect(args[6]).toBeFalse(); // matchWord
    expect(args[7]).toBeFalse(); // useRegex
  }));

  it('passes matchWord=true to searchCards when flag is active', fakeAsync(() => {
    component.matchWord = true;
    component.searchText.setValue('bolt');
    tick(400);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse(); // matchCase
    expect(args[6]).toBeTrue();  // matchWord
    expect(args[7]).toBeFalse(); // useRegex
  }));

  it('passes useRegex=true to searchCards when flag is active', fakeAsync(() => {
    component.useRegex = true;
    component.searchText.setValue('^Bolt');
    tick(400);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse(); // matchCase
    expect(args[6]).toBeFalse(); // matchWord
    expect(args[7]).toBeTrue();  // useRegex
  }));

  it('passes all three flags when all active', fakeAsync(() => {
    component.matchCase = true;
    component.matchWord = true;
    component.useRegex  = true;
    component.searchText.setValue('Rat');
    tick(400);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue();
    expect(args[6]).toBeTrue();
    expect(args[7]).toBeTrue();
  }));

  it('passes all false when no flags active', fakeAsync(() => {
    component.searchText.setValue('rat');
    tick(400);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeFalse();
    expect(args[6]).toBeFalse();
    expect(args[7]).toBeFalse();
  }));

  // ---- Toggling a flag re-triggers an active search -----------

  it('toggling matchCase re-runs the search', fakeAsync(() => {
    component.searchText.setValue('rat');
    tick(400);
    const callsBefore = searchSpy.calls.count();

    component.toggleMatchCase();
    tick(400);

    expect(searchSpy.calls.count()).toBeGreaterThan(callsBefore);
    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue();
  }));

  // ---- Load more passes current flags -------------------------

  it('loadMore passes current flags to searchCards', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of(makeCards(60))); // full page → hasMore
    component.matchCase = true;
    component.searchText.setValue('rat');
    tick(400);

    gameApi.searchCards.and.returnValue(of(makeCards(10)));
    component.loadMore();
    tick(10);

    const args = searchSpy.calls.mostRecent().args;
    expect(args[5]).toBeTrue(); // matchCase carried forward
  }));
});

// ── Home query builder ────────────────────────────────────────────────────────

describe('HomeComponent — query builder', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let gameApi: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    gameApi = jasmine.createSpyObj('GameApiService', ['searchCards', 'getSets']);
    gameApi.getSets.and.returnValue(of([]));
    gameApi.searchCards.and.returnValue(of([]));
    const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent, CommonModule, ReactiveFormsModule, FormsModule],
      providers: [
        provideMockStore({ initialState: { game: { cards: {} } } }),
        { provide: GameApiService,       useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: ElementRef,           useValue: { nativeElement: document.createElement('div') } },
        ChangeDetectorRef,
      ],
    })
    .overrideComponent(HomeComponent, { remove: { imports: [ManaCostComponent, CardModalComponent] } })
    .compileComponents();
  });

  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick(400);
    gameApi.searchCards.calls.reset();
    gameApi.getSets.calls.reset();
  }));

  afterEach(() => TestBed.resetTestingModule());

  it('sends name+oracle OR query for plain text', fakeAsync(() => {
    component.searchText.setValue('flying');
    tick(400);
    const query: string = gameApi.searchCards.calls.mostRecent().args[0];
    expect(query).toBe('(name:"flying" or o:"flying")');
  }));

  it('includes oracle text token in getSets call', fakeAsync(() => {
    component.searchText.setValue('flying');
    tick(400);
    const q: string | undefined = gameApi.getSets.calls.mostRecent().args[0];
    expect(q).toContain('o:"flying"');
  }));

  it('does not search when text is shorter than 2 characters', fakeAsync(() => {
    component.searchText.setValue('f');
    tick(400);
    expect(gameApi.searchCards).not.toHaveBeenCalled();
  }));

  it('appends set token to query when activeSet is set', fakeAsync(() => {
    component.activeSet = 'dom';
    component.searchText.setValue('flying');
    tick(400);
    const query: string = gameApi.searchCards.calls.mostRecent().args[0];
    expect(query).toContain('(name:"flying" or o:"flying")');
    expect(query).toContain('s:dom');
  }));

  it('sends only set token when there is no text', fakeAsync(() => {
    component.selectSetFromDrop('dom');
    tick(400);
    const query: string = gameApi.searchCards.calls.mostRecent().args[0];
    expect(query).toBe('s:dom');
  }));

  it('appends type token alongside oracle text query', fakeAsync(() => {
    component.toggleType('Creature');
    component.searchText.setValue('flying');
    tick(400);
    const query: string = gameApi.searchCards.calls.mostRecent().args[0];
    expect(query).toContain('(name:"flying" or o:"flying")');
    expect(query).toContain('t:creature');
  }));
});

// ── Home flip ─────────────────────────────────────────────────────────────────

describe('HomeComponent — flip', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let gameApi: jasmine.SpyObj<GameApiService>;

  const DFC  = makeCard({ cardId: 'dfc-1',    imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' });
  const MONO = makeCard({ cardId: 'mono-1',   imageUriNormal: 'front.jpg', imageUriNormalBack: null });

  beforeEach(async () => {
    gameApi = jasmine.createSpyObj('GameApiService', ['searchCards', 'getSets']);
    gameApi.getSets.and.returnValue(of([]));
    gameApi.searchCards.and.returnValue(of([]));
    const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
    collectionApi.getPrintings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent, CommonModule, ReactiveFormsModule, FormsModule],
      providers: [
        provideMockStore({ initialState: { game: { cards: {} } } }),
        { provide: GameApiService,       useValue: gameApi },
        { provide: CollectionApiService, useValue: collectionApi },
        { provide: ElementRef,           useValue: { nativeElement: document.createElement('div') } },
        ChangeDetectorRef,
      ],
    })
    .overrideComponent(HomeComponent, { remove: { imports: [ManaCostComponent, CardModalComponent] } })
    .compileComponents();
  });

  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick(400);
  }));

  afterEach(() => TestBed.resetTestingModule());

  // ---- toggleFlip ------------------------------------------

  it('adds cardId to flippedIds on first toggle', () => {
    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);
    expect(component.flippedIds.has('dfc-1')).toBeTrue();
  });

  it('removes cardId from flippedIds on second toggle', () => {
    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);
    component.toggleFlip(DFC, ev);
    expect(component.flippedIds.has('dfc-1')).toBeFalse();
  });

  it('stops propagation so the card modal does not open', () => {
    const ev = jasmine.createSpyObj<MouseEvent>('MouseEvent', ['stopPropagation']);
    component.toggleFlip(DFC, ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
  });

  // ---- cardImage -------------------------------------------

  it('returns imageUriNormal when card is not flipped', () => {
    expect(component.cardImage(DFC)).toBe('front.jpg');
  });

  it('returns imageUriNormalBack when card is flipped', () => {
    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);
    expect(component.cardImage(DFC)).toBe('back.jpg');
  });

  it('returns imageUriNormal even when flipped if card has no back face', () => {
    const ev = new MouseEvent('click');
    component.toggleFlip(MONO, ev);
    expect(component.cardImage(MONO)).toBe('front.jpg');
  });

  // ---- State resets ----------------------------------------

  it('clears flippedIds when new search results arrive', fakeAsync(() => {
    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);
    expect(component.flippedIds.size).toBe(1);

    gameApi.searchCards.and.returnValue(of([DFC]));
    component.searchText.setValue('rat');
    tick(400);

    expect(component.flippedIds.size).toBe(0);
  }));

  it('clears flippedIds when clearFilters is called', () => {
    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);
    component.clearFilters();
    expect(component.flippedIds.size).toBe(0);
  });

  it('preserves flippedIds across loadMore', fakeAsync(() => {
    gameApi.searchCards.and.returnValue(of([DFC]));
    component.searchText.setValue('rat');
    tick(400);

    const ev = new MouseEvent('click');
    component.toggleFlip(DFC, ev);

    gameApi.searchCards.and.returnValue(of([MONO]));
    component.loadMore();
    tick(10);

    expect(component.flippedIds.has('dfc-1')).toBeTrue();
  }));
});
