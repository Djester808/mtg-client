import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PrintingsService } from './printings.service';
import { PrintingDto } from '../models/game.models';

function makePrinting(scryfallId: string): PrintingDto {
  return {
    scryfallId,
    setCode: 'fdn',
    setName: 'Foundations',
    collectorNumber: '1',
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriLarge: null,
    imageUriNormalBack: null,
    oracleText: null,
    flavorText: null,
    artist: null,
    manaCost: null,
  };
}

describe('PrintingsService', () => {
  let service: PrintingsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(PrintingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads once and serves the cache afterwards', () => {
    const results: PrintingDto[][] = [];
    service.get('oracle-1').subscribe((p) => results.push(p));
    http.expectOne('/api/cards/oracle-1/printings').flush([makePrinting('scry-1')]);

    service.get('oracle-1').subscribe((p) => results.push(p));
    http.expectNone('/api/cards/oracle-1/printings');

    expect(results.length).toBe(2);
    expect(results[1][0].scryfallId).toBe('scry-1');
    expect(service.cached('oracle-1')).toBe(results[0]);
    expect(service.has('oracle-1')).toBeTrue();
  });

  it('de-duplicates concurrent requests for the same oracle id', () => {
    const results: PrintingDto[][] = [];
    service.get('oracle-1').subscribe((p) => results.push(p));
    service.get('oracle-1').subscribe((p) => results.push(p));

    http.expectOne('/api/cards/oracle-1/printings').flush([makePrinting('scry-1')]);

    expect(results.length).toBe(2);
    expect(results[0]).toEqual(results[1]);
  });

  it('resolves errors to an empty array and retries on the next call', () => {
    const results: PrintingDto[][] = [];
    service.get('oracle-1').subscribe((p) => results.push(p));
    http.expectOne('/api/cards/oracle-1/printings').error(new ProgressEvent('fail'));

    expect(results[0]).toEqual([]);
    expect(service.has('oracle-1')).toBeFalse();

    service.get('oracle-1').subscribe((p) => results.push(p));
    http.expectOne('/api/cards/oracle-1/printings').flush([makePrinting('scry-2')]);
    expect(results[1][0].scryfallId).toBe('scry-2');
  });

  it('cached returns null before any load', () => {
    expect(service.cached('oracle-x')).toBeNull();
    expect(service.has('oracle-x')).toBeFalse();
  });
});
