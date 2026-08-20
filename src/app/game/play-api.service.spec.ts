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

  it('starts a game and hands back its id', () => {
    let gameId: string | undefined;
    service
      .create({
        deckId: 'deck-1',
        opponentUserId: 'user-2',
        opponentDeckId: 'deck-2',
        startingLife: 40,
      })
      .subscribe((r) => (gameId = r.gameId));

    const req = http.expectOne('/api/games');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.startingLife).toBe(40);
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
