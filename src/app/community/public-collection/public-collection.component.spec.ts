import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { provideMockStore } from '@ngrx/store/testing';
import { PublicCollectionComponent } from './public-collection.component';
import {
  PublicCollectionApiService,
  PublicCollectionSummary,
} from '../../services/public-collection-api.service';
describe('Collection sharing', () => {
  let api: jasmine.SpyObj<PublicCollectionApiService>;
  function setup(owner: boolean) {
    api = jasmine.createSpyObj('PublicCollectionApiService', [
      'visibility',
      'setVisibility',
      'summary',
    ]);
    api.visibility.and.returnValue(of({ public: false }));
    api.setVisibility.and.returnValue(of(undefined));
    api.summary.and.returnValue(of({ copies: 4 } as PublicCollectionSummary));
    TestBed.configureTestingModule({
      imports: [PublicCollectionComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState: { auth: { username: 'Owner' } } }),
        { provide: PublicCollectionApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { owner } },
            paramMap: of(convertToParamMap({ username: 'Owner' })),
          },
        },
      ],
    });
  }
  it('loads default privacy, enables sharing, revokes it, and reports a failed write', () => {
    setup(true);
    const c = TestBed.createComponent(PublicCollectionComponent).componentInstance;
    expect(c.visible()).toBeFalse();
    c.save(true);
    expect(c.visible()).toBeTrue();
    expect(c.notice()).toContain('public');
    c.save(false);
    expect(c.notice()).toContain('private');
    api.setVisibility.and.returnValue(throwError(() => new Error()));
    c.save(true);
    expect(c.visible()).toBeFalse();
    expect(c.error()).toContain('not saved');
    expect(c.saving()).toBeFalse();
    api.visibility.and.returnValue(throwError(() => new Error()));
    c.load();
    expect(c.error()).toContain('loaded');
  });
  it('renders public counts and treats hidden and missing collections alike', () => {
    setup(false);
    const c = TestBed.createComponent(PublicCollectionComponent).componentInstance;
    expect(c.summary()?.copies).toBe(4);
    expect(c.username()).toBe('Owner');
    api.summary.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    c.load();
    expect(c.summary()).toBeNull();
    expect(c.error()).toContain('private or unavailable');
    api.summary.and.returnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
    c.load();
    expect(c.error()).toContain('retry');
    expect(c.loading()).toBeFalse();
  });
});
