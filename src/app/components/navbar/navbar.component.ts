import { Component, ChangeDetectionStrategy, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectIsLoggedIn, selectUsername } from '../../store/auth/auth.selectors';
import { AuthActions } from '../../store/auth/auth.actions';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  isLoggedIn$ = this.store.select(selectIsLoggedIn);
  username$   = this.store.select(selectUsername);
  accountOpen = signal(false);

  constructor(private store: Store) {}

  toggleAccount(): void {
    this.accountOpen.update(v => !v);
  }

  signOut(): void {
    this.accountOpen.set(false);
    this.store.dispatch(AuthActions.logout());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.account-menu')) {
      this.accountOpen.set(false);
    }
  }
}
