import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { KbComponent, groupKeywords, groupNumberOf } from './kb.component';
import {
  GlossaryResult,
  RuleGroup,
  RulesIndex,
  RulesSearchResult,
  KeywordDetail,
} from '../services/rules-api.service';

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
        number: 5,
        title: 'Turn Structure',
        groups: [
          { number: 506, title: 'Combat Phase: General', ruleCount: 6 },
          { number: 509, title: 'Declare Blockers Step', ruleCount: 8 },
        ],
      },
      {
        number: 7,
        title: 'Additional Rules',
        groups: [{ number: 702, title: 'Keyword Abilities', ruleCount: 195 }],
      },
    ],
    keywords: [
      { name: 'Cascade', category: 'Keyword Ability', ruleRef: '702.85' },
      { name: 'Flying', category: 'Keyword Ability', ruleRef: '702.9' },
      { name: 'Scry', category: 'Keyword Action', ruleRef: '701.18' },
      { name: 'Landfall', category: 'Ability Word', ruleRef: '207.2c' },
    ],
  };
}

function makeGroup(number = 509): RuleGroup {
  return {
    number,
    title: 'Declare Blockers Step',
    sectionNumber: 5,
    sectionTitle: 'Turn Structure',
    rules: [
      {
        number: `${number}.1`,
        text: 'First, the defending player declares blockers.',
        examples: ['A 2/2 blocks a 3/3.'],
        subrules: [
          {
            number: `${number}.1a`,
            text: 'The creature must be untapped.',
            examples: [],
            subrules: [],
          },
        ],
      },
    ],
  };
}

function makeKeyword(name = 'Flying'): KeywordDetail {
  return {
    name,
    category: 'Keyword Ability',
    ruleRef: '702.9',
    definition: 'A keyword ability that restricts how a creature can be blocked.',
    rules: [{ number: '702.9', text: name, examples: [], subrules: [] }],
  };
}

