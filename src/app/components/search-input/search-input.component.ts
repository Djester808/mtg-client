import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * The one search box. Every list in the app grew its own icon-plus-input with its own
 * copy of the same CSS, so they drifted apart; this is the shared original the rest are
 * meant to be instances of.
 *
 * Extend it through the `trailing` slot rather than by restyling a local copy:
 *
 *   <app-search-input [(value)]="query" (debouncedChange)="reload()">
 *     <span trailing>{{ total }} matches</span>
 *   </app-search-input>
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="si-wrap" [class.si-wrap--compact]="compact">
      <i class="bi bi-search si-icon"></i>
      <input
        class="si-input"
        type="text"
        [ngModel]="value"
        (ngModelChange)="onInput($event)"
        [placeholder]="placeholder"
        [title]="title"
        autocomplete="off"
        spellcheck="false"
      />
      <button
        class="si-clear"
        *ngIf="value"
        (click)="clear()"
        type="button"
        title="Clear search"
        aria-label="Clear search"
      >
        <i class="bi bi-x-circle"></i>
      </button>
      <span class="si-trailing"><ng-content select="[trailing]"></ng-content></span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .si-wrap {
        position: relative;
        display: flex;
        align-items: center;
        /* Let a host size the field: the input is ~28px of its own, and every caller that
           wanted a taller one had been getting it by accident from a flex row's stretch.
           Inherited min-height is auto unless the host sets one, so nothing else moves.
           (No backticks in this comment — it lives inside a template literal.) */
        min-height: inherit;
      }

      .si-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: #6b6050;
        font-size: 12px;
        pointer-events: none;
      }

      .si-input {
        flex: 1;
        min-width: 0;
        align-self: stretch;
        padding: 6px 10px 6px 30px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #e8e0ce;
        font-size: 12px;
        outline: none;
        transition: border-color 0.15s;

        &::placeholder {
          color: #5a5040;
        }
        &:focus {
          border-color: rgba(201, 168, 76, 0.4);
        }
      }

      .si-wrap--compact .si-input {
        padding-top: 4px;
        padding-bottom: 4px;
      }

      /* Sits inside the field so the clear button never shifts the layout. */
      .si-clear {
        position: absolute;
        right: 6px;
        background: none;
        border: none;
        padding: 0 4px;
        cursor: pointer;
        color: #6b6050;
        font-size: 12px;
        line-height: 1;

        &:hover {
          color: #e8e0ce;
        }
      }

      .si-trailing:empty {
        display: none;
      }

      .si-trailing {
        margin-left: 8px;
        font-size: 10px;
        color: #6b6050;
        white-space: nowrap;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchInputComponent implements OnDestroy {
  @Input() value = '';
  @Input() placeholder = 'Search…';
  @Input() title = '';

  /** Slightly shorter field, for dense panels. */
  @Input() compact = false;

  /** Set to 0 to emit on every keystroke. */
  @Input() debounceMs = 250;

  /** Fires immediately, for two-way binding. */
  @Output() valueChange = new EventEmitter<string>();

  /** Fires after the user stops typing — bind the actual query to this. */
  @Output() debouncedChange = new EventEmitter<string>();

  private timer: ReturnType<typeof setTimeout> | undefined;

  onInput(v: string): void {
    this.value = v;
    this.valueChange.emit(v);

    clearTimeout(this.timer);
    if (this.debounceMs <= 0) {
      this.debouncedChange.emit(v);
      return;
    }
    this.timer = setTimeout(() => this.debouncedChange.emit(v), this.debounceMs);
  }

  clear(): void {
    clearTimeout(this.timer);
    this.value = '';
    this.valueChange.emit('');
    this.debouncedChange.emit('');
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
