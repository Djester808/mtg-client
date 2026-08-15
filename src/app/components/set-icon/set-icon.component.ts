import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The set symbol for a set code. Scryfall serves these as SVGs at a stable, code-derived
 * path, so no extra API round-trip or stored icon URI is needed.
 *
 * The image is decorative — every use sits beside the set code as text — so it carries an
 * empty alt and simply disappears if a code has no symbol (promo and token sets often
 * don't), rather than leaving a broken-image glyph in the layout.
 */
@Component({
  selector: 'app-set-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img
      *ngIf="!failed && url"
      class="set-icon"
      [src]="url"
      [attr.title]="setName || setCode"
      alt=""
      loading="lazy"
      (error)="failed = true"
    />
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
      .set-icon {
        /* Sized against the label beside it, but larger than 1em: at text height the
           symbols' fine detail turned to mush and they read as smudges. */
        width: 1.45em;
        height: 1.45em;
        object-fit: contain;
        /* The symbols ship as black artwork; invert so they read on the dark surface. */
        filter: invert(88%);
        opacity: 0.9;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetIconComponent {
  @Input() setCode: string | null | undefined = null;
  @Input() setName: string | null | undefined = null;

  failed = false;

  get url(): string | null {
    const code = this.setCode?.trim().toLowerCase();
    if (!code) return null;
    return `https://svgs.scryfall.io/sets/${encodeURIComponent(code)}.svg`;
  }
}
