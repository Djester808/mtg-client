import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'manaCost', standalone: true, pure: true })
export class ManaCostPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';
    const html = text
      .replace(/\n/g, '<br>')
      .replace(/\{([^}]+)\}/g, (_, sym: string) => {
        // {W/P} → ms-wp, {2/W} → ms-2w, {C} → ms-c, {T} → ms-tap, etc.
        const cls = sym.toLowerCase()
          .replace(/\//g, '')
          .replace(/\s/g, '');
        return `<i class="ms ms-cost ms-shadow ms-${cls}"></i>`;
      });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
