import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { DeckApiService } from './deck-api.service';
import { CollectionUndoService } from './collection-undo.service';

describe('DeckApiService commander metadata', () => {
  let api: DeckApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockStore(),
        { provide: CollectionUndoService, useValue: {} },
      ],
    });
    api = TestBed.inject(DeckApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('preserves a saved second commander when an older metadata action omits it', () => {
    api
      .updateDeck('deck', { name: 'Renamed', format: 'commander', commanderOracleId: 'first' })
      .subscribe();
    http.expectOne('/api/decks/deck').flush({ secondaryCommanderOracleId: 'second' });
    const update = http.expectOne('/api/decks/deck');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.secondaryCommanderOracleId).toBe('second');
    expect(update.request.body.name).toBe('Renamed');
    update.flush({});
  });

  it('sends an explicit clear without restoring the previous selection', () => {
    api
      .updateDeck('deck', { name: 'Single', format: 'commander', secondaryCommanderOracleId: null })
      .subscribe();
    const update = http.expectOne('/api/decks/deck');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.secondaryCommanderOracleId).toBeNull();
    update.flush({});
  });

  it('clears the second commander when leaving the format', () => {
    api
      .updateDeck('deck', { name: 'Casual', format: null, secondaryCommanderOracleId: 'second' })
      .subscribe();
    const update = http.expectOne('/api/decks/deck');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.secondaryCommanderOracleId).toBeNull();
    update.flush({});
  });
});
