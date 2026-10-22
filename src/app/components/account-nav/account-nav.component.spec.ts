import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AccountNavComponent } from './account-nav.component';
describe('Account navigation', () => {
  it('highlights only the current page and preserves real navigation links', async () => {
    TestBed.configureTestingModule({
      imports: [AccountNavComponent],
      providers: [
        provideRouter([
          { path: 'account/security', component: AccountNavComponent },
          { path: 'account', component: AccountNavComponent },
          { path: 'settings', component: AccountNavComponent },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(AccountNavComponent),
      router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/account/security');
    await fixture.whenStable();
    fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/account',
      '/account/security',
      '/settings',
    ]);
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
    await router.navigateByUrl('/settings');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(links[1].getAttribute('aria-current')).toBeNull();
    expect(links[2].getAttribute('aria-current')).toBe('page');
  });
});
