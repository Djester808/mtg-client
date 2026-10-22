import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { CommanderDirectoryComponent } from './commander-directory.component';
import { makeCard } from '../../testing/test-factories';
describe('Commander directory screen', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CommanderDirectoryComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('renders server totals and rows, sends filter changes and offers retry after failures', () => {
    const f = TestBed.createComponent(CommanderDirectoryComponent),
      page = f.componentInstance,
      http = TestBed.inject(HttpTestingController);
    f.detectChanges();
    http.expectOne('/api/explore/directory').flush({
      commanders: [{ name: 'Commander', card: makeCard({ oracleId: 'c' }), decks: 20, rank: 3 }],
      total: 101,
      page: 2,
      pageSize: 40,
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.directory-rows a').textContent).toContain('Commander');
    expect(page.total()).toBe(101);
    expect(page.page()).toBe(2);
    expect(page.size()).toBe(40);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    page.change('identity', 'WU');
    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { d_identity: 'WU', d_page: null },
        queryParamsHandling: 'merge',
      }),
    );
    page.retry();
    http
      .expectOne('/api/explore/directory')
      .flush('offline', { status: 502, statusText: 'Unavailable' });
    f.detectChanges();
    expect(page.failed()).toBeTrue();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('could not load');
    page.retry();
    http
      .expectOne('/api/explore/directory')
      .flush({ commanders: [], total: 0, page: 1, pageSize: 40 });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No commanders match');
    f.destroy();
  });
});
