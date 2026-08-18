import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  NgZone,
  ViewChild,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { SearchInputComponent } from '../components/search-input/search-input.component';
import { RuleBlockComponent } from '../components/rule-block/rule-block.component';
import {
  GlossaryEntry,
  KeywordCategory,
  KeywordDetail,
  KeywordSummary,
  RuleGroup,
  RuleSection,
  RulesApiService,
  RulesMeta,
  RulesSearchHit,
} from '../services/rules-api.service';

/** Which list the sidebar is showing when nothing has been searched for. */
export type KbTab = 'rules' | 'keywords' | 'glossary';

export type KbSelection =
  | { kind: 'group'; group: RuleGroup; highlight: string | null }
  | { kind: 'keyword'; keyword: KeywordDetail }
  | { kind: 'glossary'; entry: GlossaryEntry };

/** Keywords are shown under their rules category, in the order the rules introduce them. */
export const KEYWORD_CATEGORIES: KeywordCategory[] = [
  'Keyword Ability',
  'Keyword Action',
  'Ability Word',
];

export interface KeywordCategoryGroup {
  category: KeywordCategory;
  keywords: KeywordSummary[];
}

/**
 * The rules knowledge base.
 *
 * What changed: this page used to render one hardcoded document — sixteen keywords, a
 * handful of "mechanics" describing engine internals, and eight state-based actions, each
 * with an implementation-status badge. It now browses the Comprehensive Rules themselves,
 * so the content is three lists (rules by section, every keyword, the glossary) plus
 * server-side search across all of them.
 *
 * There are no computing getters here on purpose: every list the template binds is a
 * field, recomputed only when its data actually arrives. A getter that filters or groups
 * runs on every change-detection pass, and this page binds several thousand rules.
 */
