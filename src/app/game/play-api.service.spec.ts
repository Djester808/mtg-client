import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlayApiService } from './play-api.service';
import { GameView } from '../models/play.models';

/**
 * The request half of playing a game.
 *
 * The endpoints matter more than they look: the board seeds itself from these on load, so a
 * wrong path is a blank board until the next action happens to arrive over the socket — which
 * on a slow turn is a long, silent wait with nothing on screen saying why.
 */
describe('PlayApiService', () => {
  let service: PlayApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlayApiService],
    });

    service = TestBed.inject(PlayApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('offers only the caller own decks', () => {
    // There is deliberately no endpoint for anyone else's decks — a deck list is not public,
    // and the opponent names theirs when they accept.
    let decks: unknown[] = [];
    service.decks().subscribe((d) => (decks = d));

    http.expectOne('/api/games/decks').flush([{ id: 'deck-1', name: 'Elves', cardCount: 60 }]);

    expect(decks.length).toBe(1);
  });

  it('invites with the caller own deck and the opponent id', () => {
    service.invite({ deckId: 'deck-1', opponentUserId: 'bob', startingLife: 40 }).subscribe();

    const req = http.expectOne('/api/games/invites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.startingLife).toBe(40);
    req.flush({ id: 'invite-1' });
  });

  it('accepts an invitation with the accepter own deck', () => {
    let gameId: string | undefined;
    service.accept('invite-1', 'deck-2').subscribe((r) => (gameId = r.gameId));

    const req = http.expectOne('/api/games/invites/invite-1/accept');
    expect(req.request.body).toEqual({ deckId: 'deck-2' });
    req.flush({ gameId: 'game-9' });

    expect(gameId).toBe('game-9');
  });

  it('reads the caller view of a game', () => {
    let view: GameView | undefined;
    service.view('game-9').subscribe((v) => (view = v));

    http.expectOne('/api/games/game-9').flush({ gameId: 'game-9', viewer: 'me' } as GameView);

    expect(view?.gameId).toBe('game-9');
  });

  it('reads the log from its own endpoint', () => {
    let log: string[] = [];
    service.log('game-9').subscribe((l) => (log = l));

    http.expectOne('/api/games/game-9/log').flush(['Game started.']);

    expect(log).toEqual(['Game started.']);
  });
});
