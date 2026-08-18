import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { AuthService } from '../../services/auth.service';

describe('AuthEffects', () => {
  let actions$: Observable<unknown>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['login', 'register']);

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

  it('stores the username the server returned, not the one that was typed', (done) => {
    // Login accepts a username OR an email address. Echoing the request put people's email
    // addresses in the navbar, into the avatar's colour hash, and into every /u/:username
    // link built from the store — where it 404s, because no profile is keyed on an email.
    auth.login.and.returnValue(of({ token: 'jwt', username: 'Djester808' }));
    actions$ = of(AuthActions.login({ username: 'jzikajr@outlook.com', password: 'pw' }));

    TestBed.inject(AuthEffects).login$.subscribe((action) => {
      expect(action).toEqual(AuthActions.loginSuccess({ token: 'jwt', username: 'Djester808' }));
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
    auth.login.and.returnValue(of({ token: 'jwt', username: 'Djester808' }));
    actions$ = of(AuthActions.loginSuccess({ token: 'jwt', username: 'Djester808' }));

    TestBed.inject(AuthEffects).persistOnSuccess$.subscribe(() => {
      expect(localStorage.getItem('auth_username')).toBe('Djester808');
      localStorage.removeItem('auth_username');
      localStorage.removeItem('auth_token');
      done();
    });
  });
});
