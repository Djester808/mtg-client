import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  computed,
  effect,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectIsLoggedIn, selectUsername } from '../../store/auth/auth.selectors';
import { AuthActions } from '../../store/auth/auth.actions';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointsService } from '../../shared/breakpoints.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { ProfileApiService } from '../../services/profile-api.service';

/** One destination in the primary nav. */
interface NavLink {
  path: string;
  label: string;
  /** Home matches every route as a prefix, so only it needs exact matching. */
  exact: boolean;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, UserAvatarComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  isLoggedIn$ = this.store.select(selectIsLoggedIn);
  accountOpen = signal(false);

  /**
   * What the store believes the username is.
   *
   * Trusted only as a fallback. Until this was fixed the login effect stored whatever was
   * typed into the sign-in box, and that box accepts an email address — so a session
   * started that way carries an email here, and sessions started before the fix still do
   * until the next sign-in.
   */
  private readonly storedUsername = toSignal(this.store.select(selectUsername), {
    initialValue: null,
  });

  /**
   * The signed-in user's picture, or null for the initial placeholder.
   *
   * Read from the profile service's shared copy rather than fetched here, so changing the
   * photo on the account page updates the bar immediately instead of at the next reload.
   */
  readonly avatarUrl = computed(() => this.profiles.myProfile()?.profile.avatarUrl ?? null);

  /**
   * The username to identify this account by — the profile's, which is authoritative,
   * falling back to the store's only until the profile has loaded.
   */
  readonly accountHandle = computed(
    () => this.profiles.myProfile()?.profile.username ?? this.storedUsername() ?? '',
  );

  /** What the bar actually shows: their chosen display name, else their username. */
  readonly accountName = computed(
    () => this.profiles.myProfile()?.profile.displayName?.trim() || this.accountHandle(),
  );

  /**
   * Below $bp-nav the bar collapses into a drawer, which renders this same list. One
   * array rather than two blocks of markup: the links were about to exist twice, and a
   * destination added to only one of them is a bug that is invisible on whichever width
   * you happen to be developing at.
   */
  readonly navLinks: readonly NavLink[] = [
    { path: '/', label: 'Home', exact: true },
    { path: '/collection', label: 'Collection', exact: false },
    { path: '/deck', label: 'Decks', exact: false },
    { path: '/community', label: 'Community', exact: false },
    { path: '/kb', label: 'Rules', exact: false },
  ];

  menuOpen = signal(false);

  constructor(
    private store: Store,
    private profiles: ProfileApiService,
    breakpoints: BreakpointsService,
  ) {
    // Load the profile once signed in, and drop it on the way out so the next account
    // does not briefly wear the last one's face. Failure is silent on purpose: the bar
    // falls back to the initial, and a toast about it would be noise on every page.
    this.store.select(selectIsLoggedIn).subscribe((loggedIn) => {
      if (!loggedIn) {
        this.profiles.clearMyProfile();
        return;
      }
      if (this.profiles.myProfile() === null) {
        this.profiles.getMyProfile().subscribe({ error: () => undefined });
      }
    });

    // Above $bp-nav the drawer is `display: none` and the toggle is gone with it, so an
    // open menu up there is a state nothing renders and nothing can close — and it does
    // not stay invisible. Open the menu on a narrow window, widen it, narrow it again, and
    // the drawer came back on its own with the toggle still showing its X. Dragging a
    // window across the breakpoint crosses it several times, which flicked the drawer open
    // and shut on each crossing.
    //
    // Closing it on the way up is the fix: the state cannot go stale if it cannot survive
    // the trip.
    effect(
      () => {
        if (!breakpoints.isNavCollapsed()) {
          this.menuOpen.set(false);
          this.accountOpen.set(false);
        }
      },
      { allowSignalWrites: true },
    );
  }

  toggleAccount(): void {
    this.accountOpen.update((v) => !v);
  }

  signOut(): void {
    this.accountOpen.set(false);
    this.menuOpen.set(false);
    this.store.dispatch(AuthActions.logout());
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  /**
   * Closed from the scrim, from Escape, and from every link inside it. Tapping the link
   * for the route you are already on does not navigate, so leaving the drawer to a
   * router event would strand it open in exactly that case.
   */
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.account-menu')) {
      this.accountOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.accountOpen.set(false);
    this.menuOpen.set(false);
  }
}
