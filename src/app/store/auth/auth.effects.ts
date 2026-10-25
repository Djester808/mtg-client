import { saveAuth, clearAuth } from '../../services/auth-storage';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap, tap, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AuthActions } from './auth.actions';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class AuthEffects {
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      switchMap(({ username, password, rememberMe }) =>
        this.authService.login(username, password, rememberMe).pipe(
          takeUntil(this.actions$.pipe(ofType(AuthActions.logout, AuthActions.register))),
          // The username comes from the RESPONSE, never from what was typed. Login accepts
          // either a username or an email address, so echoing the request put people's
          // email addresses in the navbar, in the avatar's colour hash, and into every
          // /u/:username link built from the store — where it 404s, because no profile is
          // keyed on an email.
          map((res) =>
            AuthActions.loginSuccess({
              token: res.token,
              username: res.username,
              ...(rememberMe === undefined ? {} : { rememberMe }),
            }),
          ),
          catchError((err) =>
            of(AuthActions.loginFailure({ error: describeHttpError(err, 'Login failed') })),
          ),
        ),
      ),
    ),
  );

  register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      switchMap(({ username, email, password, acceptedTerms }) =>
        this.authService.register(username, email, password, acceptedTerms).pipe(
          takeUntil(this.actions$.pipe(ofType(AuthActions.logout, AuthActions.login))),
          // Same rule as login: the server's spelling of the username wins.
          map((res) => AuthActions.registerSuccess({ token: res.token, username: res.username })),
          catchError((err) =>
            of(
              AuthActions.registerFailure({ error: describeHttpError(err, 'Registration failed') }),
            ),
          ),
        ),
      ),
    ),
  );

  persistOnSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess, AuthActions.registerSuccess),
        tap((action) => {
          const { token, username } = action;
          saveAuth(token, username, !('rememberMe' in action) || action.rememberMe !== false);
          this.router.navigate(['/']);
        }),
      ),
    { dispatch: false },
  );

  clearOnLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout),
        tap(() => {
          this.authService.logout().subscribe({ error: () => undefined });
          clearAuth();
          this.router.navigate(['/login']);
        }),
      ),
    { dispatch: false },
  );

  constructor(
    private actions$: Actions,
    private authService: AuthService,
    private router: Router,
  ) {}
}
