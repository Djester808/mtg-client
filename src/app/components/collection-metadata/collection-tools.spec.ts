import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CollectionMetadataComponent } from './collection-metadata.component';
import { CollectionBulkToolsComponent } from '../collection-bulk-tools/collection-bulk-tools.component';
import { CollectionMetadataApiService } from '../../services/collection-metadata-api.service';

describe('Owned metadata and bulk editing', () => {
  let api: jasmine.SpyObj<CollectionMetadataApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('CollectionMetadataApiService', ['get', 'update', 'bulk', 'undo']);
    api.get.and.returnValue(
      of({ language: 'en', condition: 'LP', purchasePrice: 12, currency: 'USD', tags: ['Trade'] }),
    );
    api.update.and.returnValue(of(undefined));
    api.undo.and.returnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [CollectionMetadataComponent, CollectionBulkToolsComponent],
      providers: [{ provide: CollectionMetadataApiService, useValue: api }],
    });
  });
  it('loads and saves private purchase details without altering quantities', () => {
    const fixture = TestBed.createComponent(CollectionMetadataComponent);
    fixture.componentRef.setInput('collectionId', 'collection');
    fixture.componentRef.setInput('rowId', 'row');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.purchasePrice).toBe(12);
    page.language = 'fr';
    page.tags = 'Trade, Staples';
    page.save();
    expect(api.update).toHaveBeenCalledWith('collection', 'row', {
      finish: 'nonfoil',
      notes: null,
      language: 'fr',
      condition: 'LP',
      purchasePrice: 12,
      currency: 'USD',
      tags: ['Trade', 'Staples'],
    });
    expect(page.notice()).toContain('saved');
    fixture.destroy();
  });
  it('loads and saves only the selected finish and preserves its private notes', () => {
    const fixture = TestBed.createComponent(CollectionMetadataComponent);
    fixture.componentRef.setInput('collectionId', 'collection');
    fixture.componentRef.setInput('rowId', 'row');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.finish = 'etched';
    page.load();
    expect(api.get).toHaveBeenCalledWith('collection', 'row', 'etched');
    page.notes = 'Etched copy only';
    page.save();
    expect(api.update.calls.mostRecent().args[2]).toEqual(
      jasmine.objectContaining({ finish: 'etched', notes: 'Etched copy only' }),
    );
    fixture.destroy();
  });
  it('surfaces load and write failures', () => {
    api.get.and.returnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(CollectionMetadataComponent);
    fixture.componentRef.setInput('collectionId', 'collection');
    fixture.componentRef.setInput('rowId', 'row');
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('could not load');
    fixture.destroy();
  });
  it('offers Undo only within the server expiry and sends exactly the selected row ids', fakeAsync(() => {
    api.bulk.and.returnValue(
      of({ undoToken: 'token', expiresAt: new Date(Date.now() + 5000).toISOString(), affected: 2 }),
    );
    const fixture = TestBed.createComponent(CollectionBulkToolsComponent);
    fixture.componentRef.setInput('collectionId', 'collection');
    fixture.componentRef.setInput('selectedIds', new Set(['one', 'two']));
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.tag = 'Trade';
    page.apply();
    expect(api.bulk).toHaveBeenCalledWith('collection', ['one', 'two'], 'tag', 'Trade', 'NM');
    expect(page.undoToken()).toBe('token');
    page.undo();
    expect(api.undo).toHaveBeenCalledWith('token');
    expect(page.notice()).toContain('undone');
    page.apply();
    tick(5001);
    expect(page.undoToken()).toBeNull();
    fixture.destroy();
  }));
  it('keeps newer-work conflicts visible instead of claiming Undo succeeded', () => {
    api.undo.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'These cards changed after the bulk edit.' },
          }),
      ),
    );
    const fixture = TestBed.createComponent(CollectionBulkToolsComponent);
    const page = fixture.componentInstance;
    page.undoToken.set('token');
    page.undo();
    expect(page.error()).toContain('changed');
    expect(page.undoToken()).toBeNull();
    fixture.destroy();
  });
});
