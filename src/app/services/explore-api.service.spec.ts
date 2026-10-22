import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ExploreApiService } from './explore-api.service';
import { PublicCollectionApiService } from './public-collection-api.service';
describe('Explore and sharing API boundaries', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('preserves the kind, variant and search text in encoded parameters', () => {
    const api = TestBed.inject(ExploreApiService),
      http = TestBed.inject(HttpTestingController);
    api.directory().subscribe();
    http.expectOne('/api/explore/commanders').flush({ commanders: [] });
    for (const [kind, path] of [
      ['card', 'cards/id'],
      ['commander', 'commanders/id'],
      ['average', 'commanders/id/average'],
    ]) {
      api.page('id', kind, 'theme-infect').subscribe();
      const r = http.expectOne((req) => req.url === '/api/explore/' + path);
      expect(r.request.params.get('variant')).toBe('theme-infect');
      r.flush({});
    }
    api.copyAverage('id', 'budget').subscribe();
    const copy = http.expectOne('/api/explore/commanders/id/average/copy');
    expect(copy.request.method).toBe('POST');
    expect(copy.request.body).toEqual({ variant: 'budget' });
    copy.flush({ id: 'copied' });
    api.search('Atraxa, Voice', 'commander').subscribe();
    const r = http.expectOne((req) => req.url === '/api/explore/search');
    expect(r.request.params.get('q')).toBe('Atraxa, Voice');
    r.flush([]);
  });
  it('keeps owner sharing writes separate from public read-only counts', () => {
    const api = TestBed.inject(PublicCollectionApiService),
      http = TestBed.inject(HttpTestingController);
    api.visibility().subscribe();
    http.expectOne('/api/profile/me/collection-visibility').flush({ public: false });
    api.setVisibility(true).subscribe();
    const put = http.expectOne('/api/profile/me/collection-visibility');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ public: true });
    put.flush(null);
    api.summary('A B').subscribe();
    http.expectOne('/api/public-collections/A%20B/summary').flush({});
  });
});