describe('KbComponent', () => {
  let fixture: ComponentFixture<KbComponent>;
  let component: KbComponent;
  let http: HttpTestingController;
  let queryParams: Record<string, string>;

  function setup(params: Record<string, string> = {}): void {
    queryParams = params;

    TestBed.configureTestingModule({
      imports: [KbComponent, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });

    fixture = TestBed.createComponent(KbComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  function flushIndex(): void {
    http.expectOne('/api/rules').flush(makeIndex());
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  // ---- Loading the document --------------------------------------

  describe('on load', () => {
    beforeEach(() => setup());

    it('shows a loading state before the index arrives', () => {
      expect(component.loading).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Loading the rules');

      flushIndex(); // Settle the in-flight request so afterEach's verify() is clean.
      expect(component.loading).toBe(false);
    });

    it('keeps the sections the document publishes', () => {
      flushIndex();

      expect(component.loading).toBe(false);
      expect(component.sections.length).toBe(2);
      expect(component.sections[0].groups[1].title).toBe('Declare Blockers Step');
    });

    it('reports which rules release it is showing', () => {
      flushIndex();
      expect(component.meta?.effectiveDate).toBe('August 7, 2026');
      expect(fixture.nativeElement.textContent).toContain('August 7, 2026');
    });

    it('groups keywords by the category the rules put them in', () => {
      flushIndex();

      expect(component.keywordGroups.map((g) => g.category)).toEqual([
        'Keyword Ability',
        'Keyword Action',
        'Ability Word',
      ]);
      expect(component.keywordGroups[0].keywords.length).toBe(2);
    });

    it('says so when the rules cannot be loaded', () => {
      http.expectOne('/api/rules').error(new ProgressEvent('offline'));
      fixture.detectChanges();

      expect(component.failed).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('could not be loaded');
    });
  });

  // ---- Nothing here reports on an implementation ------------------

  describe('content', () => {
    beforeEach(() => {
      setup();
      flushIndex();
    });

    it('shows no implementation status anywhere', () => {
      // The page used to badge every entry "implemented" / "partial" / "stub" and explain
      // which C# method enforced it. That described a rules engine that no longer exists,
      // and it was never what a rules reference is for.
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      for (const word of ['implemented', 'partial', 'stub', 'Phase 1', 'enum', 'engine']) {
        expect(text.toLowerCase()).not.toContain(word.toLowerCase());
      }
    });
  });

  // ---- Browsing ---------------------------------------------------

  describe('browsing', () => {
    beforeEach(() => {
      setup();
      flushIndex();
    });

    it('opens a rule group with its rules, subrules and examples', () => {
      component.selectGroup(509);
      http.expectOne('/api/rules/groups/509').flush(makeGroup());
      fixture.detectChanges();

      expect(component.selected?.kind).toBe('group');
      const text: string = fixture.nativeElement.textContent;
      expect(text).toContain('509.1');
      expect(text).toContain('509.1a');
      expect(text).toContain('A 2/2 blocks a 3/3.');
    });

    it('opens a keyword with its definition and defining rules', () => {
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());
      fixture.detectChanges();

      expect(component.selected?.kind).toBe('keyword');
      expect(fixture.nativeElement.textContent).toContain(
        'restricts how a creature can be blocked',
      );
    });

    it('loads the glossary the first time that tab is opened, and not again', () => {
      component.setTab('glossary');
      http
        .expectOne((r) => r.url === '/api/rules/glossary')
        .flush({
          total: 739,
          page: 1,
          pageSize: 50,
          entries: [{ term: 'Deathtouch', definition: 'A keyword ability.' }],
        } as GlossaryResult);

      expect(component.glossary.length).toBe(1);

      component.setTab('rules');
      component.setTab('glossary');
      http.expectNone((r) => r.url === '/api/rules/glossary');
    });

    it('appends the next glossary page rather than replacing the list', () => {
      component.setTab('glossary');
      http
        .expectOne((r) => r.url === '/api/rules/glossary')
        .flush({
          total: 739,
          page: 1,
          pageSize: 50,
          entries: [{ term: 'Ability', definition: 'x' }],
        } as GlossaryResult);

      component.loadMoreGlossary();
      http
        .expectOne((r) => r.url === '/api/rules/glossary')
        .flush({
          total: 739,
          page: 2,
          pageSize: 50,
          entries: [{ term: 'Banding', definition: 'y' }],
        } as GlossaryResult);

      expect(component.glossary.map((e) => e.term)).toEqual(['Ability', 'Banding']);
    });

    it('brings the selected row into view in a list hundreds of entries long', (done) => {
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('.sidebar-item.active') as HTMLElement;
      expect(row).withContext('the selected keyword must be marked in the list').toBeTruthy();

      const scrolled = spyOn(row, 'scrollIntoView');
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());
      fixture.detectChanges();

      // The scroll is deferred a tick: the row only exists after change detection runs.
      setTimeout(() => {
        expect(scrolled).toHaveBeenCalled();
        done();
      }, 20);
    });

    it('switches to the keywords tab when a keyword is opened', () => {
      component.setTab('rules');
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());

      expect(component.tab).toBe('keywords');
    });

    it('clears the selection so the phone can get back to the list', () => {
      component.selectKeyword('Flying');
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());

      component.clearSelection();
      expect(component.selected).toBeNull();
    });
  });

  // ---- Search -----------------------------------------------------

  describe('search', () => {
    beforeEach(() => {
      setup();
      flushIndex();
    });

    it('asks the server rather than filtering a local copy', () => {
      component.onSearch('deathtouch');

      const req = http.expectOne((r) => r.url === '/api/rules/search');
      expect(req.request.params.get('q')).toBe('deathtouch');
      req.flush({
        query: 'deathtouch',
        total: 1,
        page: 1,
        pageSize: 40,
        hits: [{ kind: 'keyword', ref: 'Deathtouch', title: 'Deathtouch', snippet: '…' }],
      } as RulesSearchResult);

      expect(component.searchHits.length).toBe(1);
      expect(component.searchTotal).toBe(1);
    });

    it('does not ask for a one-character query the server would reject', () => {
      component.onSearch('d');
      http.expectNone((r) => r.url === '/api/rules/search');
      expect(component.searchHits).toEqual([]);
    });

    it('cancels the superseded search rather than racing it', () => {
      component.onSearch('flying');
      const stale = http.expectOne((r) => r.url === '/api/rules/search');

      component.onSearch('trample');
      const current = http.expectOne(
        (r) => r.url === '/api/rules/search' && r.params.get('q') === 'trample',
      );

      // switchMap unsubscribes the first request, so it is not just discarded on
      // arrival — it never arrives. That is the guarantee a hand-written
      // "is this still the current query?" check in the subscribe could not give.
      expect(stale.cancelled).withContext('the superseded request must be cancelled').toBeTrue();

      current.flush({
        query: 'trample',
        total: 1,
        page: 1,
        pageSize: 40,
        hits: [{ kind: 'keyword', ref: 'Trample', title: 'Trample', snippet: '…' }],
      } as RulesSearchResult);

      expect(component.searchHits[0].ref).toBe('Trample');
      expect(component.searchTotal).toBe(1);
    });

    it('opens a rule hit inside the group it belongs to, and marks it', () => {
      component.openHit({
        kind: 'rule',
        ref: '509.1a',
        title: '509. Declare Blockers',
        snippet: '',
      });
      http.expectOne('/api/rules/groups/509').flush(makeGroup());

      expect(component.selected).toEqual(
        jasmine.objectContaining({ kind: 'group', highlight: '509.1a' }),
      );
    });

    it('opens a keyword hit directly', () => {
      component.openHit({ kind: 'keyword', ref: 'Flying', title: 'Flying', snippet: '' });
      http.expectOne('/api/rules/keywords/Flying').flush(makeKeyword());

      expect(component.selected?.kind).toBe('keyword');
    });

    it('opens a glossary hit by looking the term up', () => {
      component.openHit({ kind: 'glossary', ref: 'Deathtouch', title: 'Deathtouch', snippet: '' });
      http
        .expectOne((r) => r.url === '/api/rules/glossary')
        .flush({
          total: 1,
          page: 1,
          pageSize: 100,
          entries: [{ term: 'Deathtouch', definition: 'A keyword ability.' }],
        } as GlossaryResult);

      expect(component.selected?.kind).toBe('glossary');
    });
  });

  // ---- The link every card's rules text points at ------------------

  describe('deep links', () => {
    it('opens the keyword named by ?kw=', () => {
      setup({ kw: 'Cascade' });
      http.expectOne('/api/rules').flush(makeIndex());
      http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword('Cascade'));
      fixture.detectChanges();

      expect(component.tab).toBe('keywords');
      expect(component.selected?.kind).toBe('keyword');
    });

    it('opens the group holding the rule named by ?rule=', () => {
      setup({ rule: '509.1a' });
      http.expectOne('/api/rules').flush(makeIndex());
      http.expectOne('/api/rules/groups/509').flush(makeGroup());

      expect(component.selected).toEqual(
        jasmine.objectContaining({ kind: 'group', highlight: '509.1a' }),
      );
    });

    it('opens the group named by ?group=', () => {
      setup({ group: '702' });
      http.expectOne('/api/rules').flush(makeIndex());
      http.expectOne('/api/rules/groups/702').flush(makeGroup(702));

      expect(component.selected?.kind).toBe('group');
    });

    it('ignores a ?group= that is not a rule group number', () => {
      setup({ group: 'nonsense' });
      http.expectOne('/api/rules').flush(makeIndex());

      expect(component.selected).toBeNull();
    });
  });
});

