import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

/**
 * The rules knowledge base: the Comprehensive Rules as published.
 *
 * The shapes below mirror `MtgEngine.Api/Dtos/RulesDtos.cs`, which is the contract's
 * definition. Note what is *not* here any more: the old knowledge base carried a
 * `status` of 'implemented' | 'partial' | 'stub' on every entry, because it described a
 * rules engine rather than the rules. There is no engine, and a reference that reports on
 * some other component's coverage answers a question nobody browsing the rules is asking.
 */

export interface RulesMeta {
  title: string;
  effectiveDate: string;
  sectionCount: number;
  groupCount: number;
  ruleCount: number;
  keywordCount: number;
  glossaryCount: number;
}

export interface RuleGroupSummary {
  number: number;
  title: string;
  ruleCount: number;
}

export interface RuleSection {
  number: number;
  title: string;
  groups: RuleGroupSummary[];
}

export interface Rule {
  number: string;
  text: string;
  examples: string[];
  subrules: Rule[];
}

export interface RuleGroup {
  number: number;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  rules: Rule[];
}

/** How the navigation lists a keyword. The definition arrives with the detail. */
export interface KeywordSummary {
  name: string;
  category: KeywordCategory;
  ruleRef: string;
}

export type KeywordCategory = 'Keyword Ability' | 'Keyword Action' | 'Ability Word';

export interface Keyword extends KeywordSummary {
  definition: string;
}

export interface KeywordDetail extends Keyword {
  rules: Rule[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface GlossaryResult {
  total: number;
  page: number;
  pageSize: number;
  entries: GlossaryEntry[];
}

export interface RulesIndex {
  meta: RulesMeta;
  sections: RuleSection[];
  keywords: KeywordSummary[];
}

export type RulesSearchKind = 'rule' | 'keyword' | 'glossary';

export interface RulesSearchHit {
  kind: RulesSearchKind;
  ref: string;
  title: string;
  snippet: string;
}

export interface RulesSearchResult {
  query: string;
  total: number;
  page: number;
  pageSize: number;
  hits: RulesSearchHit[];
}

/** One string to match inside card text, and the keyword entry it opens. */
export interface KeywordLink {
  match: string;
  keyword: string;
}

@Injectable({ providedIn: 'root' })
export class RulesApiService {
  /**
   * The rules never change between deploys, so the index and the link table are fetched
   * once per session and replayed. Everything else is small and on demand.
   */
  private index$?: Observable<RulesIndex>;
  private keywordLinks$?: Observable<KeywordLink[]>;

  constructor(private http: HttpClient) {}

  index(): Observable<RulesIndex> {
    this.index$ ??= this.cacheOnce(this.http.get<RulesIndex>('/api/rules'), () => {
      this.index$ = undefined;
    });
    return this.index$;
  }

  keywordLinks(): Observable<KeywordLink[]> {
    this.keywordLinks$ ??= this.cacheOnce(
      this.http.get<KeywordLink[]>('/api/rules/keyword-links'),
      () => {
        this.keywordLinks$ = undefined;
      },
    );
    return this.keywordLinks$;
  }

  /**
   * Replays a successful response to every later caller, but does **not** cache a
   * failure.
   *
   * `shareReplay(1)` on its own remembers the error too, and replays it to everyone who
   * subscribes afterwards. That turns one failed request into a permanently broken
   * knowledge base: the service is root-provided, so bringing the API back up and
   * navigating to /kb again would still show "the rules could not be loaded" until the
   * whole app was reloaded. Dropping the cached observable on error means the next
   * caller issues a fresh request.
   */
  private cacheOnce<T>(request: Observable<T>, forget: () => void): Observable<T> {
    return request.pipe(
      catchError((err) => {
        forget();
        return throwError(() => err);
      }),
      shareReplay(1),
    );
  }

  group(number: number): Observable<RuleGroup> {
    return this.http.get<RuleGroup>(`/api/rules/groups/${number}`);
  }

  rule(number: string): Observable<Rule> {
    return this.http.get<Rule>(`/api/rules/rules/${encodeURIComponent(number)}`);
  }

  keyword(name: string): Observable<KeywordDetail> {
    return this.http.get<KeywordDetail>(`/api/rules/keywords/${encodeURIComponent(name)}`);
  }

  glossary(query: string, page: number, pageSize = 50): Observable<GlossaryResult> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (query) {
      params = params.set('q', query);
    }
    return this.http.get<GlossaryResult>('/api/rules/glossary', { params });
  }

  search(query: string, page = 1, pageSize = 40): Observable<RulesSearchResult> {
    const params = new HttpParams().set('q', query).set('page', page).set('pageSize', pageSize);
    return this.http.get<RulesSearchResult>('/api/rules/search', { params });
  }
}
