import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CardSearchPanelComponent, setMenuPlacement } from './card-search-panel.component';
import { GameApiService } from '../../services/game-api.service';
import { PrintingsService } from '../../services/printings.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { makeCard } from '../../testing/test-factories';
import { CardDto } from '../../models/game.models';
import { PrintingDto } from '../../models/collection.models';

/**
 * A stateful PrintingsService double with the real cache semantics: `get` serves the
 * cache without touching `fetch`, so tests can assert what actually hit the network.
 */
class PrintingsStub {
  private cache = new Map<string, PrintingDto[]>();
  fetch = jasmine.createSpy('fetch').and.callFake(() => of([] as PrintingDto[]));

  seed(oracleId: string, printings: PrintingDto[]): void {
    this.cache.set(oracleId, printings);
  }

  cached(oracleId: string): PrintingDto[] | null {
    return this.cache.get(oracleId) ?? null;
  }

  has(oracleId: string): boolean {
    return this.cache.has(oracleId);
  }

  get(oracleId: string): Observable<PrintingDto[]> {
    const hit = this.cache.get(oracleId);
    if (hit) return of(hit);
    return (this.fetch(oracleId) as Observable<PrintingDto[]>).pipe(
      tap((p) => this.cache.set(oracleId, p)),
    );
  }
}

function makeCards(n: number): CardDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ cardId: `card-${i}`, oracleId: `oracle-${i}`, name: `Card ${i}` }),
  );
}

function makePrinting(scryfallId: string, setCode = 'lea'): PrintingDto {
  return {
    scryfallId,
    setCode,
    setName: 'Alpha',
    collectorNumber: '1',
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriLarge: null,
    imageUriNormalBack: null,
    oracleText: null,
    flavorText: null,
    artist: null,
    manaCost: null,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildModule(gameApi: jasmine.SpyObj<GameApiService>, printings: PrintingsStub) {
  return TestBed.configureTestingModule({
    imports: [CardSearchPanelComponent, CommonModule, ReactiveFormsModule, FormsModule],
    providers: [
      { provide: GameApiService, useValue: gameApi },
      { provide: PrintingsService, useValue: printings },
    ],
  })
    .overrideComponent(CardSearchPanelComponent, {
      remove: { imports: [ManaCostComponent, CardModalComponent] },
    })
    .compileComponents();
}

function makeSpies() {
  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', [
    'searchCards',
    'getSets',
  ]);
  gameApi.searchCards.and.returnValue(of([]));
  gameApi.getSets.and.returnValue(of([]));
  const printings = new PrintingsStub();
  return { gameApi, printings };
}

/** Init component inside fakeAsync, flush the initial empty-query debounce. */
function initComponent(fixture: ComponentFixture<CardSearchPanelComponent>): void {
  fixture.detectChanges(); // triggers ngOnInit inside fakeAsync zone
  tick(400); // flush the initial empty-query debounce (returns of(null))
}

// ── Search flags (toggle state) ───────────────────────────────────────────────

describe('CardSearchPanelComponent — search flags (state)', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('defaults matchCase, matchWord, useRegex to false', () => {
    expect(component.matchCase).toBeFalse();
    expect(component.matchWord).toBeFalse();
    expect(component.useRegex).toBeFalse();
  });

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
});

// ── Search flags (passed to API) ──────────────────────────────────────────────

