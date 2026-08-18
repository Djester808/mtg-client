import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { symbolToClass } from '../utils/mana.utils';
import { KeywordLinkService } from '../services/keyword-link.service';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders a card's oracle text: mana and loyalty symbols as glyphs, keywords as links to
 * the knowledge base.
 *
 * The keyword list is not here. It was — sixteen names in a const array, copied from a
 * `KeywordAbility` enum — so a card reading "Cascade", "Landfall" or "Cumulative Upkeep"
 * linked nothing. {@link KeywordLinkService} holds the terms the server derives from the
 * Comprehensive Rules, which is all of them and stays current on its own.
 */
@Pipe({ name: 'oracleSymbols', standalone: true, pure: true })
export class OracleSymbolsPipe implements PipeTransform {
  constructor(
    private sanitizer: DomSanitizer,
    private keywords: KeywordLinkService,
  ) {}

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';
    const withSymbols = escapeHtml(text)
      .replace(/\{([^}]+)\}/g, (_, sym) => {
        const cls = symbolToClass(sym);
        return `<i class="ms ms-cost ms-shadow ${cls}"></i>`;
      })
      .replace(/\n/g, '<br>');

    // Loyalty costs appear at the start of planeswalker ability lines: +1:, −2:, 0:
    const withLoyalty = withSymbols.replace(/(^|<br>)([-+−]?)(\d+|X):/g, (_, prefix, sign, num) => {
      const n = num.toLowerCase();
      let cls: string;
      if (sign === '+') cls = `ms-loyalty-up ms-loyalty-${n}`;
      else if (sign === '-' || sign === '−') cls = `ms-loyalty-down ms-loyalty-${n}`;
      else cls = 'ms-loyalty-zero';
      return `${prefix}<i class="ms ${cls}"></i>:`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(this.keywords.linkify(withLoyalty));
  }
}
