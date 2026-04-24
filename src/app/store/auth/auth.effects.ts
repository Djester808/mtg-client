import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AuthActions } from './auth.actions';

@Injectable()
export class AuthEffects {
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      switchMap(({ username, password }) =>
        this.authService.login(username, password).pipe(
          map(({ token }) => AuthActions.loginSuccess({ token, username })),
          catchError(err => of(AuthActions.loginFailure({ error: this.extractError(err) }))),
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
          catchError(err => of(AuthActions.registerFailure({ error: this.extractError(err) }))),
        ),
      ),
    ),
  );

  persistOnSuccess$ = createEffect(() =>
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

  clearOnLogout$ = createEffect(() =>
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

  private extractError(err: any): string {
    if (err?.error) {
      if (Array.isArray(err.error)) return err.error.join(' ');
      if (typeof err.error === 'string') return err.error;
    }
    return 'Something went wrong. Please try again.';
  }
}
