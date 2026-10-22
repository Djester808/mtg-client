import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CardCommunityComponent } from '../components/card-community/card-community.component';
import { CardCommunityService } from './card-community.service';
import { ExploreEntry, ExplorePage } from './explore-api.service';
import { makeCard } from '../testing/test-factories';
const entry = (id: string, kind = 'card'): ExploreEntry => ({
  kind,
  name: id,
  card: makeCard({ oracleId: id }),
  decks: 40,
  potential: 80,
  inclusion: 0.5,
  synergy: 0.25,
  trend: null,
  quantity: 1,
});
const page = (cards: ExploreEntry[] = [], available = true): ExplorePage => ({
  charts: [],
  hasPage: available,
  source: 'EDHREC',
  fetchedAt: '2026-10-21',
  kind: 'card',
  subject: makeCard({ oracleId: 'card' }),
  variant: '',
  deckCount: 100,
  potentialDecks: 200,
  rank: null,
  salt: null,
  sections: [{ tag: 'list', title: 'Cards', cards }],
  variants: [],
  similar: [],
  commanders: [],
});
describe('Embedded card community', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CardCommunityComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('shows measured global/context usage, correct commander links, and reuses completed pages', () => {
    const f = TestBed.createComponent(CardCommunityComponent);
    f.componentRef.setInput('oracleId', 'card');
    f.componentRef.setInput('commanderOracleId', 'leader');
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/explore/cards/card')
      .flush(page([entry('leader', 'commander'), entry('ordinary')]));
    http.expectOne((r) => r.url === '/api/explore/commanders/leader').flush(page([entry('card')]));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('50% of eligible decks');
    expect(f.nativeElement.textContent).toContain('25% synergy');
    expect(f.nativeElement.querySelector('li a').getAttribute('href')).toContain(
      '/explore/commanders/leader',
    );
    TestBed.inject(CardCommunityService)
      .load('card', 'leader')
      .subscribe((data) => expect(data.commanders.length).toBe(1));
    http.expectNone((r) => r.url.startsWith('/api/explore'));
    f.destroy();
  });
  it('keeps context data when global data fails, and retries without inventing zeros', () => {
    const f = TestBed.createComponent(CardCommunityComponent);
    f.componentRef.setInput('oracleId', 'card');
    f.componentRef.setInput('commanderOracleId', 'leader');
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/explore/cards/card')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    http.expectOne((r) => r.url === '/api/explore/commanders/leader').flush(page([entry('card')]));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('25% synergy');
    expect(f.nativeElement.textContent).toContain('could not be loaded');
    f.componentInstance.retry();
    http.expectOne((r) => r.url === '/api/explore/cards/card').flush(page([], false));
    http.expectOne((r) => r.url === '/api/explore/commanders/leader').flush(page([], false));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No community page');
    f.destroy();
  });
  it('cancels old card requests when the modal changes cards', () => {
    const f = TestBed.createComponent(CardCommunityComponent);
    f.componentRef.setInput('oracleId', 'old');
    f.detectChanges();
    const old = http.expectOne((r) => r.url === '/api/explore/cards/old');
    f.componentRef.setInput('oracleId', 'new');
    f.detectChanges();
    expect(old.cancelled).toBeTrue();
    http.expectOne((r) => r.url === '/api/explore/cards/new').flush(page([], false));
    f.destroy();
  });
});
