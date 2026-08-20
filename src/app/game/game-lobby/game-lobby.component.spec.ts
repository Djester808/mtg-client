import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { GameLobbyComponent } from './game-lobby.component';

/**
 * Starting a game.
 *
 * The lobby was the missing link: a working engine and a working board with no way to get from
 * a deck list to a table. What is worth pinning is that each player brings their own deck, and
 * that a refusal reaches the player intact — the server names the cards it cannot play, and
 * that list is the whole answer to why a game would not start.
 */
describe('GameLobbyComponent', () => {
  let http: HttpTestingController;
  let navigated: unknown[][];

  function create(): ComponentFixture<GameLobbyComponent> {
    const fixture = TestBed.createComponent(GameLobbyComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Answers the three calls the lobby makes on load. */
  function settle(decks = [{ id: 'deck-1', name: 'Elves', cardCount: 60 }]) {
    http.expectOne('/api/games/decks').flush(decks);
    http.expectOne('/api/users?limit=100').flush([{ userId: 'bob', username: 'Bob' }]);
    http.expectOne('/api/games/invites').flush([]);
    http.expectOne('/api/games/invites/sent').flush([]);
  }

  beforeEach(() => {
    navigated = [];
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, GameLobbyComponent],
      providers: [
        {
          provide: Router,
          useValue: {
            navigate: (commands: unknown[]) => {
              navigated.push(commands);
              return Promise.resolve(true);
            },
          },
        },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('offers only the caller own decks', () => {
    // There is deliberately no endpoint for anyone else's decks; the opponent names theirs when
    // they accept.
    const fixture = create();
    settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.decks().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Elves');
  });

  it('will not invite until a deck and an opponent are chosen', () => {
    const fixture = create();
    settle();
    const page = fixture.componentInstance;

    expect(page.canInvite).toBeFalse();
    page.myDeckId = 'deck-1';
    expect(page.canInvite).toBeFalse();
    page.opponentId = 'bob';
    expect(page.canInvite).toBeTrue();
  });

  it('sends an invitation naming only the caller own deck', () => {
    const fixture = create();
    settle();
    const page = fixture.componentInstance;
    page.myDeckId = 'deck-1';
    page.opponentId = 'bob';
    page.startingLife = 40;

    page.invite();

    const req = http.expectOne('/api/games/invites');
    expect(req.request.body).toEqual({
      deckId: 'deck-1',
      opponentUserId: 'bob',
      startingLife: 40,
    });
    req.flush({ id: 'invite-1' });
    settle();
  });

  it('accepting brings the accepter own deck and opens the board', () => {
    const fixture = create();
    http.expectOne('/api/games/decks').flush([{ id: 'deck-2', name: 'Goblins', cardCount: 60 }]);
    http.expectOne('/api/users?limit=100').flush([]);
    http.expectOne('/api/games/invites').flush([
      {
        id: 'invite-1',
        fromUserId: 'alice',
        fromUserName: 'Alice',
        startingLife: 20,
        createdUtc: '2026-01-01T00:00:00Z',
      },
    ]);
    http.expectOne('/api/games/invites/sent').flush([]);
    fixture.detectChanges();

    const page = fixture.componentInstance;
    page.acceptWithDeckId = 'deck-2';
    page.accept(page.invites()[0]);

    const req = http.expectOne('/api/games/invites/invite-1/accept');
    expect(req.request.body).toEqual({ deckId: 'deck-2' });
    req.flush({ gameId: 'game-9' });

    expect(navigated).toEqual([['/play', 'game-9']]);
  });

  it('shows the cards the engine cannot play, in the server own words', () => {
    // "The engine does not implement Sol Ring, Swords to Plowshares, …" is the whole answer to
    // why a game would not start. Replacing it with "could not start a game" throws away the
    // only part a player can act on.
    const fixture = create();
    settle();
    const page = fixture.componentInstance;
    page.myDeckId = 'deck-1';
    page.opponentId = 'bob';
    page.invite();

    http
      .expectOne('/api/games/invites')
      .flush(
        { detail: 'The engine does not implement 2 card(s) in Elves yet: Sol Ring, Wrath of God' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(page.refusal()).toContain('Sol Ring');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gl-refusal')?.textContent,
    ).toContain('Wrath of God');
  });

  it('says there is nothing to bring when the player has no decks', () => {
    const fixture = create();
    settle([]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.gl-empty')).toBeTruthy();
  });

  it('withdrawing an invitation refreshes what is on screen', () => {
    const fixture = create();
    http.expectOne('/api/games/decks').flush([]);
    http.expectOne('/api/users?limit=100').flush([]);
    http.expectOne('/api/games/invites').flush([]);
    http.expectOne('/api/games/invites/sent').flush([
      {
        id: 'invite-9',
        fromUserId: 'me',
        fromUserName: 'Me',
        startingLife: 20,
        createdUtc: '2026-01-01T00:00:00Z',
      },
    ]);
    fixture.detectChanges();

    fixture.componentInstance.withdraw(fixture.componentInstance.sent()[0]);

    http.expectOne('/api/games/invites/invite-9').flush(null);
    settle([]);
  });
});
