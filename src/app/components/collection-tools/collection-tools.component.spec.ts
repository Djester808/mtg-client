import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectionToolsComponent } from './collection-tools.component';
import { CollectionDetailDto } from '../../models/game.models';
import { UI_PREFERENCES_KEY, UiPreferencesService } from '../../services/ui-preferences.service';
describe('Collection value and exports', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem(UI_PREFERENCES_KEY);
    TestBed.configureTestingModule({
      imports: [CollectionToolsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.removeItem(UI_PREFERENCES_KEY);
  });
  function setup() {
    const f = TestBed.createComponent(CollectionToolsComponent);
    f.componentInstance.collection = {
      id: 'collection',
      name: 'All cards',
      cards: [
        { quantity: 2, quantityFoil: 1, cardDetails: { prices: { usd: 3, usdFoil: 5 } } },
        { quantity: 1, quantityFoil: 0, cardDetails: null },
      ],
    } as CollectionDetailDto;
    f.detectChanges();
    return f;
  }
  it('values regular and foil copies separately and hides the amount from the DOM persistently', () => {
    const f = setup(),
      c = f.componentInstance;
    expect(c.valuation).toEqual({ value: 11, priced: 3, copies: 4 });
    const first = c.valuation;
    expect(c.valuation).toBe(first);
    expect(f.nativeElement.textContent).toContain('$11.00');
    c.toggleValue();
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('$11.00');
    expect(f.nativeElement.textContent).toContain('Value hidden');
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)!).hideCollectionValue).toBeTrue();
    c.toggleValue();
    expect(TestBed.inject(UiPreferencesService).state().hideCollectionValue).toBeFalse();
    f.destroy();
  });
  it('opens all ten insights and respects hidden value', () => {
    const f = setup();
    f.componentInstance.showInsights.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-collection-insights article').length).toBe(10);
    f.componentInstance.toggleValue();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-collection-insights').textContent).toContain(
      'Show collection value',
    );
    f.destroy();
  });
  it('downloads both formats and revokes their object URLs', fakeAsync(() => {
    const f = setup(),
      c = f.componentInstance,
      click = spyOn(HTMLAnchorElement.prototype, 'click'),
      url = spyOn(URL, 'createObjectURL').and.returnValue('blob:test'),
      revoke = spyOn(URL, 'revokeObjectURL');
    for (const format of ['csv', 'text'] as const) {
      c.download(format);
      c.download(format);
      const request = http.expectOne('/api/collections/collection/export?format=' + format);
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['export']));
      expect(c.busy()).toBeFalse();
      expect(c.notice()).toContain('exported');
    }
    expect(click).toHaveBeenCalledTimes(2);
    expect(url).toHaveBeenCalledTimes(2);
    tick(1000);
    expect(revoke).toHaveBeenCalledTimes(2);
    f.destroy();
  }));
  it('allows retry after a failed export', () => {
    const f = setup(),
      c = f.componentInstance;
    c.download('csv');
    http
      .expectOne('/api/collections/collection/export?format=csv')
      .flush(new Blob(), { status: 500, statusText: 'Failed' });
    expect(c.error()).toBeTruthy();
    expect(c.busy()).toBeFalse();
    f.destroy();
  });
});
