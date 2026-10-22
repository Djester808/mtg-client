import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { provideMockStore } from '@ngrx/store/testing';
import { ExploreComponent, sortExplore } from './explore.component';
import { ExploreApiService, ExploreEntry, ExplorePage } from '../services/explore-api.service';
import { DeckApiService, DeckDetailDto } from '../services/deck-api.service';
import { CardDto, CollectionCardDto } from '../models/game.models';

describe('Explore', () => {
  const card = { oracleId: 'sol', name: 'Sol Ring', prices: { usd: 2 } } as CardDto;
  const entry: ExploreEntry = {
    name: 'Sol Ring',
    card,
    decks: 20,
    potential: 40,
    inclusion: 0.5,
    synergy: 0.1,
    trend: 2,
    quantity: 2,
  };
  const page = {
    hasPage: true,
    subject: card,
    kind: 'average',
    variant: '',
    sections: [{ tag: 'artifact', title: 'Artifacts', cards: [entry] }],
    variants: [],
    similar: [],
    commanders: [],
    charts: [],
    fetchedAt: '2026-10-20',
  } as unknown as ExplorePage;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: jasmine.SpyObj<ExploreApiService>;
  let decks: jasmine.SpyObj<DeckApiService>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({}));
    api = jasmine.createSpyObj('ExploreApiService', ['directory', 'page', 'search', 'copyAverage']);
    api.directory.and.returnValue(of({ fetchedAt: '2026-10-20', commanders: [entry] }));
    api.page.and.returnValue(of(page));
    api.search.and.returnValue(of([entry]));
    decks = jasmine.createSpyObj('DeckApiService', ['getDecks', 'addCard']);
    decks.getDecks.and.returnValue(of([]));
    decks.addCard.and.returnValue(of({} as CollectionCardDto));
    TestBed.configureTestingModule({
      imports: [ExploreComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState: { auth: { token: 'token' } } }),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: of(convertToParamMap({ variant: 'budget' })),
            snapshot: { data: { kind: 'average' } },
          },
        },
        { provide: ExploreApiService, useValue: api },
        { provide: DeckApiService, useValue: decks },
      ],
    });
  });
  it('opens commander entries on card pages as commanders', () => {
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    c.page.set({ ...page, kind: 'card' });
    const commander = { ...entry, kind: 'commander' };
    expect(c.link(commander)).toEqual(['/explore', 'commanders', 'sol']);
  });
  it('restores sorting from the page URL', () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: params,
        queryParamMap: of(
          convertToParamMap({ sort: 'name', q: 'ring', view: 'grid', section: 'artifact' }),
        ),
        snapshot: { data: { kind: 'commander' } },
      },
    });
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    expect(c.sort()).toBe('name');
    expect(c.query()).toBe('ring');
    expect(c.view()).toBe('grid');
    expect(c.section()).toBe('artifact');
  });
  it('loads directory, searches both kinds, and filters immutable sections', () => {
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    expect(c.directory()).toEqual([entry]);
    expect(c.loading()).toBeFalse();
    c.search();
    expect(api.search).not.toHaveBeenCalled();
    c.searchText = ' Ring ';
    c.searchKind = 'card';
    c.search();
    expect(api.search).toHaveBeenCalledWith('Ring', 'card');
    expect(c.link(entry)).toEqual(['/explore', 'cards', 'sol']);
    c.query.set('missing');
    expect(c.visibleSections()).toEqual([]);
    c.query.set('ring');
    expect(c.visibleSections()[0].cards).toEqual([entry]);
    c.page.set(page);
    c.section.set('artifact');
    expect(c.totalCards()).toBe(2);
    c.section.set('other');
    expect(c.visibleSections()).toEqual([]);
  });
  it('reloads pages when route parameters change and reports upstream errors', () => {
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    params.next(convertToParamMap({ id: 'sol' }));
    expect(api.page).toHaveBeenCalledWith('sol', 'average', 'budget');
    expect(c.page()).toBe(page);
    api.page.and.returnValue(throwError(() => new Error('offline')));
    params.next(convertToParamMap({ id: 'other' }));
    expect(c.error()).toContain('unavailable');
    expect(c.page()).toBeNull();
    api.search.and.returnValue(throwError(() => new Error('offline')));
    c.searchText = 'Ring';
    c.search();
    expect(c.error()).toContain('search');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    c.changeVariant('budget');
    expect(router.navigate).toHaveBeenCalled();
  });
  it('adds the selected quantity once and preserves the dialog on failure', () => {
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    c.openAdd(entry);
    expect(c.quantity).toBe(2);
    c.add();
    expect(decks.addCard).not.toHaveBeenCalled();
    c.destination = 'deck';
    c.quantity = 1.5;
    c.add();
    expect(decks.addCard).not.toHaveBeenCalled();
    c.quantity = 2;
    c.add();
    expect(decks.addCard).toHaveBeenCalledWith('deck', {
      oracleId: 'sol',
      quantity: 2,
      quantityFoil: 0,
    });
    expect(c.pending()).toBeNull();
    expect(c.notice()).toContain('Added');
    decks.addCard.and.returnValue(throwError(() => new Error()));
    c.openAdd(entry);
    c.destination = 'deck';
    c.add();
    expect(c.pending()).toBe(entry);
    expect(c.saving()).toBeFalse();
    expect(c.notice()).toContain('could not');
    decks.getDecks.and.returnValue(throwError(() => new Error()));
    c.openAdd(entry);
    expect(c.notice()).toContain('loaded');
  });
  it('copies the entire average deck and reports failure without a partial deck', () => {
    const c = TestBed.createComponent(ExploreComponent).componentInstance;
    c.copyAverage();
    expect(api.copyAverage).not.toHaveBeenCalled();
    c.page.set(page);
    api.copyAverage.and.returnValue(of({ id: 'copied' } as DeckDetailDto));
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    c.copyAverage();
    expect(router.navigate).toHaveBeenCalledWith(['/deck', 'copied']);
    expect(c.saving()).toBeFalse();
    api.copyAverage.and.returnValue(throwError(() => new Error()));
    c.copyAverage();
    expect(c.notice()).toContain('No partial deck');
    expect(c.saving()).toBeFalse();
  });
  it('sorts unknown values last without changing upstream order', () => {
    const missing = {
      ...entry,
      name: 'Unknown',
      card: null,
      decks: null,
      inclusion: null,
      synergy: null,
    };
    const cards = [missing, entry];
    for (const field of ['price', 'decks', 'inclusion', 'synergy'])
      expect(sortExplore(cards, field)[0]).toBe(entry);
    expect(cards[0]).toBe(missing);
    expect(sortExplore(cards, 'name')[0]).toBe(entry);
  });
});
