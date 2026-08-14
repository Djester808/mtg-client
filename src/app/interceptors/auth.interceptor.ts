import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { catchError, throwError } from 'rxjs';
import { AuthActions } from '../store/auth/auth.actions';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = localStorage.getItem('auth_token');
  if (token) {
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
