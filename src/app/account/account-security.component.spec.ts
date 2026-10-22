import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of, throwError } from 'rxjs';
import { AccountSecurityComponent } from './account-security.component';
import { AccountRecoveryComponent } from './account-recovery.component';
import { AccountApiService } from '../services/account-api.service';
import { AuthActions } from '../store/auth/auth.actions';

describe('Account management screens', () => {
  let api: jasmine.SpyObj<AccountApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('AccountApiService', [
      'deckPrivacy',
      'get',
      'sessions',
      'verify',
      'resend',
      'changePassword',
      'changeEmail',
      'revoke',
      'signOutAll',
      'delete',
      'forgot',
      'reset',
    ]);
    api.deckPrivacy.and.returnValue(of({ hideProfileDecks: false }));
    api.get.and.returnValue(
      of({
        id: 'user',
        username: 'Nissa',
        email: 'nissa@example.test',
        emailVerified: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );
    api.sessions.and.returnValue(of([]));
    for (const method of [
      'verify',
      'resend',
      'changePassword',
      'changeEmail',
      'revoke',
      'signOutAll',
      'delete',
      'forgot',
      'reset',
    ] as const)
      api[method].and.returnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [AccountSecurityComponent, AccountRecoveryComponent],
      providers: [
        provideRouter([]),
        provideMockStore(),
        { provide: AccountApiService, useValue: api },
      ],
    });
  });
  it('shows account state and supports verification and session revocation', () => {
    const fixture = TestBed.createComponent(AccountSecurityComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('nissa@example.test');
    page.code = '123456';
    page.verify();
    expect(api.verify).toHaveBeenCalledWith('123456');
    page.resend();
    expect(api.resend).toHaveBeenCalled();
    page.revoke({
      id: 'other',
      deviceLabel: 'Other',
      current: false,
      createdAt: '',
      lastUsedAt: '',
      expiresAt: '',
    });
    expect(api.revoke).toHaveBeenCalledWith('other');
    fixture.destroy();
  });
  it('signs out after changing credentials and does not delete without confirmation', () => {
    const fixture = TestBed.createComponent(AccountSecurityComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    page.deletePassword = 'password';
    page.deleteAccount();
    expect(api.delete).not.toHaveBeenCalled();
    page.deleteConfirmation = 'Nissa';
    page.deleteAccount();
    expect(api.delete).toHaveBeenCalledWith('password');
    expect(dispatch).toHaveBeenCalledWith(AuthActions.logout());
    page.password = 'old';
    page.newPassword = 'new';
    page.changePassword();
    expect(api.changePassword).toHaveBeenCalledWith('old', 'new');
    page.password = 'old';
    page.email = 'new@example.test';
    page.changeEmail();
    expect(api.changeEmail).toHaveBeenCalledWith('old', 'new@example.test');
    page.signOutAll();
    expect(api.signOutAll).toHaveBeenCalled();
    fixture.destroy();
  });
  it('reports errors without pretending a change succeeded', () => {
    api.get.and.returnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(AccountSecurityComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('could not load');
    api.resend.and.returnValue(throwError(() => new Error('offline')));
    fixture.componentInstance.resend();
    expect(fixture.componentInstance.error()).toContain('could not be saved');
    fixture.destroy();
  });
  it('provides the non-enumerating recovery flow and clears the new password on success', () => {
    const fixture = TestBed.createComponent(AccountRecoveryComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.email = 'nissa@example.test';
    page.send();
    fixture.detectChanges();
    expect(page.notice()).toContain('If that address has an account');
    page.code = '123456';
    page.password = 'ReplacementPassword!123';
    page.save();
    expect(api.reset).toHaveBeenCalledWith(page.email, '123456', 'ReplacementPassword!123');
    expect(page.done()).toBeTrue();
    expect(page.password).toBe('');
    fixture.destroy();
  });
});
