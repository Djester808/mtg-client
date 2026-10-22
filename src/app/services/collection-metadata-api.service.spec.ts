import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CollectionMetadataApiService } from './collection-metadata-api.service';
describe('CollectionMetadataApiService', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HttpClientTestingModule] }));
  it('keeps purchase metadata on owner routes and scopes Undo to its token', () => {
    const api = TestBed.inject(CollectionMetadataApiService),
      http = TestBed.inject(HttpTestingController);
    const metadata = {
      language: 'fr',
      condition: 'LP',
      purchasePrice: 12,
      currency: 'EUR',
      tags: ['Trade'],
    };
    api.get('collection', 'row').subscribe();
    http.expectOne('/api/collections/collection/cards/row/metadata').flush(metadata);
    api.update('collection', 'row', metadata).subscribe();
    const update = http.expectOne('/api/collections/collection/cards/row/metadata');
    expect(update.request.body).toEqual(metadata);
    update.flush(null);
    api.bulk('collection', ['row'], 'tag', 'Trade', null).subscribe();
    const bulk = http.expectOne('/api/collections/collection/cards/bulk');
    expect(bulk.request.body.cardIds).toEqual(['row']);
    bulk.flush({ undoToken: 'token', expiresAt: '', affected: 1 });
    api.undo('token').subscribe();
    http.expectOne('/api/collections/undo/token').flush(null);
    http.verify();
  });
});
