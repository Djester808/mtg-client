import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { OracleSymbolsPipe } from './oracle-symbols.pipe';
import { KeywordLinkService } from '../services/keyword-link.service';

describe('OracleSymbolsPipe', () => {
  let pipe: OracleSymbolsPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    // The keyword terms come from the API now instead of a const array in the pipe, so
    // the spec has to hand the service its table before any link can be asserted.
    const keywords = TestBed.inject(KeywordLinkService);
    keywords.load().subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/rules/keyword-links')
      .flush([
        { match: 'Double Strike', keyword: 'Double Strike' },
        { match: 'Trample', keyword: 'Trample' },
        { match: 'Cascade', keyword: 'Cascade' },
        { match: 'Flying', keyword: 'Flying' },
      ]);

    pipe = new OracleSymbolsPipe(TestBed.inject(DomSanitizer), keywords);
  });

  function html(input: string | null | undefined): string {
    const result = pipe.transform(input);
    if (!result) return '';
    return (result as any).changingThisBreaksApplicationSecurity ?? String(result);
  }

  // ---- Null / empty -------------------------------------------

  it('returns empty string for null', () => expect(pipe.transform(null)).toBe(''));
  it('returns empty string for undefined', () => expect(pipe.transform(undefined)).toBe(''));
  it('returns empty string for empty string', () => expect(pipe.transform('')).toBe(''));

  // ---- Mana symbols -------------------------------------------

  it('converts {W} to white mana icon', () => {
    expect(html('{W}')).toContain('ms-w');
  });

  it('converts {U} to blue mana icon', () => {
    expect(html('{U}')).toContain('ms-u');
  });

  it('converts {B} to black mana icon', () => {
    expect(html('{B}')).toContain('ms-b');
  });

  it('converts {R} to red mana icon', () => {
    expect(html('{R}')).toContain('ms-r');
  });

  it('converts {G} to green mana icon', () => {
    expect(html('{G}')).toContain('ms-g');
  });

  it('converts {T} to tap icon', () => {
    expect(html('{T}')).toContain('ms-tap');
  });

  it('converts {C} to colorless icon', () => {
    expect(html('{C}')).toContain('ms-c');
  });

  it('converts numeric mana {3}', () => {
    expect(html('{3}')).toContain('ms-3');
  });

  it('converts {X} to X icon', () => {
    expect(html('{X}')).toContain('ms-x');
  });

  it('converts hybrid mana {W/U}', () => {
    expect(html('{W/U}')).toContain('ms-wu');
  });

  it('wraps each symbol in ms ms-cost ms-shadow classes', () => {
    const result = html('{W}');
    expect(result).toContain('class="ms ms-cost ms-shadow ms-w"');
  });

  // ---- Loyalty abilities --------------------------------------

  it('converts +1 loyalty ability to loyalty-up icon', () => {
    const result = html('+1: Do something.');
    expect(result).toContain('ms-loyalty-up');
    expect(result).toContain('ms-loyalty-1');
  });

  it('converts −2 loyalty ability (unicode minus) to loyalty-down icon', () => {
    const result = html('−2: Do something.');
    expect(result).toContain('ms-loyalty-down');
    expect(result).toContain('ms-loyalty-2');
  });

  it('converts -2 loyalty ability (hyphen minus) to loyalty-down icon', () => {
    const result = html('-2: Do something.');
    expect(result).toContain('ms-loyalty-down');
  });

  it('converts 0 loyalty ability to loyalty-zero icon', () => {
    const result = html('0: Do something.');
    expect(result).toContain('ms-loyalty-zero');
  });

  it('converts loyalty ability after <br> (mid-text)', () => {
    const result = html('First ability.\n+1: Draw a card.');
    expect(result).toContain('ms-loyalty-up');
  });

  // ---- Newlines -----------------------------------------------

  it('converts newlines to <br>', () => {
    expect(html('Line one\nLine two')).toContain('<br>');
  });

  // ---- Keyword links ------------------------------------------

  it('linkifies Flying keyword', () => {
    const result = html('Flying');
    expect(result).toContain('kw-link');
    expect(result).toContain('kw=Flying');
  });

  it('linkifies Trample keyword', () => {
    expect(html('Trample')).toContain('kw=Trample');
  });

  it('linkifies Double Strike (multi-word keyword)', () => {
    expect(html('Double Strike')).toContain('kw=Double%20Strike');
  });

  it('linkifies a keyword the old hardcoded list did not carry', () => {
    // The pipe used to know sixteen keywords copied from a C# enum; a card reading
    // "Cascade" got plain text.
    expect(html('Cascade')).toContain('kw=Cascade');
  });

  it('does not double-linkify keywords inside existing tags', () => {
    const input = '<a href="/kb?kw=Flying">Flying</a>';
    const result = html(input);
    // Should not contain nested <a> tags
    expect((result.match(/<a /g) ?? []).length).toBe(1);
  });

  // ---- HTML escaping ------------------------------------------

  it('escapes < and > in plain text', () => {
    const result = html('<b>bold</b>');
    expect(result).toContain('&lt;b&gt;');
    expect(result).not.toContain('<b>');
  });

  it('escapes & in plain text', () => {
    expect(html('A & B')).toContain('&amp;');
  });
});