describe('CardSearchPanelComponent — search flags (API args)', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;
  let gameApi: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    const spies = makeSpies();
    gameApi = spies.gameApi;
    await buildModule(gameApi, spies.printings);
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
    expect(args[5]).toBeTrue(); // matchCase
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
    await buildModule(gameApi, spies.printings);
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
  let printings: PrintingsStub;

  beforeEach(async () => {
    const spies = makeSpies();
    gameApi = spies.gameApi;
    printings = spies.printings;
    gameApi.searchCards.and.returnValue(of(makeCards(3)));
    await buildModule(gameApi, printings);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('fetches printings for each new search result', fakeAsync(() => {
    initComponent(fixture);
    component.searchText.setValue('rat');
    tick(400);

    expect(printings.fetch.calls.count()).toBe(3);
  }));

  it('fetches printings with each result oracle id', fakeAsync(() => {
    initComponent(fixture);
    component.searchText.setValue('rat');
    tick(400);

    const ids = printings.fetch.calls.allArgs().map((a) => a[0] as string);
    expect(ids).toContain('oracle-0');
    expect(ids).toContain('oracle-1');
    expect(ids).toContain('oracle-2');
  }));

  it('skips the network for cards already in the shared cache', fakeAsync(() => {
    initComponent(fixture);
    printings.seed('oracle-0', [makePrinting('cached-scry')]);

    component.searchText.setValue('rat');
    tick(400);

    expect(printings.fetch.calls.count()).toBe(2);
    const ids = printings.fetch.calls.allArgs().map((a) => a[0] as string);
    expect(ids).not.toContain('oracle-0');
  }));

  it('auto-selects scryfallId when card has exactly one printing', fakeAsync(() => {
    initComponent(fixture);
    printings.fetch.and.returnValue(of([makePrinting('scry-only')]));

    component.searchText.setValue('rat');
    tick(400);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-only');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-only');
  }));

  it('auto-selects the correct scryfallId per card', fakeAsync(() => {
    initComponent(fixture);
    printings.fetch.and.callFake((oracleId: string) => of([makePrinting(`scry-for-${oracleId}`)]));

    component.searchText.setValue('rat');
    tick(400);

    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-for-oracle-0');
    expect(component.searchSelectedScryfallId.get('oracle-1')).toBe('scry-for-oracle-1');
    expect(component.searchSelectedScryfallId.get('oracle-2')).toBe('scry-for-oracle-2');
  }));

  it('auto-selects the first printing (newest set) when card has multiple printings', fakeAsync(() => {
    initComponent(fixture);
    printings.fetch.and.returnValue(of([makePrinting('scry-1'), makePrinting('scry-2')]));

    component.searchText.setValue('rat');
    tick(400);

    // The server orders printings newest set first, so [0] is the most recent.
    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-1');
  }));

  it('replaces old auto-selections when a new search starts', fakeAsync(() => {
    initComponent(fixture);
    printings.fetch.and.returnValue(of([makePrinting('scry-only')]));
    component.searchText.setValue('rat');
    tick(400);
    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-only');

    printings.fetch.and.returnValue(of([makePrinting('scry-1'), makePrinting('scry-2')]));
    component.searchText.setValue('bolt');
    tick(400);

    // The selection map was cleared, then re-defaulted. oracle-0's printings are already
    // cached from the first search, so its default comes from that cache — not a refetch.
    expect(component.searchSelectedScryfallId.get('oracle-0')).toBe('scry-only');
  }));
});

// ── Flip ─────────────────────────────────────────────────────────────────────

