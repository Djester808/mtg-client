import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A user's avatar: their picture, or their initial on a colour derived from their name.
 *
 * The single implementation. players-list and user-profile each had their own — one with a
 * hashed colour, one with a fixed gold gradient — so the same person was a different shape
 * and a different colour depending on which page you found them on. New callers belong
 * here rather than in a third copy.
 *
 * `size` is a number of pixels rather than a t-shirt name because the callers genuinely
 * want different sizes (40 in a list row, 88 on a profile hero) and naming three of them
 * would only postpone the fourth.
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      *ngIf="avatarUrl && !failed; else initial"
      class="ua-img"
      [src]="avatarUrl"
      [attr.alt]="label + ' avatar'"
      loading="lazy"
      decoding="async"
      (error)="failed = true"
    />
    <ng-template #initial>
      <span class="ua-initial" [style.background]="tint" aria-hidden="true">{{ letter }}</span>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
        width: var(--ua-size, 40px);
        height: var(--ua-size, 40px);
        border-radius: 50%;
        overflow: hidden;
        border: 1px solid rgba(201, 168, 76, 0.28);
        background: var(--bg-raised, rgba(255, 255, 255, 0.04));
      }

      .ua-img,
      .ua-initial {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ua-img {
        object-fit: cover;
      }

      .ua-initial {
        font-family: var(--font-display);
        /* Scales with the host so one rule serves a 40px row and an 88px hero. */
        font-size: calc(var(--ua-size, 40px) * 0.42);
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
        text-transform: uppercase;
        user-select: none;
      }
    `,
  ],
})
export class UserAvatarComponent {
  /**
   * Publishes `size` to CSS so one rule set serves every caller.
   *
   * Written as a full string rather than a `.px` unit suffix: the suffix form is not
   * applied to custom properties, so the variable would land as a bare number and every
   * length computed from it would be invalid.
   */
  @HostBinding('style.--ua-size') get sizeVar(): string {
    return `${this.size}px`;
  }

  /** Identity. Decides the fallback letter and its colour. */
  @Input({ required: true }) username = '';

  /** Preferred over `username` for the letter and the alt text when present. */
  @Input() displayName: string | null = null;

  @Input() avatarUrl: string | null = null;

  @Input() size = 40;

  /** A picture that 404s falls back to the initial rather than a broken-image glyph. */
  failed = false;

  get label(): string {
    return this.displayName?.trim() || this.username;
  }

  get letter(): string {
    return this.label.charAt(0) || '?';
  }

  /**
   * A stable colour per username, so the same person keeps the same tile everywhere and
   * across reloads. Hashed rather than random for exactly that reason.
   */
  get tint(): string {
    let hash = 0;
    for (const ch of this.username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xfffffff;
    return TINTS[hash % TINTS.length];
  }
}

/** Muted enough to sit under white text on this app's dark surfaces. */
const TINTS = ['#7b5ea7', '#4a7c59', '#6b8cae', '#a05c45', '#5a8a6a', '#8a6b3a'];
