import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const SYMBOL_CLASS: Record<string, string> = {
  T: 'ms-tap', Q: 'ms-untap', E: 'ms-e', S: 'ms-s',
  W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
  X: 'ms-x', Y: 'ms-y', Z: 'ms-z',
};

function symbolToClass(sym: string): string {
  const up = sym.toUpperCase();

  if (SYMBOL_CLASS[up]) return SYMBOL_CLASS[up];

  // Generic mana: {0}–{20}
  if (/^\d+$/.test(up)) return `ms-${up}`;

  // Hybrid/phyrexian: {W/U}, {2/W}, {W/P}, etc.
  if (up.includes('/')) {
    return `ms-${up.replace('/', '').toLowerCase()}`;
  }

  return 'ms-c';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
}

@Pipe({ name: 'oracleSymbols', standalone: true, pure: true })
export class OracleSymbolsPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';
    const html = escapeHtml(text)
      .replace(/\{([^}]+)\}/g, (_, sym) => {
        const cls = symbolToClass(sym);
        return `<i class="ms ms-cost ms-shadow ${cls}"></i>`;
      })
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
