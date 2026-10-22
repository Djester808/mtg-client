import { storedAuth } from '../services/auth-storage';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthActions } from '../store/auth/auth.actions';
import { AuthRefreshService } from '../services/auth-refresh.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(Store);
  const refresh = inject(AuthRefreshService);
  const token = storedAuth('auth_token');
  const ownAuthorization = request.headers.has('Authorization');
  const req =
    token && !ownAuthorization
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;
  return next(req).pipe(
    catchError((error) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !token ||
        ownAuthorization ||
        req.url.includes('/auth/')
      )
        return throwError(() => error);
      return refresh.refresh().pipe(
        switchMap((session) =>
          next(request.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } })),
        ),
        catchError((failure) => {
          if (failure instanceof HttpErrorResponse && failure.status === 401)
            store.dispatch(AuthActions.logout());
          return throwError(() => failure);
        }),
      );
    }),
  );
};
