import { Injectable } from '@angular/core';
import { catchError, map, of, tap } from 'rxjs';
import { KeywordLink, RulesApiService } from './rules-api.service';
import { escapeRegExp } from '../utils/regex.utils';

/**
 * Turns the keywords in a card's rules text into links to the knowledge base.
 *
 * The list of terms comes from the server, which derives it from the Comprehensive Rules.
 * It used to be sixteen names hardcoded in `oracle-symbols.pipe.ts` — the members of a
 * `KeywordAbility` enum, not the game's keywords — so a card reading "Cascade" or
 * "Landfall" got nothing. Keeping the list here rather than copying it into the client
 * means a new set's keywords link the moment the API's rules document is updated, and it
 * keeps the judgement of *which* keywords are safe to match (abilities and ability words,
 * never the ordinary verbs that are keyword actions) in one place.
 *
 * `linkify` is synchronous because `OracleSymbolsPipe` is a pure pipe running over every
 * card on screen. The load is awaited by an app initializer so the table is in place
 * before any card renders; if it never arrives, card text renders unlinked rather than
 * broken.
 */
@Injectable({ providedIn: 'root' })
export class KeywordLinkService {
  private pattern: RegExp | null = null;

  /** Lower-cased matched text → the keyword entry it opens. */
  private targets = new Map<string, string>();

  constructor(private api: RulesApiService) {}

  /** True once the term table is available. Card text is simply unlinked before then. */
  get ready(): boolean {
    return this.pattern !== null;
  }

  load() {
    return this.api.keywordLinks().pipe(
      tap((links) => this.compile(links)),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  /**
   * Wraps every known keyword in `html` in an anchor to its knowledge base entry.
   *
   * The input is already-escaped HTML that may contain mana-symbol `<i>` tags, so the
   * expression alternates between "a complete tag" (passed through untouched) and "a
   * keyword" — matching inside a tag would rewrite an attribute rather than a word.
   */
  linkify(html: string): string {
    if (!this.pattern) {
      return html;
    }

    // A global regex carries lastIndex between calls; reset so each call starts clean.
    this.pattern.lastIndex = 0;

    return html.replace(this.pattern, (whole, tag: string | undefined, keyword?: string) => {
      if (tag || !keyword) {
        return whole;
      }

      const target = this.targets.get(keyword.toLowerCase().replace(/\s+/g, ' ')) ?? keyword;
      // No target="_blank": KeywordSheetComponent intercepts the click and shows the
      // rule over the page, and this app is headed for a packaged build where there is
      // no tab to open. The href stays real so ctrl/cmd-click still opens one on the web.
      return `<a href="/kb?kw=${encodeURIComponent(target)}" class="kw-link">${keyword}</a>`;
    });
  }

  private compile(links: KeywordLink[]): void {
    this.targets.clear();
    for (const link of links) {
      this.targets.set(link.match.toLowerCase(), link.keyword);
    }

    if (!links.length) {
      this.pattern = null;
      return;
    }

    // The server orders longest first so "First Strike" is tried before "Flash", and a
    // regex alternation takes the first branch that matches. Whitespace inside a term is
    // matched loosely because card text wraps and reminder text does not always use a
    // single space.
    const terms = links.map((l) => escapeRegExp(l.match).replace(/\s+/g, '\\s+')).join('|');

    // Word edges are lookarounds rather than `\b` because keywords are allowed to end in
    // punctuation — "For Mirrodin!" and "Start Your Engines!" both do, and a trailing
    // `\b` after "!" demands a word character next, so neither would ever match.
    // `(?<!=)` keeps a term that is already part of an href out of the match.
    this.pattern = new RegExp(`(<[^>]+>)|((?<!=)(?<!\\w)(?:${terms})(?!\\w))`, 'gi');
  }
}
