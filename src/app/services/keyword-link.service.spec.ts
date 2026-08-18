import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { KeywordLinkService } from './keyword-link.service';
import { KeywordLink } from './rules-api.service';

/** The server orders longest first; these fixtures keep that order. */
const LINKS: KeywordLink[] = [
  { match: 'Start Your Engines!', keyword: 'Start Your Engines!' },
  { match: 'Cumulative Upkeep', keyword: 'Cumulative Upkeep' },
  { match: 'For Mirrodin!', keyword: 'For Mirrodin!' },
  { match: 'Double Strike', keyword: 'Double Strike' },
  { match: 'Nightbound', keyword: 'Daybound and Nightbound' },
  { match: 'Flashback', keyword: 'Flashback' },
  { match: 'Daybound', keyword: 'Daybound and Nightbound' },
  { match: 'Landfall', keyword: 'Landfall' },
  { match: 'Cascade', keyword: 'Cascade' },
  { match: 'Flying', keyword: 'Flying' },
  { match: 'Flash', keyword: 'Flash' },
];

describe('KeywordLinkService', () => {
  let service: KeywordLinkService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(KeywordLinkService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(links: KeywordLink[] = LINKS): void {
    service.load().subscribe();
    http.expectOne('/api/rules/keyword-links').flush(links);
  }

  // ---- Before the table arrives ----------------------------------

  it('is not ready until the terms are loaded', () => {
    expect(service.ready).toBe(false);
  });

  it('returns card text untouched before the terms are loaded', () => {
    // Links are an enhancement. A slow or missing API must cost the link, not the text.
    expect(service.linkify('Flying, trample')).toBe('Flying, trample');
  });

  it('reports failure and still renders text when the request fails', () => {
    let ok: boolean | undefined;
    service.load().subscribe((r) => (ok = r));
    http.expectOne('/api/rules/keyword-links').error(new ProgressEvent('offline'));

    expect(ok).toBe(false);
    expect(service.linkify('Flying')).toBe('Flying');
  });

  // ---- Linking ---------------------------------------------------

  it('links a keyword to its knowledge base entry', () => {
    load();
    const html = service.linkify('Flying');

    expect(html).toContain('href="/kb?kw=Flying"');
    expect(html).toContain('class="kw-link"');
    expect(html).toContain('>Flying</a>');
  });

  it('does not send the reader to a new tab', () => {
    // target="_blank" opened a second tab with no history, so the knowledge base's back
    // control had nowhere to return to and the card was left behind. The sheet
    // intercepts the click now, and a packaged build has no tab to open anyway.
    load();
    const html = service.linkify('Flying');

    expect(html).not.toContain('target=');
    expect(html).toContain('href="/kb?kw=Flying"');
  });

  it('links keywords the old hardcoded list did not know about', () => {
    load();

    expect(service.linkify('Cascade')).toContain('kw=Cascade');
    expect(service.linkify('Landfall — Whenever a land enters')).toContain('kw=Landfall');
    expect(service.linkify('Cumulative Upkeep {1}')).toContain('kw=Cumulative%20Upkeep');
  });

  it('links a keyword whose name ends in punctuation', () => {
    // A trailing \b after "!" demands a word character next, so these never matched.
    load();

    expect(service.linkify('For Mirrodin!')).toContain('kw=For%20Mirrodin!');
    expect(service.linkify('Start Your Engines!')).toContain('kw=Start%20Your%20Engines!');
  });

  it('matches regardless of case, because card text lower-cases keywords in a list', () => {
    load();
    expect(service.linkify('flying, vigilance')).toContain('kw=Flying');
  });

  it('keeps the text as printed inside the link', () => {
    load();
    expect(service.linkify('flying')).toContain('>flying</a>');
  });

  it('prefers the longer keyword when one contains another', () => {
    load();
    const html = service.linkify('Flashback {2}{R}');

    expect(html).toContain('kw=Flashback');
    expect(html).toContain('>Flashback</a>');
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });

  it('points both halves of a two-keyword rule at the one entry', () => {
    load();

    expect(service.linkify('Daybound')).toContain('kw=Daybound%20and%20Nightbound');
    expect(service.linkify('Nightbound')).toContain('kw=Daybound%20and%20Nightbound');
  });

  it('matches a multi-word keyword through any run of whitespace', () => {
    load();
    expect(service.linkify('Double  Strike')).toContain('kw=Double%20Strike');
  });

  it('does not rewrite the inside of an existing tag', () => {
    load();
    const html = service.linkify('<i class="ms ms-cost"></i> Flying');

    expect(html).toContain('<i class="ms ms-cost"></i>');
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });

  it('does not match a keyword that is part of a longer word', () => {
    load();
    expect(service.linkify('Flyingsaucer')).toBe('Flyingsaucer');
  });

  it('links every occurrence, not just the first', () => {
    load();
    const html = service.linkify('Flying. Cascade. Flying.');

    expect((html.match(/<a /g) ?? []).length).toBe(3);
  });

  it('links consistently across repeated calls', () => {
    // A global regex keeps lastIndex between calls; without a reset the second card's
    // text would be matched from wherever the first one stopped.
    load();
    const first = service.linkify('Flying');
    const second = service.linkify('Flying');

    expect(second).toBe(first);
  });

  it('is ready once the terms are loaded', () => {
    load();
    expect(service.ready).toBe(true);
  });

  it('stays inert when the server sends an empty table', () => {
    load([]);

    expect(service.ready).toBe(false);
    expect(service.linkify('Flying')).toBe('Flying');
  });
});
