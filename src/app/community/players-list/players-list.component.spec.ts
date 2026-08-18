import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PlayersListComponent } from './players-list.component';
import { PlayerSummary } from '../../models/profile.models';

function player(overrides: Partial<PlayerSummary>): PlayerSummary {
  return {
    username: 'someone',
    displayName: null,
    tagline: null,
    avatarUrl: null,
    joinedAt: '2026-01-01T00:00:00Z',
    deckCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

describe('PlayersListComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlayersListComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(players: PlayerSummary[]) {
    const fixture = TestBed.createComponent(PlayersListComponent);
    fixture.detectChanges();
    http.expectOne('/api/users').flush(players);
    fixture.detectChanges();
    return fixture;
  }

  it('lists players and shows a display name over the handle', () => {
    const fixture = load([player({ username: 'xX_bolt_Xx', displayName: 'Ravnica Rachel' })]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ravnica Rachel');
  });

  it('searches display names and taglines, not just usernames', () => {
    // Someone who set a display name is far more findable by it than by the handle they
    // registered with.
    const fixture = load([
      player({ username: 'aaa', displayName: 'Ravnica Rachel' }),
      player({ username: 'bbb', tagline: 'Group hug enjoyer' }),
      player({ username: 'ccc' }),
    ]);
    const page = fixture.componentInstance;

    page.searchQuery = 'rachel';
    expect(page.filteredPlayers.map((p) => p.username)).toEqual(['aaa']);

    page.searchQuery = 'hug';
    expect(page.filteredPlayers.map((p) => p.username)).toEqual(['bbb']);
  });

  it('sorts by decks, comments and name', () => {
    const fixture = load([
      player({ username: 'zoe', deckCount: 1, commentCount: 9 }),
      player({ username: 'amy', deckCount: 5, commentCount: 0 }),
    ]);
    const page = fixture.componentInstance;

    page.setSortBy('decks');
    expect(page.filteredPlayers[0].username).toBe('amy');

    page.setSortBy('comments');
    expect(page.filteredPlayers[0].username).toBe('zoe');

    page.setSortBy('name');
    expect(page.filteredPlayers[0].username).toBe('amy');
  });

  it('returns the same array instance until an input changes', () => {
    // The getter is bound by the template, so it runs on every change-detection pass.
    // Re-filtering and re-sorting the list each time is what the memo exists to stop.
    const fixture = load([player({ username: 'amy' }), player({ username: 'zoe' })]);
    const page = fixture.componentInstance;

    const first = page.filteredPlayers;
    expect(page.filteredPlayers).toBe(first);

    page.setSortBy('name');
    expect(page.filteredPlayers).not.toBe(first);
  });

  it('stops loading even when the request fails', () => {
    const fixture = TestBed.createComponent(PlayersListComponent);
    fixture.detectChanges();
    http.expectOne('/api/users').flush(null, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.loading).toBeFalse();
  });
});
