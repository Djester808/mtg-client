import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RulesApiService, RulesIndex } from './rules-api.service';

function makeIndex(): RulesIndex {
  return {
    meta: {
      title: 'Magic: The Gathering Comprehensive Rules',
      effectiveDate: 'August 7, 2026',
      sectionCount: 9,
      groupCount: 147,
      ruleCount: 3162,
      keywordCount: 324,
      glossaryCount: 739,
    },
    sections: [
      {
        number: 7,
        title: 'Additional Rules',
        groups: [{ number: 702, title: 'Keyword Abilities', ruleCount: 195 }],
      },
    ],
    keywords: [{ name: 'Flying', category: 'Keyword Ability', ruleRef: '702.9' }],
  };
}

describe('RulesApiService', () => {
  let service: RulesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(RulesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the index from /api/rules', () => {
    const index = makeIndex();
    let received: RulesIndex | undefined;

    service.index().subscribe((r) => (received = r));
    http.expectOne('/api/rules').flush(index);

    expect(received?.meta.ruleCount).toBe(3162);
    expect(received?.keywords[0].name).toBe('Flying');
  });

  it('fetches the index once however many callers ask for it', () => {
    // The rules cannot change between deploys, so a second subscriber must not cost a
    // second round trip — the KB page subscribes on every navigation to /kb.
    service.index().subscribe();
    service.index().subscribe();

    const req = http.expectOne('/api/rules');
    expect(req.request.method).toBe('GET');
    req.flush(makeIndex());
  });

  it('does not remember a failure, so a later caller can succeed', () => {
    // shareReplay(1) caches the error as well as the value. The service is root-provided,
    // so one failed request used to leave the knowledge base broken for the rest of the
    // session — bringing the API back up and navigating to /kb again still showed "the
    // rules could not be loaded" until the whole app was reloaded.
    let firstFailed = false;
    service.index().subscribe({ error: () => (firstFailed = true) });
    http.expectOne('/api/rules').error(new ProgressEvent('offline'));
    expect(firstFailed).toBeTrue();

    let second: RulesIndex | undefined;
    service.index().subscribe((r) => (second = r));
    http.expectOne('/api/rules').flush(makeIndex());

    expect(second?.meta.ruleCount).toBe(3162);
  });

  it('does not remember a failed keyword link table either', () => {
    service.keywordLinks().subscribe({ error: () => undefined });
    http.expectOne('/api/rules/keyword-links').error(new ProgressEvent('offline'));

    let links: unknown[] | undefined;
    service.keywordLinks().subscribe((l) => (links = l));
    http.expectOne('/api/rules/keyword-links').flush([{ match: 'Flying', keyword: 'Flying' }]);

    expect(links?.length).toBe(1);
  });

  it('fetches the keyword link table once', () => {
    service.keywordLinks().subscribe();
    service.keywordLinks().subscribe();

    const req = http.expectOne('/api/rules/keyword-links');
    expect(req.request.method).toBe('GET');
    req.flush([{ match: 'Flying', keyword: 'Flying' }]);
  });

  it('requests a rule group by number', () => {
    let title: string | undefined;
    service.group(702).subscribe((g) => (title = g.title));
    http.expectOne('/api/rules/groups/702').flush({
      number: 702,
      title: 'Keyword Abilities',
      sectionNumber: 7,
      sectionTitle: 'Additional Rules',
      rules: [],
    });

    expect(title).toBe('Keyword Abilities');
  });

  it('encodes a keyword name so punctuation survives the URL', () => {
    // "For Mirrodin!" and "Start Your Engines!" are real keyword names.
    let name: string | undefined;
    service.keyword('For Mirrodin!').subscribe((k) => (name = k.name));
    http.expectOne('/api/rules/keywords/For%20Mirrodin!').flush({
      name: 'For Mirrodin!',
      category: 'Keyword Ability',
      ruleRef: '702.161',
      definition: 'A keyword ability.',
      rules: [],
    });

    expect(name).toBe('For Mirrodin!');
  });

  it('encodes a rule number so a subrule reference survives the URL', () => {
    let number: string | undefined;
    service.rule('702.9a').subscribe((r) => (number = r.number));
    http
      .expectOne('/api/rules/rules/702.9a')
      .flush({ number: '702.9a', text: '', examples: [], subrules: [] });

    expect(number).toBe('702.9a');
  });

  it('sends paging for the glossary and omits an empty filter', () => {
    service.glossary('', 2).subscribe();

    const req = http.expectOne((r) => r.url === '/api/rules/glossary');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ total: 0, page: 2, pageSize: 50, entries: [] });
  });

  it('sends the filter when the glossary is searched', () => {
    service.glossary('deathtouch', 1).subscribe();

    const req = http.expectOne((r) => r.url === '/api/rules/glossary');
    expect(req.request.params.get('q')).toBe('deathtouch');
    req.flush({ total: 1, page: 1, pageSize: 50, entries: [] });
  });

  it('sends the query and paging for search', () => {
    service.search('legend rule', 3, 10).subscribe();

    const req = http.expectOne((r) => r.url === '/api/rules/search');
    expect(req.request.params.get('q')).toBe('legend rule');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ query: 'legend rule', total: 0, page: 3, pageSize: 10, hits: [] });
  });
});
