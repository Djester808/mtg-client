import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { catchError, throwError } from 'rxjs';
import { AuthActions } from '../store/auth/auth.actions';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = localStorage.getItem('auth_token');

  // A request that set its own Authorization meant it, so it is left alone. The life
  // counter is the caller that needs this: several people share one device, each seat holds
  // its own token, and reading one player's record has to go up as *that* player rather than
  // as whoever the browser happens to be signed in as. Overwriting it silently answered the
  // question about the wrong account.
  if (token && !req.headers.has('Authorization')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err) => {
      // A 401 while we hold a token means the session is dead (expired or revoked):
      // log out and land on the login page instead of leaving every feature to fail
      // silently. Auth endpoints are exempt — a wrong password is not a dead session.
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        token &&
        !req.url.includes('/auth/')
      ) {
        store.dispatch(AuthActions.logout());
      }
      return throwError(() => err);
    }),
  );
};
