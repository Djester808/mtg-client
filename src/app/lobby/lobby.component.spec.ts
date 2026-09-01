import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { of, throwError } from 'rxjs';
import { LobbyComponent } from './lobby.component';
import { GameApiService } from '../services/game-api.service';
import { GameActions } from '../store';

/**
 * The lobby came back with the board and had no test of its own — the commit that removed the
 * engine UI deleted three files here and no spec, because there never was one. These cover
 * what it actually promises: that starting a game writes the session the board's guard reads,
 * that a failure says so rather than leaving a dead button, and that it cannot be fired twice.
 */
describe('LobbyComponent', () => {
  let fixture: ComponentFixture<LobbyComponent>;
  let page: LobbyComponent;
  let api: jasmine.SpyObj<GameApiService>;
  let store: jasmine.SpyObj<Store>;
  let router: jasmine.SpyObj<Router>;

  const created = {
    gameId: 'game-1',
    player1Token: 'token-1',
    player2Token: 'token-2',
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<GameApiService>('GameApiService', ['createGame']);
    store = jasmine.createSpyObj<Store>('Store', ['dispatch', 'select']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LobbyComponent],
      providers: [
        { provide: GameApiService, useValue: api },
        { provide: Store, useValue: store },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LobbyComponent);
    page = fixture.componentInstance;
    localStorage.removeItem('mtg_session');
  });

  afterEach(() => localStorage.removeItem('mtg_session'));

  it('offers the deck presets it starts a game from', () => {
    expect(page.DECK_PRESETS.length).toBe(5);
    expect(page.DECK_PRESETS.map((p) => p.value)).toContain('mono-green');
    expect(page.form.value.deckPreset).toBe('mono-green');
  });

  it('writes the session the board guards on, and goes there', () => {
    // The board reads mtg_session in ngOnInit and turns you away without it, so this is the
    // whole handover between the two screens.
    api.createGame.and.returnValue(of(created));

    page.startGame();

    expect(JSON.parse(localStorage.getItem('mtg_session') ?? '{}')).toEqual({
      gameId: 'game-1',
      playerToken: 'token-1',
    });
    expect(store.dispatch).toHaveBeenCalledWith(
      GameActions.joinGame({ gameId: 'game-1', playerToken: 'token-1' }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/game', 'game-1']);
  });

  it('sends both players the chosen deck', () => {
    api.createGame.and.returnValue(of(created));
    page.form.patchValue({ player1Name: 'Ann', player2Name: 'Ben', deckPreset: 'rb-control' });

    page.startGame();

    expect(api.createGame).toHaveBeenCalledWith({
      player1Name: 'Ann',
      player2Name: 'Ben',
      player1DeckList: ['rb-control'],
      player2DeckList: ['rb-control'],
    });
  });

  it('says what went wrong instead of leaving a dead button', (done) => {
    api.createGame.and.returnValue(throwError(() => ({ error: { message: 'No decks found.' } })));

    page.startGame();

    page.error$.subscribe((message) => {
      if (message) {
        expect(message).toBe('No decks found.');
        expect(localStorage.getItem('mtg_session')).toBeNull();
        expect(router.navigate).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('falls back to a message that names the likely cause', (done) => {
    api.createGame.and.returnValue(throwError(() => new Error('connection refused')));

    page.startGame();

    page.error$.subscribe((message) => {
      if (message) {
        expect(message).toContain('Is the API running?');
        done();
      }
    });
  });

  it('will not start a game twice, or with an empty name', () => {
    api.createGame.and.returnValue(of(created));
    page.loading$.next(true);
    page.startGame();
    expect(api.createGame).not.toHaveBeenCalled();

    page.loading$.next(false);
    page.form.patchValue({ player1Name: '' });
    page.startGame();
    expect(api.createGame).not.toHaveBeenCalled();
  });

  it('gives each colour its own pip class, and nothing for an unknown one', () => {
    expect(page.colorClass('G')).toBe('pip-G');
    expect(page.colorClass('U')).toBe('pip-U');
    expect(page.colorClass('X')).toBe('');
  });
});
