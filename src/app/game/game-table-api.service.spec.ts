import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GameTableApiService } from './game-table-api.service';
import { GameTable } from '../models/game-table.models';

describe('GameTableApiService', () => {
  let service: GameTableApiService;
  let http: HttpTestingController;
  const table = { id: 'table-1', revision: 7 } as GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(GameTableApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('passes player search as a query parameter', () => {
    service.players('Alex & Mira').subscribe();
    const call = http.expectOne((request) => request.url === '/api/games/lobbies/players');
    expect(call.request.method).toBe('GET');
    expect(call.request.params.get('search')).toBe('Alex & Mira');
    call.flush([]);
  });

  it('loads member tables and own decks from the implemented lobby routes', () => {
    service.list().subscribe();
    const list = http.expectOne('/api/games/lobbies');
    expect(list.request.method).toBe('GET');
    list.flush([]);
    service.get(table.id).subscribe();
    http.expectOne('/api/games/lobbies/table-1').flush(table);
    service.decks().subscribe();
    http.expectOne('/api/games/lobbies/decks').flush([]);
  });

  it('sends all invited seats and the host deck without a supplied actor', () => {
    const request = {
      deckId: 'own-deck',
      capacity: 4,
      format: 'commander',
      startingLife: 40,
      allowHonourSystem: false,
      invitees: ['second', 'third', 'fourth'],
    };
    service.create(request).subscribe();
    const call = http.expectOne('/api/games/lobbies');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush(table);
  });

  it('binds deck consent, leaving and startup to the observed table revision', () => {
    service.bringDeck(table, 'my-deck').subscribe();
    const deck = http.expectOne('/api/games/lobbies/table-1/deck');
    expect(deck.request.body).toEqual({ deckId: 'my-deck', revision: 7 });
    deck.flush(table);
    service.leave(table).subscribe();
    const leave = http.expectOne('/api/games/lobbies/table-1/leave');
    expect(leave.request.body).toEqual({ revision: 7 });
    leave.flush(table);
    let gameId = '';
    service.start(table).subscribe((result) => (gameId = result.gameId));
    const start = http.expectOne('/api/games/lobbies/table-1/start');
    expect(start.request.body).toEqual({ revision: 7 });
    start.flush({ gameId: 'saved-game', revision: 9 });
    expect(gameId).toBe('saved-game');
  });
});
