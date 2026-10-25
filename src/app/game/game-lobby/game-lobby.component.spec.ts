import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { GameLobbyComponent } from './game-lobby.component';
import { GameTable } from '../../models/game-table.models';

describe('GameLobbyComponent', () => {
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  beforeEach(() => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, GameLobbyComponent],
      providers: [{ provide: Router, useValue: { navigate } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function setup() {
    const fixture = TestBed.createComponent(GameLobbyComponent);
    fixture.detectChanges();
    settle();
    return fixture;
  }
  function settle() {
    http
      .expectOne('/api/games/lobbies/decks')
      .flush([{ id: 'own', name: 'Elves', format: 'commander', cardCount: 100 }]);
    http.expectOne('/api/games/lobbies').flush([]);
  }
  it('creates four seats from distinct selected players and the own deck format', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    component.myDeckId = 'own';
    for (const userId of ['b', 'c', 'd', 'b', 'e']) component.invite({ userId, username: userId });
    expect(component.invited().length).toBe(3);
    component.create();
    const request = http.expectOne('/api/games/lobbies');
    expect(request.request.body).toEqual({
      deckId: 'own',
      capacity: 4,
      format: 'commander',
      startingLife: 40,
      allowHonourSystem: false,
      invitees: ['b', 'c', 'd'],
    });
    request.flush({});
    settle();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Elves');
  });
  it('shows startup only to the host and labels leaving accurately', () => {
    const fixture = setup();
    const table = {
      id: 'table',
      hostUserId: 'host',
      isHost: false,
      format: 'commander',
      capacity: 2,
      startingLife: 40,
      seats: [
        { userId: 'host', name: 'Host', ready: true, deckId: null },
        { userId: 'guest', name: 'Guest', ready: true, deckId: 'own' },
      ],
      revision: 2,
      starting: false,
      cancelled: false,
      gameId: null,
      allowHonourSystem: false,
    };
    fixture.componentInstance.tables.set([table]);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).not.toContain('Start table');
    expect(page.textContent).toContain('Leave table');
    fixture.componentInstance.tables.set([{ ...table, isHost: true }]);
    fixture.detectChanges();
    expect(page.textContent).toContain('Start table');
    expect(page.textContent).toContain('Cancel table');
  });

  it('starts with the observed revision and navigates to the returned saved game', () => {
    const fixture = setup();
    fixture.componentInstance.start({ id: 'table', revision: 8 } as GameTable);
    const request = http.expectOne('/api/games/lobbies/table/start');
    expect(request.request.body).toEqual({ revision: 8 });
    request.flush({ gameId: 'saved', revision: 10 });
    expect(navigate).toHaveBeenCalledWith(['/game', 'saved']);
  });
  it('preserves a server refusal and refreshes readiness after a stale mutation', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    component.selections['table'] = 'own';
    component.bringDeck({ id: 'table', revision: 2 } as GameTable);
    http
      .expectOne('/api/games/lobbies/table/deck')
      .flush({ detail: 'The table changed.' }, { status: 409, statusText: 'Conflict' });
    settle();
    fixture.detectChanges();
    expect(component.busy()).toBeFalse();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('The table changed.');
  });
  it('cancels old player searches when the query is cleared', () => {
    const fixture = setup();
    fixture.componentInstance.search = 'alice';
    fixture.componentInstance.searchPlayers();
    const pending = http.expectOne((r) => r.url.endsWith('/players'));
    fixture.componentInstance.search = '';
    fixture.componentInstance.searchPlayers();
    expect(pending.cancelled).toBeTrue();
    expect(fixture.componentInstance.players()).toEqual([]);
  });

  it('cancels pending startup navigation when the lobby is destroyed', () => {
    const fixture = setup();
    fixture.componentInstance.start({ id: 'table', revision: 1 } as GameTable);
    const pending = http.expectOne('/api/games/lobbies/table/start');
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });
});
