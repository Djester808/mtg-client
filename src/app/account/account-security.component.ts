import { AccountIdentityComponent } from '../components/account-identity/account-identity.component';
import { AccountNavComponent } from '../components/account-nav/account-nav.component';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, forkJoin } from 'rxjs';
import { AccountApiService, AccountDetails, AccountSession } from '../services/account-api.service';
import { AuthActions } from '../store/auth/auth.actions';
import { describeHttpError } from '../utils/http-error.utils';

@Component({
  selector: 'app-account-security',
  standalone: true,
  imports: [AccountIdentityComponent, AccountNavComponent, CommonModule, FormsModule, RouterLink],
  templateUrl: './account-security.component.html',
  styleUrls: ['./account-security.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityComponent implements OnInit {
  readonly account = signal<AccountDetails | null>(null);
  readonly sessions = signal<AccountSession[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  code = '';
  password = '';
  newPassword = '';
  email = '';
  deletePassword = '';
  deleteConfirmation = '';
  constructor(
    private api: AccountApiService,
    private store: Store,
  ) {}
  ngOnInit() {
    this.load();
  }
  load() {
    this.busy.set(true);
    this.error.set('');
    forkJoin({ account: this.api.get(), sessions: this.api.sessions() }).subscribe({
      next: ({ account, sessions }) => {
        this.account.set(account);
        this.sessions.set(sessions);
        this.busy.set(false);
      },
      error: (error) => {
        this.error.set(describeHttpError(error, 'Account settings could not load.'));
        this.busy.set(false);
      },
    });
  }
  run(request: Observable<void>, message: string, signOut = false, reload = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(message);
        this.password = '';
        this.newPassword = '';
        this.deletePassword = '';
        if (signOut) this.store.dispatch(AuthActions.logout());
        else if (reload) this.load();
      },
      error: (error) => {
        this.busy.set(false);
        this.error.set(describeHttpError(error, 'That change could not be saved.'));
      },
    });
  }
  verify() {
    this.run(this.api.verify(this.code), 'Your email is verified.', false, true);
  }
  resend() {
    this.run(
      this.api.resend(),
      'A new code has been requested. Check your inbox; requests are limited to one per minute.',
    );
  }
  changePassword() {
    this.run(
      this.api.changePassword(this.password, this.newPassword),
      'Password changed. Sign in again.',
      true,
    );
  }
  changeEmail() {
    this.run(
      this.api.changeEmail(this.password, this.email),
      'Email changed. Sign in and verify your new address.',
      true,
    );
  }
  revoke(session: AccountSession) {
    this.run(this.api.revoke(session.id), 'Device signed out.', session.current, !session.current);
  }
  signOutAll() {
    this.run(this.api.signOutAll(), 'All devices signed out.', true);
  }
  deleteAccount() {
    if (this.deleteConfirmation !== this.account()?.username || !this.deletePassword) return;
    this.run(this.api.delete(this.deletePassword), 'Your account was deleted.', true);
  }
  trackSession(_index: number, session: AccountSession) {
    return session.id;
  }
}
