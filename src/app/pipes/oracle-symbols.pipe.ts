import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { symbolToClass } from '../utils/mana.utils';

// Longest phrases first so multi-word keywords match before their components.
const KEYWORDS = [
  'Double Strike',
  'First Strike',
  'Deathtouch',
  'Indestructible',
  'Lifelink',
  'Vigilance',
  'Hexproof',
  'Trample',
  'Menace',
  'Protection',
  'Shroud',
  'Flying',
  'Reach',
  'Haste',
  'Flash',
  'Ward',
];

const _kwPattern = KEYWORDS.map((k) => k.replace(/\s+/g, '\\s+')).join('|');
// Alternation: match either a complete HTML tag (pass through) or a keyword (linkify).
const KW_LINK_RE = new RegExp(`(<[^>]+>)|((?<!=)\\b(?:${_kwPattern})\\b)`, 'gi');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function linkKeywords(html: string): string {
  return html.replace(KW_LINK_RE, (_, tag, kw) => {
    if (tag) return tag;
    return `<a href="/kb?kw=${encodeURIComponent(kw)}" target="_blank" rel="noopener" class="kw-link">${kw}</a>`;
  });
}

@Pipe({ name: 'oracleSymbols', standalone: true, pure: true })
export class OracleSymbolsPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

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

    return this.sanitizer.bypassSecurityTrustHtml(linkKeywords(withLoyalty));
  }
}