describe('CardSearchPanelComponent — flip', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;

  const DFC = makeCard({
    cardId: 'dfc-1',
    oracleId: 'oracle-dfc',
    imageUriSmall: 'front-small.jpg',
    imageUriNormalBack: 'back-normal.jpg',
  });
  const NORMAL = makeCard({
    cardId: 'normal-1',
    oracleId: 'oracle-normal',
    imageUriSmall: 'front-small.jpg',
    imageUriNormalBack: null,
  });

  beforeEach(async () => {
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
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
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('emits cardAdd with oracleId and scryfallId when printing is selected', () => {
    const card = makeCard({ oracleId: 'oracle-x' });
    component.searchSelectedScryfallId.set('oracle-x', 'scry-x');

    const emitted: { oracleId: string; scryfallId: string }[] = [];
    component.cardAdd.subscribe((e) => emitted.push(e));

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

// ── Preview modal — add / decrement ─────────────────────────────────────────

describe('CardSearchPanelComponent — addPreviewNormal / addPreviewFoil', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
    component.previewCard = makeCard({ oracleId: 'oracle-p' });
    component.previewScryfallId = 'scry-p';
  });

  afterEach(() => TestBed.resetTestingModule());

  it('addPreviewNormal emits cardAdd with foil:false', () => {
    const emitted: { oracleId: string; scryfallId: string; foil?: boolean }[] = [];
    component.cardAdd.subscribe((e) => emitted.push(e));

    component.addPreviewNormal();

    expect(emitted.length).toBe(1);
    expect(emitted[0].foil).toBeFalse();
    expect(emitted[0].oracleId).toBe('oracle-p');
    expect(emitted[0].scryfallId).toBe('scry-p');
  });

  it('addPreviewFoil emits cardAdd with foil:true', () => {
    const emitted: { oracleId: string; scryfallId: string; foil?: boolean }[] = [];
    component.cardAdd.subscribe((e) => emitted.push(e));

    component.addPreviewFoil();

    expect(emitted.length).toBe(1);
    expect(emitted[0].foil).toBeTrue();
    expect(emitted[0].oracleId).toBe('oracle-p');
    expect(emitted[0].scryfallId).toBe('scry-p');
  });

  it('addPreviewNormal does not emit when previewCard is null', () => {
    component.previewCard = null;
    let emitted = false;
    component.cardAdd.subscribe(() => (emitted = true));

    component.addPreviewNormal();

    expect(emitted).toBeFalse();
  });

  it('addPreviewFoil does not emit when previewScryfallId is null', () => {
    component.previewScryfallId = null;
    let emitted = false;
    component.cardAdd.subscribe(() => (emitted = true));

    component.addPreviewFoil();

    expect(emitted).toBeFalse();
  });
});

// ── Search history ────────────────────────────────────────────────────────────

describe('CardSearchPanelComponent — search history', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    localStorage.clear();
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('searchHistory is empty when localStorage has no entry', () => {
    component.ngOnInit();
    expect(component.searchHistory).toEqual([]);
  });

  it('ngOnInit loads searchHistory from localStorage', () => {
    localStorage.setItem('mtg-search-history', JSON.stringify(['Lightning Bolt', 'Counterspell']));
    component.ngOnInit();
    expect(component.searchHistory).toEqual(['Lightning Bolt', 'Counterspell']);
  });

  it('addCard saves card name to searchHistory', () => {
    const card = makeCard({ oracleId: 'oracle-bolt', name: 'Lightning Bolt' });
    component.searchSelectedScryfallId.set('oracle-bolt', 'scry-bolt');
    component.addCard(card);
    expect(component.searchHistory[0]).toBe('Lightning Bolt');
    expect(JSON.parse(localStorage.getItem('mtg-search-history') || '[]')[0]).toBe(
      'Lightning Bolt',
    );
  });

  it('addCard prepends new term so most recent appears first', () => {
    localStorage.setItem('mtg-search-history', JSON.stringify(['Counterspell']));
    component.ngOnInit();
    const card = makeCard({ oracleId: 'oracle-bolt', name: 'Lightning Bolt' });
    component.searchSelectedScryfallId.set('oracle-bolt', 'scry-bolt');
    component.addCard(card);
    expect(component.searchHistory[0]).toBe('Lightning Bolt');
    expect(component.searchHistory[1]).toBe('Counterspell');
  });

  it('addCard deduplicates: re-adding moves term to front', () => {
    localStorage.setItem('mtg-search-history', JSON.stringify(['Lightning Bolt', 'Counterspell']));
    component.ngOnInit();
    const card = makeCard({ oracleId: 'oracle-cs', name: 'Counterspell' });
    component.searchSelectedScryfallId.set('oracle-cs', 'scry-cs');
    component.addCard(card);
    expect(component.searchHistory[0]).toBe('Counterspell');
    expect(component.searchHistory.filter((t) => t === 'Counterspell')).toHaveSize(1);
  });

  it('addCard does not emit and does not save when no printing is selected', () => {
    const card = makeCard({ oracleId: 'oracle-x', name: 'Mystery Card' });
    component.addCard(card);
    expect(component.searchHistory).toEqual([]);
    expect(localStorage.getItem('mtg-search-history')).toBeNull();
  });

  it('searchHistory survives a corrupt localStorage gracefully', () => {
    localStorage.setItem('mtg-search-history', 'not-json');
    component.ngOnInit();
    expect(component.searchHistory).toEqual([]);
  });
});

describe('CardSearchPanelComponent — decrementPreviewNormal / decrementPreviewFoil', () => {
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
    component.previewCard = makeCard({ oracleId: 'oracle-p' });
    component.previewScryfallId = 'scry-p';
  });

  afterEach(() => TestBed.resetTestingModule());

  it('decrementPreviewNormal emits cardDecrementNormal with the preview oracleId', () => {
    const emitted: string[] = [];
    component.cardDecrementNormal.subscribe((id) => emitted.push(id));

    component.decrementPreviewNormal();

    expect(emitted).toEqual(['oracle-p']);
  });

  it('decrementPreviewFoil emits cardDecrementFoil with the preview oracleId', () => {
    const emitted: string[] = [];
    component.cardDecrementFoil.subscribe((id) => emitted.push(id));

    component.decrementPreviewFoil();

    expect(emitted).toEqual(['oracle-p']);
  });

  it('decrementPreviewNormal does not emit when previewCard is null', () => {
    component.previewCard = null;
    let emitted = false;
    component.cardDecrementNormal.subscribe(() => (emitted = true));

    component.decrementPreviewNormal();

    expect(emitted).toBeFalse();
  });

  it('decrementPreviewFoil does not emit when previewCard is null', () => {
    component.previewCard = null;
    let emitted = false;
    component.cardDecrementFoil.subscribe(() => (emitted = true));

    component.decrementPreviewFoil();

    expect(emitted).toBeFalse();
  });
});

