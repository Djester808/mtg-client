import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectionOwnershipService } from './collection-ownership.service';
import { OwnedCardBadgeComponent } from '../components/owned-card-badge/owned-card-badge.component';
import { saveAuth, clearAuth } from './auth-storage';
describe('Global collection ownership', () => {
  beforeEach(() => {
    clearAuth();
    TestBed.configureTestingModule({
      imports: [OwnedCardBadgeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    clearAuth();
  });
  it('never exposes the previous owner counts before a new ensure call', () => {
    const s = TestBed.inject(CollectionOwnershipService);
    saveAuth('a', 'A');
    s.ensure();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/collections/owned')
      .flush([{ oracleId: 'o', quantity: 4, quantityFoil: 0 }]);
    expect(s.count('o')?.normal).toBe(4);
    saveAuth('b', 'B');
    expect(s.count('o')).toBeNull();
    clearAuth();
    expect(s.count('o')).toBeNull();
  });
  it('does not request private data while signed out', () => {
    const s = TestBed.inject(CollectionOwnershipService);
    s.ensure();
    expect(s.count('o')).toBeNull();
  });
  it('aggregates printings and languages, displays the count and refreshes after mutations', () => {
    saveAuth('token', 'Owner', false);
    const f = TestBed.createComponent(OwnedCardBadgeComponent);
    f.componentRef.setInput('oracleId', 'o');
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController),
      s = TestBed.inject(CollectionOwnershipService);
    http.expectOne('/api/collections/owned').flush([
      { oracleId: 'o', scryfallId: 'p', language: 'en', quantity: 2, quantityFoil: 1 },
      { oracleId: 'o', scryfallId: 'p', language: 'ja', quantity: 3, quantityFoil: 0 },
      { oracleId: 'o', scryfallId: null, language: 'en', quantity: 1, quantityFoil: 0 },
    ]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Owned across collections: 7');
    expect(s.count('o', 'p')).toEqual({ normal: 5, foil: 1, etched: 0 });
    expect(s.count('o', null)).toEqual({ normal: 1, foil: 0, etched: 0 });
    expect(s.count('missing')).toEqual({ normal: 0, foil: 0, etched: 0 });
    s.ensure();
    http.expectNone('/api/collections/owned');
    s.invalidate();
    http.expectOne('/api/collections/owned').flush([]);
    expect(s.count('o')).toEqual({ normal: 0, foil: 0, etched: 0 });
    f.destroy();
  });
  it('ignores in-flight results from a different account and allows retry after failure', () => {
    const s = TestBed.inject(CollectionOwnershipService),
      http = TestBed.inject(HttpTestingController);
    saveAuth('a', 'A');
    s.ensure();
    const first = http.expectOne('/api/collections/owned');
    saveAuth('b', 'B');
    s.ensure();
    const second = http.expectOne('/api/collections/owned');
    first.flush([{ oracleId: 'o', quantity: 99, quantityFoil: 0 }]);
    expect(s.count('o')).toBeNull();
    second.flush('failed', { status: 500, statusText: 'Failure' });
    s.ensure();
    http.expectOne('/api/collections/owned').flush([]);
    expect(s.count('o')).toEqual({ normal: 0, foil: 0, etched: 0 });
  });
});
