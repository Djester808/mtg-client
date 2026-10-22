import { fakeAsync, tick } from '@angular/core/testing';
import { CollectionPageService } from './collection-page.service';
import { CollectionQueryState } from './collection-query-state';
import { CollectionDetailDto } from '../models/collection.models';
import { EMPTY_FILTER } from '../models/card-filters';
describe('Server collection paging', () => {
  function fixture(page = 1, total = 205): CollectionDetailDto {
    return {
      id: 'owned',
      cards: [{ id: 'row' }],
      pageData: { page, pageSize: 100, total, totalRows: 205 },
    } as CollectionDetailDto;
  }
  it('keeps only the returned page, requests the next page and retains query on refresh', fakeAsync(() => {
    const queries = new CollectionQueryState(),
      service = new CollectionPageService(queries),
      refresh = jasmine.createSpy();
    service.bind('owned', refresh);
    const request = queries.from(EMPTY_FILTER, false),
      col = fixture();
    expect(service.rows(col, request)).toBe(col.cards);
    expect(service.total).toBe(205);
    expect(service.pages).toBe(3);
    service.go(2);
    tick(180);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(queries.get('owned').page).toBe(3);
    expect(service.rows(fixture(3), request).length).toBe(1);
    expect(service.index).toBe(2);
    service.destroy();
  }));
  it('debounces full regex queries, resets page and cancels pending work on exit', fakeAsync(() => {
    const queries = new CollectionQueryState(),
      service = new CollectionPageService(queries),
      refresh = jasmine.createSpy();
    service.bind('owned', refresh);
    service.rows(fixture(), queries.from(EMPTY_FILTER, false));
    service.go(2);
    tick(180);
    refresh.calls.reset();
    service.rows(
      fixture(3),
      queries.from({ ...EMPTY_FILTER, query: '(?<=Card )204$', regex: true }, false),
    );
    tick(180);
    expect(queries.get('owned').page).toBe(1);
    expect(queries.get('owned').regex).toBeTrue();
    expect(refresh).toHaveBeenCalledTimes(1);
    service.go(1);
    service.destroy();
    tick(180);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(queries.get('other').page).toBe(1);
  }));
});
