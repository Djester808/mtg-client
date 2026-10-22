import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountApiService } from '../services/account-api.service';
import { describeHttpError } from '../utils/http-error.utils';

@Component({
  selector: 'app-account-recovery',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `<main class="account-page account-recovery">
    <header>
      <img class="compleat-auth-logo" src="assets/brand/logo.png" alt="Compleat" />
      <h1>Reset your password</h1>
      <a routerLink="/login">Back to sign in</a>
    </header>
    <p role="alert" class="account-error" *ngIf="error()">{{ error() }}</p>
    <p role="status" class="account-notice" *ngIf="notice()">{{ notice() }}</p>
    <section *ngIf="!done()">
      <form #request="ngForm" (ngSubmit)="send()">
        <label for="recovery-email">Account email</label
        ><input
          id="recovery-email"
          name="email"
          type="email"
          email
          [(ngModel)]="email"
          required
          maxlength="254"
          autocomplete="email"
        /><button [disabled]="busy() || request.invalid">
          {{ requested() ? 'Send another code' : 'Send reset code' }}
        </button>
      </form>
    </section>
    <section *ngIf="requested() && !done()">
      <form #reset="ngForm" (ngSubmit)="save()">
        <label for="reset-code">Six-digit code</label
        ><input
          id="reset-code"
          name="code"
          [(ngModel)]="code"
          required
          pattern="[0-9]{6}"
          maxlength="6"
          inputmode="numeric"
          autocomplete="one-time-code"
        /><label for="reset-password">New password</label
        ><input
          id="reset-password"
          name="password"
          [(ngModel)]="password"
          type="password"
          required
          minlength="8"
          maxlength="128"
          autocomplete="new-password"
        /><button [disabled]="busy() || reset.invalid">Reset password</button>
      </form>
    </section>
    <a *ngIf="done()" routerLink="/login">Sign in with your new password</a>
  </main>`,
  styleUrls: ['./account-security.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountRecoveryComponent {
  email = '';
  code = '';
  password = '';
  readonly busy = signal(false);
  readonly requested = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  constructor(private api: AccountApiService) {}
  send() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.forgot(this.email).subscribe({
      next: () => {
        this.busy.set(false);
        this.requested.set(true);
        this.notice.set(
          'If that address has an account, a code has been sent. Check your inbox. Codes expire after 10 minutes.',
        );
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'A reset code could not be requested.'));
      },
    });
  }
  save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.reset(this.email, this.code, this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.done.set(true);
        this.notice.set('Password changed. Your previous sessions are signed out.');
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'The password could not be reset.'));
      },
    });
  }
}
