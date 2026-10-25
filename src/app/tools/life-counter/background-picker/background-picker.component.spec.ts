import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BackgroundPickerComponent, ChosenArt } from './background-picker.component';
import { selectIsLoggedIn } from '../../../store/auth/auth.selectors';

/**
 * Choosing what sits behind a player.
 *
 * The split that matters: card art comes from `/api/cards`, which is authorized, so a table
 * of guests must still be able to set a backdrop from the device.
 */
describe('BackgroundPickerComponent', () => {
  let fixture: ComponentFixture<BackgroundPickerComponent>;
  let component: BackgroundPickerComponent;
  let http: HttpTestingController;
  let store: MockStore;
  let chosen: (ChosenArt | null)[];

  const card = (name: string) => ({ name, imageUriArtCrop: `https://img/${name}.jpg` });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, BackgroundPickerComponent],
      providers: [provideMockStore({ selectors: [{ selector: selectIsLoggedIn, value: true }] })],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MockStore);

    fixture = TestBed.createComponent(BackgroundPickerComponent);
    component = fixture.componentInstance;

    chosen = [];
    component.chosen.subscribe((c) => chosen.push(c));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('searches cards once the typing settles', fakeAsync(() => {
    component.onQuery('ashaya');
    tick(400);

    const req = http.expectOne((r) => r.url === '/api/cards/search');
    expect(req.request.params.get('q')).toBe('ashaya');
    req.flush([card('Ashaya, Soul of the Wild')]);

    expect(component.results.length).toBe(1);
  }));

  it('does not search on one character', fakeAsync(() => {
    component.onQuery('a');
    tick(400);

    http.expectNone((r) => r.url === '/api/cards/search');
    expect(component.results).toEqual([]);
  }));

  it('abandons a query the moment a newer one is typed', fakeAsync(() => {
    component.onQuery('sol');
    tick(400);
    const first = http.expectOne((r) => r.url === '/api/cards/search');

    component.onQuery('sol ring');
    tick(400);
    const second = http.expectOne((r) => r.url === '/api/cards/search');

    // switchMap, not mergeMap: the older request is cancelled outright, so a slow answer for
    // "sol" can never land on top of the results for "sol ring".
    expect(first.cancelled).toBeTrue();

    second.flush([card('Sol Ring')]);
    expect(component.results.map((c) => c.name)).toEqual(['Sol Ring']);
  }));

  it('hands back the art crop and the card name', fakeAsync(() => {
    component.onQuery('ashaya');
    tick(400);
    http.expectOne((r) => r.url === '/api/cards/search').flush([card('Ashaya, Soul of the Wild')]);

    component.chooseCard(component.results[0]);

    expect(chosen).toEqual([
      {
        url: 'https://img/Ashaya, Soul of the Wild.jpg',
        source: 'card',
        label: 'Ashaya, Soul of the Wild',
      },
    ]);
  }));

  it('says so when the search fails instead of showing an empty list', fakeAsync(() => {
    component.onQuery('ashaya');
    tick(400);
    http
      .expectOne((r) => r.url === '/api/cards/search')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.error).toBe('Card search is not answering.');
  }));

  it('emits null to clear a backdrop', () => {
    component.clear();
    expect(chosen).toEqual([null]);
  });

  it('offers the device even with no account, and hides card search', () => {
    store.overrideSelector(selectIsLoggedIn, false);
    store.refreshState();
    fixture.detectChanges();

    expect(component.canSearchCards()).toBeFalse();
    // The upload control is unconditional: it needs no account and no network.
    expect(fixture.nativeElement.querySelector('.upload')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-search-input')).toBeNull();
  });

  it('reports a picture that could not be read, and clears the input either way', async () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['not an image'], 'notes.txt', { type: 'text/plain' })],
    });

    await component.onFile({ target: input } as unknown as Event);

    expect(component.error).toBe('Choose an image file.');
    expect(chosen).toEqual([]);
    // Cleared so choosing the same file again still fires a change event.
    expect(input.value).toBe('');
  });
  it('can search again after a failed request, including the same query', fakeAsync(() => {
    component.onQuery('sol');
    tick(300);
    http
      .expectOne((r) => r.url === '/api/cards/search')
      .flush(null, { status: 500, statusText: 'Error' });
    component.onQuery('sol');
    tick(300);
    http.expectOne((r) => r.url === '/api/cards/search').flush([card('Sol Ring')]);
    expect(component.error).toBeNull();
    expect(component.results[0].name).toBe('Sol Ring');
  }));

  it('clearing the query immediately cancels the pending search', fakeAsync(() => {
    component.onQuery('sol');
    tick(300);
    const request = http.expectOne((r) => r.url === '/api/cards/search');
    component.onQuery('');
    expect(request.cancelled).toBeTrue();
    expect(component.results).toEqual([]);
    expect(component.searched).toBeFalse();
    tick(300);
    http.expectNone((r) => r.url === '/api/cards/search');
  }));
});
