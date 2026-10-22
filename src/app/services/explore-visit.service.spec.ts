import { TestBed } from '@angular/core/testing';
import { ExploreVisitService } from './explore-visit.service';
import { OwnerDraftsService } from './owner-drafts.service';
import { clearAuth, saveAuth } from './auth-storage';
describe('Explore visit', () => {
  afterEach(() => clearAuth());
  it('keeps destination and visit additions across pages and isolates account changes', () => {
    const drafts = jasmine.createSpyObj<OwnerDraftsService>('drafts', ['read', 'write']);
    drafts.read.and.returnValue('saved-deck');
    TestBed.configureTestingModule({
      providers: [{ provide: OwnerDraftsService, useValue: drafts }],
    });
    saveAuth('token', 'A');
    const service = TestBed.inject(ExploreVisitService);
    service.restore();
    expect(service.deck()).toBe('saved-deck');
    service.added('deck', 'Sol Ring', 2);
    service.restore();
    expect(service.deck()).toBe('deck');
    expect(service.trail().length).toBe(1);
    expect(drafts.write).toHaveBeenCalledWith('explore', 'destination', 'deck');
    saveAuth('token', 'B');
    drafts.read.and.returnValue(null);
    service.restore();
    expect(service.deck()).toBe('');
    expect(service.trail()).toEqual([]);
  });
});
