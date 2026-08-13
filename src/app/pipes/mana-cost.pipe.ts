import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { symbolToClass } from '../utils/mana.utils';

@Pipe({ name: 'manaCost', standalone: true, pure: true })
export class ManaCostPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';
    // Shared symbol map — the naive lowercase-and-strip-slashes this pipe used to do
    // rendered {T} as the nonexistent ms-t instead of ms-tap.
    const html = text
      .replace(/\n/g, '<br>')
      .replace(
        /\{([^}]+)\}/g,
        (_, sym: string) => `<i class="ms ms-cost ms-shadow ${symbolToClass(sym.trim())}"></i>`,
      );
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
