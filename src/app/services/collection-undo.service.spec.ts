import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { CollectionUndoService } from './collection-undo.service';
import { CollectionUndoComponent } from '../components/collection-undo/collection-undo.component';
import { CollectionOwnershipService } from './collection-ownership.service';
import { saveAuth, clearAuth } from './auth-storage';
const headers = (kind = 'move') =>
  new HttpHeaders({
    'X-Compleat-Undo': 'undo-token',
    'X-Compleat-Undo-Expires': new Date(Date.now() + 60000).toISOString(),
    'X-Compleat-Undo-Collections': 'source,target',
    'X-Compleat-Undo-Kind': kind,
  });
describe('Collection mutation undo', () => {
  beforeEach(() => {
    saveAuth('token', 'Owner');
    TestBed.configureTestingModule({
      imports: [CollectionUndoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockStore({
          initialState: {
            auth: { username: 'Owner' },
            collection: { activeCollection: { id: 'source' } },
            deck: { activeDeck: null },
          },
        }),
        { provide: CollectionOwnershipService, useValue: { invalidate: jasmine.createSpy() } },
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    clearAuth();
  });
  it('shows a bounded undo offer and refreshes the affected collection after undo', fakeAsync(() => {
    const f = TestBed.createComponent(CollectionUndoComponent),
      service = TestBed.inject(CollectionUndoService),
      store = TestBed.inject(MockStore),
      dispatch = spyOn(store, 'dispatch');
    f.detectChanges();
    service.accept(headers(), 'Owner');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('move completed');
    f.nativeElement.querySelector('button').click();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/collections/undo/undo-token',
    );
    expect(request.request.method).toBe('POST');
    request.flush(null);
    expect(dispatch).toHaveBeenCalled();
    expect(service.offer()).toBeNull();
    tick(6000);
    f.destroy();
  }));
  it('keeps last-added undo available after the brief banner and clears it once used', fakeAsync(() => {
    const f = TestBed.createComponent(CollectionUndoComponent);
    f.componentRef.setInput('collectionId', 'source');
    f.detectChanges();
    const service = TestBed.inject(CollectionUndoService);
    service.accept(headers('add'), 'Owner');
    tick(6000);
    expect(service.offer()).toBeNull();
    expect(service.lastAdd('source')).not.toBeNull();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Undo last added card');
    f.nativeElement.querySelector('button').click();
    TestBed.inject(HttpTestingController).expectOne('/api/collections/undo/undo-token').flush(null);
    expect(service.lastAdd('source')).toBeNull();
    f.destroy();
  }));
  it('does not offer undo for another account or malformed response and reports a conflict', fakeAsync(() => {
    const service = TestBed.inject(CollectionUndoService);
    service.accept(new HttpHeaders(), 'Owner');
    expect(service.offer()).toBeNull();
    service.accept(headers(), 'Other');
    expect(service.offer()).toBeNull();
    service.accept(headers(), 'Owner');
    const offer = service.offer()!;
    saveAuth('other', 'Other');
    service.undo(offer);
    TestBed.inject(HttpTestingController).expectNone('/api/collections/undo/undo-token');
    saveAuth('token', 'Owner');
    service.undo(offer);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/collections/undo/undo-token')
      .flush({ detail: 'These cards changed.' }, { status: 409, statusText: 'Conflict' });
    expect(service.error()).toContain('These cards changed.');
    tick(6000);
  }));
});
