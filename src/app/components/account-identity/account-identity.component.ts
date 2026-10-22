import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { AccountApiService } from '../../services/account-api.service';
import { AuthActions } from '../../store/auth/auth.actions';
import { describeHttpError } from '../../utils/http-error.utils';
@Component({
  selector: 'app-account-identity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-identity.component.html',
  styleUrls: ['../../account/account-security.component.scss', './account-identity.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountIdentityComponent implements OnInit {
  username = '';
  password = '';
  readonly available = signal<string | null>(null);
  readonly privacy = signal<boolean | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  constructor(
    private api: AccountApiService,
    private store: Store,
  ) {}
  ngOnInit() {
    this.loadPrivacy();
  }
  loadPrivacy() {
    this.error.set('');
    this.api.deckPrivacy().subscribe({
      next: (p) => this.privacy.set(p.hideProfileDecks),
      error: (e) => this.error.set(describeHttpError(e, 'Privacy settings could not load.')),
    });
  }
  checkUsername() {
    if (this.busy()) return;
    const checked = this.username.trim();
    this.busy.set(true);
    this.error.set('');
    this.available.set(null);
    this.api.usernameAvailable(checked).subscribe({
      next: (result) => {
        this.busy.set(false);
        if (this.username.trim() !== checked) return;
        if (result.available) this.available.set(checked);
        else this.error.set('That username is taken.');
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'Could not check that username.'));
      },
    });
  }
  changeUsername() {
    if (this.busy() || this.available() !== this.username.trim() || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    this.api.changeUsername(this.username.trim(), this.password).subscribe({
      next: () => {
        this.password = '';
        this.busy.set(false);
        this.store.dispatch(AuthActions.logout());
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'Username could not be changed.'));
      },
    });
  }
  togglePrivacy() {
    if (this.busy() || this.privacy() === null) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.setDeckPrivacy(!this.privacy()).subscribe({
      next: (p) => {
        this.privacy.set(p.hideProfileDecks);
        this.busy.set(false);
        this.notice.set('Deck privacy saved.');
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'Deck privacy could not be saved.'));
      },
    });
  }
}
