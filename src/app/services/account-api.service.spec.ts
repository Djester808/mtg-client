import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AccountApiService } from './account-api.service';

describe('AccountApiService', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HttpClientTestingModule] }));
  it('uses authenticated owner routes and keeps passwords in request bodies', () => {
    const api = TestBed.inject(AccountApiService),
      http = TestBed.inject(HttpTestingController);
    api.get().subscribe();
    http.expectOne('/api/account').flush({});
    api.sessions().subscribe();
    http.expectOne('/api/account/sessions').flush([]);
    api.revoke('device').subscribe();
    http.expectOne('/api/account/sessions/device').flush(null);
    api.signOutAll().subscribe();
    http.expectOne('/api/account/sign-out-all').flush(null);
    api.verify('123456').subscribe();
    expect(http.expectOne('/api/account/verify-email').request.body).toEqual({ code: '123456' });
    api.resend().subscribe();
    http.expectOne('/api/account/verify-email/resend').flush(null);
    api.changePassword('old', 'new').subscribe();
    const password = http.expectOne('/api/account/password');
    expect(password.request.body).toEqual({ currentPassword: 'old', newPassword: 'new' });
    password.flush(null);
    api.changeEmail('old', 'new@example.test').subscribe();
    http.expectOne('/api/account/email').flush(null);
    api.delete('old').subscribe();
    const deletion = http.expectOne('/api/account');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toEqual({ password: 'old' });
    deletion.flush(null);
    api.forgot('n@example.test').subscribe();
    http.expectOne('/api/auth/password/forgot').flush(null);
    api.reset('n@example.test', '123456', 'new').subscribe();
    http.expectOne('/api/auth/password/reset').flush(null);
    http.verify();
  });
});
