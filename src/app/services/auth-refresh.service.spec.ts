import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { clearAuth, saveAuth } from './auth-storage';
import { AuthRefreshService } from './auth-refresh.service';

describe('AuthRefreshService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideMockStore()],
    }),
  );
  afterEach(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
  });
  it('does not restore a session after logout or replace a newer login', () => {
    const api = TestBed.inject(AuthRefreshService),
      http = TestBed.inject(HttpTestingController);
    saveAuth('old', 'Old');
    let replies = 0;
    api.refresh().subscribe(() => replies++);
    clearAuth();
    http.expectOne('/api/auth/refresh').flush({ token: 'stale', username: 'Old' });
    expect(localStorage.getItem('auth_token')).toBeNull();
    saveAuth('old', 'Old');
    api.refresh().subscribe(() => replies++);
    saveAuth('new-login', 'New');
    http.expectOne('/api/auth/refresh').flush({ token: 'stale', username: 'Old' });
    expect(localStorage.getItem('auth_token')).toBe('new-login');
    expect(replies).toBe(0);
    http.verify();
  });
  it('shares one refresh across concurrent requests and keeps the refresh cookie out of JavaScript', () => {
    const api = TestBed.inject(AuthRefreshService),
      http = TestBed.inject(HttpTestingController);
    let replies = 0;
    api.refresh().subscribe(() => replies++);
    api.refresh().subscribe(() => replies++);
    const request = http.expectOne('/api/auth/refresh');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ token: 'replacement', username: 'Nissa' });
    expect(replies).toBe(2);
    expect(localStorage.getItem('auth_token')).toBe('replacement');
    api.refresh().subscribe();
    http.expectOne('/api/auth/refresh').flush({ token: 'next', username: 'Nissa' });
    http.verify();
  });
});
