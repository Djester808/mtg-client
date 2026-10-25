import { saveAuth, rememberSession, storedAuth } from './auth-storage';
import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { Observable, finalize, shareReplay, tap, filter } from 'rxjs';
import { AuthActions } from '../store/auth/auth.actions';

interface RefreshedSession {
  token: string;
  username: string;
}

/** One refresh for concurrent expired requests; the HttpOnly cookie never enters JavaScript. */
@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private readonly http: HttpClient;
  private pending: Observable<RefreshedSession> | null = null;
  constructor(
    backend: HttpBackend,
    private store: Store,
  ) {
    this.http = new HttpClient(backend);
  }
  refresh(): Observable<RefreshedSession> {
    if (!this.pending) {
      const startingToken = storedAuth('auth_token');
      this.pending = this.http
        .post<RefreshedSession>(
          '/api/auth/refresh',
          { rememberMe: rememberSession() },
          { withCredentials: true },
        )
        .pipe(
          filter(() => storedAuth('auth_token') === startingToken),
          tap(({ token, username }) => {
            saveAuth(token, username);
            this.store.dispatch(AuthActions.restoreSession());
          }),
          finalize(() => {
            this.pending = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.pending;
  }
}
