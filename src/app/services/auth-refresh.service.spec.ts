import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideMockStore } from '@ngrx/store/testing';
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
