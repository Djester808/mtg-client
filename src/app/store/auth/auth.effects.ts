import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AuthActions } from './auth.actions';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class AuthEffects {
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      switchMap(({ username, password }) =>
        this.authService.login(username, password).pipe(
          map(({ token }) => AuthActions.loginSuccess({ token, username })),
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
      switchMap(({ username, email, password }) =>
        this.authService.register(username, email, password).pipe(
          map(({ token }) => AuthActions.registerSuccess({ token, username })),
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
        tap(({ token, username }) => {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_username', username);
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
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_username');
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
