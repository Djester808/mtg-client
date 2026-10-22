import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
@Component({
  selector: 'app-account-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav aria-label="Account and settings">
    <a
      routerLink="/account"
      routerLinkActive="is-active"
      [routerLinkActiveOptions]="{ exact: true }"
      ariaCurrentWhenActive="page"
      ><i class="bi bi-person" aria-hidden="true"></i>Profile</a
    >
    <a routerLink="/account/security" routerLinkActive="is-active" ariaCurrentWhenActive="page"
      ><i class="bi bi-shield-lock" aria-hidden="true"></i>Security</a
    >
    <a routerLink="/settings" routerLinkActive="is-active" ariaCurrentWhenActive="page"
      ><i class="bi bi-sliders" aria-hidden="true"></i>Settings</a
    >
  </nav>`,
  styleUrls: ['./account-nav.component.scss'],
})
export class AccountNavComponent {}