describe('KbComponent recovery and back', () => {
  it('retries a failed load instead of dead-ending', () => {
    // The failure this recovers from is usually "the API is not up yet".
    TestBed.configureTestingModule({
      imports: [KbComponent, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(KbComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/rules').error(new ProgressEvent('offline'));
    fixture.detectChanges();
    expect(component.failed).toBeTrue();

    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('.kb-retry');
    expect(retry).withContext('a way out that is not a page reload').not.toBeNull();

    retry.click();
    http.expectOne('/api/rules').flush(makeIndex());
    fixture.detectChanges();

    expect(component.failed).toBeFalse();
    expect(component.sections.length).toBe(2);
    http.verify();
  });

  function setupWithHistory(navigationId: number) {
    const location = jasmine.createSpyObj('Location', ['back', 'getState']);
    location.getState.and.returnValue({ navigationId });
    const router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [KbComponent, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: router },
        { provide: Location, useValue: location },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(KbComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/rules').flush(makeIndex());
    fixture.detectChanges();

    return { fixture, location, router, http };
  }

  it('goes back to where the reader came from', () => {
    // Hardcoding '/' put anyone arriving from a card on the home page instead of back.
    const { fixture, location, router, http } = setupWithHistory(4);

    fixture.componentInstance.back();

    expect(location.back).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    http.verify();
  });

  it('falls back to home when nothing is behind it', () => {
    const { fixture, location, router, http } = setupWithHistory(1);

    fixture.componentInstance.back();

    expect(location.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
    http.verify();
  });
});

describe('kb helpers', () => {
  it('reads the group number off a rule reference', () => {
    expect(groupNumberOf('702.9')).toBe(702);
    expect(groupNumberOf('509.1a')).toBe(509);
  });

  it('drops a category with no keywords rather than showing an empty heading', () => {
    const grouped = groupKeywords([
      { name: 'Flying', category: 'Keyword Ability', ruleRef: '702.9' },
    ]);

    expect(grouped.length).toBe(1);
    expect(grouped[0].category).toBe('Keyword Ability');
  });
});
