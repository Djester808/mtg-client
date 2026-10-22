import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { selectIsLoggedIn } from '../../store/auth/auth.selectors';
import { NavbarComponent } from './navbar.component';
import { BreakpointsService } from '../../shared/breakpoints.service';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProfileApiService } from '../../services/profile-api.service';

/**
 * A BreakpointsService whose answers the test drives, so these run at whatever width the
 * Karma window happens to be.
 */
class FakeBreakpoints {
  readonly collapsed = signal(true);
  readonly isPhone = signal(true);
  get isNavCollapsed() {
    return this.collapsed;
  }
}

describe('NavbarComponent', () => {
  let bp: FakeBreakpoints;

  beforeEach(() => {
    bp = new FakeBreakpoints();
    TestBed.configureTestingModule({
      imports: [NavbarComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState: { auth: { user: null, token: null } } }),
        { provide: BreakpointsService, useValue: bp },
      ],
    });
  });

  it('shows the original Compleat sigil and wordmark', () => {
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    const brand = fixture.nativeElement.querySelector('.compleat-brand');
    expect(brand.getAttribute('aria-label')).toBe('Compleat');
    expect(brand.querySelector('.compleat-sigil').getAttribute('src')).toBe(
      'assets/brand/sigil.png',
    );
    expect(brand.querySelector('.compleat-wordmark').getAttribute('src')).toBe(
      'assets/brand/wordmark.png',
    );
    fixture.destroy();
  });

  it('closes the drawer when the viewport grows past the navbar breakpoint', () => {
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    const nav = fixture.componentInstance;

    nav.toggleMenu();
    expect(nav.menuOpen()).withContext('open at collapsed width').toBeTrue();

    // The regression this guards: above $bp-nav the drawer is display:none and the toggle
    // is gone with it, so an open menu is a state nothing renders and nothing can close.
    // Left alone it survived the trip and the drawer reappeared, by itself, on the way
    // back down — and a window drag crosses the breakpoint several times, so it flicked
    // open and shut on each crossing.
    bp.collapsed.set(false);
    fixture.detectChanges();

    expect(nav.menuOpen()).withContext('closed on the way up').toBeFalse();

    bp.collapsed.set(true);
    fixture.detectChanges();

    expect(nav.menuOpen()).withContext('stays closed coming back down').toBeFalse();
  });

  it('leaves the drawer alone while the viewport stays narrow', () => {
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    const nav = fixture.componentInstance;

    nav.toggleMenu();
    fixture.detectChanges();

    expect(nav.menuOpen()).toBeTrue();
  });

  it('renders every nav destination in the drawer, not just the bar', () => {
    // The links exist once in TypeScript for this reason; the drawer and the bar both
    // render that array, so a destination cannot be added to only one of them.
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.componentInstance.toggleMenu();
    fixture.detectChanges();

    const drawer: HTMLElement | null = fixture.nativeElement.querySelector('.mobile-nav');
    expect(drawer).withContext('drawer rendered while open').not.toBeNull();

    const labels = Array.from(drawer!.querySelectorAll('.mobile-nav-link')).map((a) =>
      (a.textContent ?? '').trim(),
    );
    for (const link of fixture.componentInstance.navLinks) {
      expect(labels).toContain(link.label);
    }
  });

  it('offers the rules knowledge base as a destination', () => {
    // The loop above only proves the drawer renders whatever the array holds; it would
    // stay green if the destination itself were dropped.
    const fixture = TestBed.createComponent(NavbarComponent);
    const rules = fixture.componentInstance.navLinks.find((l) => l.path === '/kb');

    expect(rules).withContext('nav must reach /kb').toBeDefined();
    expect(rules!.label).toBe('Rules');
  });

  it('offers playing a game as a destination', () => {
    // The game shipped with routes and no way in — reachable only by typing the URL, which is
    // not a feature anybody finds. The destination is /lobby, which is the route the board had
    // before the engine UI was removed and has again.
    const fixture = TestBed.createComponent(NavbarComponent);
    const play = fixture.componentInstance.navLinks.find((l) => l.path === '/lobby');

    expect(play).withContext('nav must reach the lobby').toBeDefined();
    expect(play!.label).toBe('Play');
  });

  it('offers the tools as a destination', () => {
    const fixture = TestBed.createComponent(NavbarComponent);
    const tools = fixture.componentInstance.navLinks.find((l) => l.path === '/tools');

    expect(tools).withContext('nav must reach /tools').toBeDefined();
    expect(tools!.label).toBe('Tools');
    // Prefix matching, or the item would stop reading as current on /tools/life-counter —
    // which is the page anyone who opened Tools is actually looking at.
    expect(tools!.exact).toBeFalse();
  });
});

describe('NavbarComponent avatar', () => {
  let bp: FakeBreakpoints;

  beforeEach(() => {
    bp = new FakeBreakpoints();
    TestBed.configureTestingModule({
      imports: [NavbarComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        provideMockStore({
          initialState: { auth: { username: 'Nissa', token: 'jwt' } },
          selectors: [{ selector: selectIsLoggedIn, value: true }],
        }),
        { provide: BreakpointsService, useValue: bp },
      ],
    });
  });

  afterEach(() => TestBed.inject(MockStore).resetSelectors());

  it('loads the profile once and shows the picture in the bar', () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();

    http.expectOne('/api/profile/me').flush({
      email: 'n@example.com',
      privateStats: { collectionValueUsd: 0, copiesValued: 0, unpublishedDecks: 0 },
      profile: {
        username: 'Nissa',
        displayName: 'Nissa Revane',
        avatarUrl: '/api/users/Nissa/avatar?v=1',
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.avatarUrl()).toBe('/api/users/Nissa/avatar?v=1');
    expect(fixture.nativeElement.querySelector('app-user-avatar img.ua-img')).toBeTruthy();
    http.verify();
  });

  it('drops the cached profile on sign-out so the next account does not inherit a face', () => {
    const http = TestBed.inject(HttpTestingController);
    const profiles = TestBed.inject(ProfileApiService);
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();

    http.expectOne('/api/profile/me').flush({
      email: 'n@example.com',
      privateStats: { collectionValueUsd: 0, copiesValued: 0, unpublishedDecks: 0 },
      profile: { username: 'Nissa', displayName: null, avatarUrl: '/avatar.png' },
    });
    expect(profiles.myProfile()).not.toBeNull();

    profiles.clearMyProfile();

    expect(profiles.myProfile()).toBeNull();
    expect(fixture.componentInstance.avatarUrl()).toBeNull();
    http.verify();
  });
});
