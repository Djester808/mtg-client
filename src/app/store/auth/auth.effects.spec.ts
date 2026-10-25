import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { AuthService } from '../../services/auth.service';

describe('AuthEffects', () => {
  let actions$: Observable<unknown>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['login', 'register', 'logout']);

    auth.logout.and.returnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideRouter([]),
        provideMockActions(() => actions$),
        { provide: AuthService, useValue: auth },
      ],
    });

    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  it('ignores a pending login after logout', () => {
    const input = new Subject<any>(),
      response = new Subject<any>();
    actions$ = input;
    auth.login.and.returnValue(response);
    const received: unknown[] = [];
    const sub = TestBed.inject(AuthEffects).login$.subscribe((action) => received.push(action));
    input.next(AuthActions.login({ username: 'old', password: 'password' }));
    input.next(AuthActions.logout());
    response.next({ token: 'stale', username: 'old' });
    expect(received).toEqual([]);
    sub.unsubscribe();
  });
  it('stores the username the server returned, not the one that was typed', (done) => {
    // Login accepts a username OR an email address. Echoing the request put people's email
    // addresses in the navbar, into the avatar's colour hash, and into every /u/:username
    // link built from the store — where it 404s, because no profile is keyed on an email.
    auth.login.and.returnValue(of({ token: 'jwt', username: 'TestUser' }));
    actions$ = of(AuthActions.login({ username: 'tester@example.test', password: 'pw' }));

    TestBed.inject(AuthEffects).login$.subscribe((action) => {
      expect(action).toEqual(AuthActions.loginSuccess({ token: 'jwt', username: 'TestUser' }));
      done();
    });
  });

  it('keeps a session-only sign-in out of persistent storage', (done) => {
    actions$ = of(
      AuthActions.loginSuccess({
        token: 'session-jwt',
        username: 'SessionUser',
        rememberMe: false,
      }),
    );
    TestBed.inject(AuthEffects).persistOnSuccess$.subscribe(() => {
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(sessionStorage.getItem('auth_token')).toBe('session-jwt');
      sessionStorage.clear();
      done();
    });
  });
  it('does the same on register', (done) => {
    auth.register.and.returnValue(of({ token: 'jwt', username: 'Nissa' }));
    actions$ = of(
      AuthActions.register({ username: 'nissa', email: 'n@example.com', password: 'pw' }),
    );

    TestBed.inject(AuthEffects).register$.subscribe((action) => {
      expect(action).toEqual(AuthActions.registerSuccess({ token: 'jwt', username: 'Nissa' }));
      done();
    });
  });

  it('reports a failed login as a failure action rather than throwing', (done) => {
    auth.login.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { detail: 'Invalid credentials' },
          }),
      ),
    );
    actions$ = of(AuthActions.login({ username: 'nobody', password: 'pw' }));

    TestBed.inject(AuthEffects).login$.subscribe((action) => {
      expect(action).toEqual(AuthActions.loginFailure({ error: 'Invalid credentials' }));
      done();
    });
  });

  it('persists the server username so a restored session is not stale', (done) => {
    auth.login.and.returnValue(of({ token: 'jwt', username: 'TestUser' }));
    actions$ = of(AuthActions.loginSuccess({ token: 'jwt', username: 'TestUser' }));

    TestBed.inject(AuthEffects).persistOnSuccess$.subscribe(() => {
      expect(localStorage.getItem('auth_username')).toBe('TestUser');
      localStorage.removeItem('auth_username');
      localStorage.removeItem('auth_token');
      done();
    });
  });
});