// ── Custom dropdown data (printing options + history suggestions) ─────────────

describe('CardSearchPanelComponent — printing options & history suggestions', () => {
  let component: CardSearchPanelComponent;
  let printings: PrintingsStub;

  beforeEach(async () => {
    const spies = makeSpies();
    printings = spies.printings;
    await buildModule(spies.gameApi, printings);
    component = TestBed.createComponent(CardSearchPanelComponent).componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('printingOptions maps cached printings to labeled options', () => {
    printings.seed('oracle-0', [makePrinting('scry-1', 'psos'), makePrinting('scry-2', 'lea')]);

    const opts = component.printingOptions('oracle-0');

    expect(opts.map((o) => o.value)).toEqual(['scry-1', 'scry-2']);
    expect(opts[0].label).toBe('PSOS #1');
    expect(opts[0].title).toBe('Alpha');
  });

  it('printingOptions returns the same array for the same cached printings (memoized)', () => {
    printings.seed('oracle-0', [makePrinting('scry-1')]);

    const first = component.printingOptions('oracle-0');
    const second = component.printingOptions('oracle-0');
    expect(second).toBe(first);

    // A new printings array (reload) produces fresh options.
    printings.seed('oracle-0', [makePrinting('scry-9')]);
    const third = component.printingOptions('oracle-0');
    expect(third).not.toBe(first);
    expect(third[0].value).toBe('scry-9');
  });

  it('printingOptions is empty while printings are not cached yet', () => {
    expect(component.printingOptions('oracle-unknown')).toEqual([]);
  });

  it('histSuggestions filters history by the current query, capped at 8', () => {
    component.searchHistory = [
      'goblin king',
      'goblin warchief',
      'lightning bolt',
      'g1',
      'g2',
      'g3',
      'g4',
      'g5',
      'g6',
      'g7',
    ];

    component.searchText.setValue('gob');
    expect(component.histSuggestions).toEqual(['goblin king', 'goblin warchief']);

    component.searchText.setValue('');
    expect(component.histSuggestions.length).toBe(8);
  });

  it('pickHistory fills the search box and closes the menu', () => {
    component.histOpen = true;

    component.pickHistory('goblin king');

    expect(component.searchText.value).toBe('goblin king');
    expect(component.histOpen).toBeFalse();
  });
});

// ── Set menu placement ────────────────────────────────────────────────────────
//
// The panel clips its overflow, so the set menu only has the room the panel leaves it.
// Left-anchored and unbounded, it ran past the panel's right edge (losing the count
// column) and past its bottom (slicing the last row).

describe('CardSearchPanelComponent — set menu placement', () => {
  const panel = { top: 200, bottom: 750 };

  it('drops downward, capped at the room between the trigger and the panel floor', () => {
    expect(setMenuPlacement(panel, { top: 400, bottom: 424 })).toEqual({ up: false, max: 318 });
  });

  it('flips up when the room below is too small to hold a menu', () => {
    // A short window: 90px below the trigger, 192px above it.
    expect(setMenuPlacement({ top: 200, bottom: 550 }, { top: 400, bottom: 452 })).toEqual({
      up: true,
      max: 192,
    });
  });

  it('stays down when there is little room either way but more of it below', () => {
    const placement = setMenuPlacement({ top: 200, bottom: 400 }, { top: 250, bottom: 274 });
    expect(placement.up).toBeFalse();
    expect(placement.max).toBe(118);
  });

  it('never reports a negative height when the panel is collapsed around the trigger', () => {
    expect(setMenuPlacement({ top: 200, bottom: 300 }, { top: 205, bottom: 320 }).max).toBe(0);
  });
});

describe('CardSearchPanelComponent — set menu open', () => {
  let fixture: ComponentFixture<CardSearchPanelComponent>;
  let component: CardSearchPanelComponent;

  beforeEach(async () => {
    const { gameApi, printings } = makeSpies();
    await buildModule(gameApi, printings);
    fixture = TestBed.createComponent(CardSearchPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('opening the menu records a height cap instead of leaving it unbounded', fakeAsync(() => {
    initComponent(fixture);

    component.openSetDrop();

    expect(component.setDropOpen).toBeTrue();
    expect(component.setDropMax).not.toBeNull();
  }));

  it('the open menu is bound to that cap and to its up/down side', fakeAsync(() => {
    initComponent(fixture);

    component.openSetDrop();
    component.setDropMax = 140;
    component.setDropUp = true;
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('.set-dropdown') as HTMLElement;
    expect(menu.style.maxHeight).toBe('140px');
    expect(menu.classList).toContain('is-up');
  }));
});