@Component({
  selector: 'app-kb',
  standalone: true,
  imports: [CommonModule, SearchInputComponent, RuleBlockComponent],
  templateUrl: './kb.component.html',
  styleUrls: ['./kb.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KbComponent implements OnInit {
  @ViewChild('sidebar') sidebarRef?: ElementRef<HTMLElement>;

  meta: RulesMeta | null = null;
  sections: RuleSection[] = [];
  keywordGroups: KeywordCategoryGroup[] = [];

  glossary: GlossaryEntry[] = [];
  glossaryTotal = 0;
  private glossaryPage = 0;

  tab: KbTab = 'rules';
  selected: KbSelection | null = null;

  searchQuery = '';
  /**
   * Latest-wins, by the operator rather than by hand. This was a manual
   * `if (result.query !== this.searchQuery) return;` in the subscribe, which is the same
   * idea written out longhand — and it leaves the superseded request running. The repo's
   * own standard names switchMap for exactly this.
   */
  private readonly searches = new Subject<string>();
  searchHits: RulesSearchHit[] = [];
  searchTotal = 0;
  searching = false;

  loading = true;
  failed = false;

  constructor(
    private api: RulesApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.searches.pipe(switchMap((q) => this.api.search(q))).subscribe({
      next: (result) => {
        this.searchHits = result.hits;
        this.searchTotal = result.total;
        this.searching = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.searchHits = [];
        this.searchTotal = 0;
        this.searching = false;
        this.cdr.markForCheck();
      },
    });

    this.load();
  }

  /**
   * Retries after a failed load, without a page reload.
   *
   * The failure this recovers from is usually "the API is not up yet", which resolves on
   * its own moments later — and before this the only way out was reloading the whole
   * app, because the service used to cache the failure as well as the success.
   */
  retry(): void {
    this.failed = false;
    this.loading = true;
    this.cdr.markForCheck();
    this.load();
  }

  private load(): void {
    this.api.index().subscribe({
      next: (index) => {
        this.meta = index.meta;
        this.sections = index.sections;
        this.keywordGroups = groupKeywords(index.keywords);
        this.loading = false;
        this.openFromRoute();
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  // ---- Navigation ------------------------------------------------

  setTab(tab: KbTab): void {
    this.tab = tab;
    if (tab === 'glossary' && !this.glossary.length) {
      this.loadMoreGlossary();
    }
    this.cdr.markForCheck();
  }

  selectGroup(number: number, highlight: string | null = null): void {
    this.api.group(number).subscribe({
      next: (group) => {
        this.selected = { kind: 'group', group, highlight };
        this.cdr.markForCheck();
        this.revealSelection();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  selectKeyword(name: string): void {
    this.api.keyword(name).subscribe({
      next: (keyword) => {
        this.tab = 'keywords';
        this.selected = { kind: 'keyword', keyword };
        this.cdr.markForCheck();
        this.revealSelection();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  /**
   * Brings the selected row into the sidebar's viewport.
   *
   * Arriving on `/kb?kw=Landfall` selects a row 150 entries down a 324-entry list, and
   * without this the list sits at "Absorb" with the selection off-screen — which reads as
   * nothing being selected at all. Deferred because the row only exists after the next
   * change-detection pass, and run outside Angular because scrolling changes no state.
   */
  private revealSelection(): void {
    this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.sidebarRef?.nativeElement
          .querySelector('.sidebar-item.active')
          ?.scrollIntoView({ block: 'nearest' });
      }),
    );
  }

  selectGlossaryEntry(entry: GlossaryEntry): void {
    this.selected = { kind: 'glossary', entry };
    this.cdr.markForCheck();
  }

  /** Opens whatever a search hit points at, whichever list it came from. */
  openHit(hit: RulesSearchHit): void {
    if (hit.kind === 'keyword') {
      this.selectKeyword(hit.ref);
      return;
    }
    if (hit.kind === 'glossary') {
      this.api.glossary(hit.ref, 1, 100).subscribe({
        next: (result) => {
          const entry = result.entries.find((e) => e.term === hit.ref) ?? result.entries[0];
          if (entry) {
            this.selected = { kind: 'glossary', entry };
          }
          this.cdr.markForCheck();
        },
        error: () => this.cdr.markForCheck(),
      });
      return;
    }

    // A rule reads in the context of the group it belongs to, so open the group and mark
    // the rule inside it rather than showing one numbered paragraph on its own.
    this.selectGroup(groupNumberOf(hit.ref), hit.ref);
  }

  /**
   * Back to the list. Only reachable below $bp-nav, where the sidebar and the detail
   * share one column and selecting an entry replaces the list rather than sitting
   * beside it.
   */
  clearSelection(): void {
    this.selected = null;
    this.cdr.markForCheck();
  }

  /**
   * Returns where the reader came from, rather than always to the home page.
   *
   * Hardcoding '/' meant arriving here from anywhere — a card, a deck, a forum post —
   * and being put on the home page instead of back. Home is still the fallback, for a
   * tab opened straight onto /kb with nothing behind it.
   */
  back(): void {
    // Angular's Location has no canGoBack(). The router stamps an incrementing
    // navigationId into history state, so anything above 1 means this tab has an
    // in-app page behind it; 1 means it was opened straight onto /kb.
    const state = this.location.getState() as { navigationId?: number } | null;
    if ((state?.navigationId ?? 1) > 1) {
      this.location.back();
      return;
    }

    this.router.navigate(['/']);
  }

  // ---- Search ----------------------------------------------------

  onSearch(query: string): void {
    this.searchQuery = query;
    const trimmed = query.trim();

    // The server requires two characters; below that there is nothing worth asking for.
    if (trimmed.length < 2) {
      this.searchHits = [];
      this.searchTotal = 0;
      this.searching = false;
      this.cdr.markForCheck();
      return;
    }

    this.searching = true;
    this.cdr.markForCheck();
    this.searches.next(trimmed);
  }

  // ---- Glossary paging -------------------------------------------

  loadMoreGlossary(): void {
    const next = this.glossaryPage + 1;
    this.api.glossary('', next).subscribe({
      next: (result) => {
        this.glossaryPage = next;
        this.glossary = [...this.glossary, ...result.entries];
        this.glossaryTotal = result.total;
        this.cdr.markForCheck();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  // ---- Template helpers (cheap: no allocation, no iteration) ------

  isKeywordSelected(name: string): boolean {
    return this.selected?.kind === 'keyword' && this.selected.keyword.name === name;
  }

  isGroupSelected(number: number): boolean {
    return this.selected?.kind === 'group' && this.selected.group.number === number;
  }

  isTermSelected(term: string): boolean {
    return this.selected?.kind === 'glossary' && this.selected.entry.term === term;
  }

  trackByGroup(_: number, group: { number: number }): number {
    return group.number;
  }

  trackByName(_: number, item: { name: string }): string {
    return item.name;
  }

  trackByTerm(_: number, entry: GlossaryEntry): string {
    return entry.term;
  }

  trackByRef(_: number, hit: RulesSearchHit): string {
    return `${hit.kind}:${hit.ref}`;
  }

  trackByNumber(_: number, rule: { number: string }): string {
    return rule.number;
  }

  /** `/kb?kw=Flying`, the link every card's rules text points at. */
  private openFromRoute(): void {
    const params = this.route.snapshot.queryParamMap;

    const keyword = params.get('kw');
    if (keyword) {
      this.selectKeyword(keyword); // switches to the keywords tab itself
      return;
    }

    const rule = params.get('rule');
    if (rule) {
      this.selectGroup(groupNumberOf(rule), rule);
      return;
    }

    const group = params.get('group');
    if (group && /^\d{3}$/.test(group)) {
      this.selectGroup(Number(group));
    }
  }
}

/** "702.9a" belongs to group 702. */
export function groupNumberOf(ruleNumber: string): number {
  return Number(ruleNumber.split('.')[0]);
}

export function groupKeywords(keywords: KeywordSummary[]): KeywordCategoryGroup[] {
  return KEYWORD_CATEGORIES.map((category) => ({
    category,
    keywords: keywords.filter((k) => k.category === category),
  })).filter((g) => g.keywords.length > 0);
}
