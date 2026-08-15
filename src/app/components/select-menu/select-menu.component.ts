import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SetIconComponent } from '../set-icon/set-icon.component';

export interface SelectMenuOption {
  value: string;
  label: string;
  title?: string;
  /** Set code to draw a set symbol beside the label (printing/set pickers). */
  iconCode?: string | null;
}

/**
 * Drop-in replacement for a native <select>: same contract (options, value, change),
 * but the popup is an app-styled menu instead of unstylable system chrome. The open
 * state lives here, so parents re-rendering (async option loads, change detection)
 * never snap the menu shut — the reason some selects used to stay native.
 *
 * The menu is position: fixed, measured from the button when it opens, so it escapes
 * overflow-clipping containers (scrolling result lists, card grids).
 */
@Component({
  selector: 'app-select-menu',
  standalone: true,
  imports: [CommonModule, SetIconComponent],
  template: `
    <button
      type="button"
      class="asm-btn"
      [class.has-error]="hasError"
      [class.is-open]="open"
      [disabled]="disabled"
      [title]="selected?.title ?? selected?.label ?? placeholder"
      (click)="toggle($event)"
    >
      <app-set-icon
        *ngIf="selected?.iconCode as code"
        [setCode]="code"
        [setName]="selected?.title"
      ></app-set-icon>
      <span class="asm-label" [class.is-placeholder]="!selected">{{
        selected?.label ?? placeholder
      }}</span>
      <i class="bi bi-chevron-down asm-chev" [class.is-open]="open"></i>
    </button>

    <div
      class="app-menu asm-menu"
      *ngIf="open"
      [style.left.px]="menuX"
      [style.top.px]="menuY"
      [style.minWidth.px]="menuW"
    >
      <button
        type="button"
        class="app-menu-item"
        *ngFor="let o of options; let i = index"
        [class.is-active]="o.value === value"
        [class.is-key-active]="i === activeIdx"
        [title]="o.title ?? o.label"
        (click)="pick(o, $event)"
      >
        <app-set-icon
          *ngIf="o.iconCode as code"
          [setCode]="code"
          [setName]="o.title"
        ></app-set-icon>
        {{ o.label }}
      </button>
      <div class="app-menu-empty" *ngIf="options.length === 0">{{ emptyLabel }}</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        min-width: 0;
      }
      .asm-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        min-width: 0;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: 6px;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 8px;
        transition:
          border-color 0.15s,
          color 0.15s;
      }
      .asm-btn:hover:not(:disabled),
      .asm-btn.is-open {
        border-color: var(--border-lit);
        color: var(--text-primary);
      }
      .asm-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .asm-btn.has-error {
        border-color: #f87171;
      }
      .asm-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        /* Centred to match the plain-text label that replaces this control when there is
           only one option — otherwise the set appears to jump sideways from tile to tile
           depending on whether a choice exists. */
        text-align: center;
      }
      .asm-label.is-placeholder {
        color: var(--text-dim);
      }
      .asm-chev {
        font-size: 9px;
        flex-shrink: 0;
        transition: transform 0.15s;
      }
      .asm-chev.is-open {
        transform: rotate(180deg);
      }
      .asm-menu {
        position: fixed;
      }
      /* Only the items rendered by this menu — scoped, so the global .app-menu-item
         used elsewhere keeps its own layout. Needed so a set symbol sits on the
         text baseline instead of pushing the label onto its own line. */
      .app-menu-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectMenuComponent implements OnDestroy {
  @Input() options: SelectMenuOption[] = [];
  @Input() value: string | null = null;
  @Input() placeholder = 'Select';
  @Input() emptyLabel = 'Loading…';
  @Input() disabled = false;
  @Input() hasError = false;

  @Output() valueChange = new EventEmitter<string>();
  /** Fires when the menu opens — lazy option loaders (printings) hook this. */
  @Output() opened = new EventEmitter<void>();

  open = false;
  menuX = 0;
  menuY = 0;
  menuW = 0;
  /** Keyboard-highlighted option index while the menu is open. */
  activeIdx = -1;

  /**
   * The single open menu app-wide. Button clicks stop propagation (they must not
   * trigger row-level click handlers underneath), which also means other instances'
   * document-click closers never fire — so opening one closes the previous explicitly.
   */
  private static openInstance: SelectMenuComponent | null = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
  ) {}

  get selected(): SelectMenuOption | null {
    return this.options.find((o) => o.value === this.value) ?? null;
  }

  toggle(e: Event): void {
    e.stopPropagation();
    if (this.disabled) return;
    if (this.open) this.close();
    else this.openMenu();
  }

  private openMenu(): void {
    SelectMenuComponent.openInstance?.closeAndRefresh();
    const btn = this.host.nativeElement.querySelector('.asm-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    this.menuW = Math.max(r.width, 120);
    this.menuX = Math.min(r.left, window.innerWidth - this.menuW - 8);
    // Estimate the rendered height from the option count (capped by the menu's
    // max-height) so short menus hug the button when flipping upward and tall ones
    // don't overhang the viewport bottom.
    const est = Math.min(300, Math.max(1, this.options.length) * 33 + 10);
    const below = window.innerHeight - r.bottom;
    // Viewport coordinates — correct only because the menu is lifted to <body> below.
    // Left in the template it would be laid out against any ancestor that establishes a
    // containing block for position: fixed (a transform or backdrop-filter is enough).
    this.menuY = below < est + 12 && r.top > below ? Math.max(8, r.top - est - 6) : r.bottom + 4;
    this.activeIdx = this.options.findIndex((o) => o.value === this.value);
    this.open = true;
    // Render the menu now, then lift it out to <body>. position: fixed is only relative
    // to the viewport while no ancestor establishes a containing block for it, and the
    // collection grid's .card-bottom has a transform *and* a backdrop-filter — either is
    // enough. Left in place there, the menu was laid out against that box and landed
    // 161px below the bottom of the screen: open, populated, and entirely invisible.
    this.cdr.detectChanges();
    this.liftMenuToBody();
    SelectMenuComponent.openInstance = this;
    // Capture-phase: inner containers (scrolling lists) don't bubble scroll to window,
    // and a fixed-position menu strands wherever it was measured — close instead.
    document.addEventListener('scroll', this.closeOnScroll, true);
    this.opened.emit();
  }

  pick(o: SelectMenuOption, e: Event): void {
    e.stopPropagation();
    this.close();
    if (o.value !== this.value) this.valueChange.emit(o.value);
  }

  /** The menu node while it is parked on <body>, and the slot to put it back into. */
  private movedMenu: HTMLElement | null = null;
  private menuHome: Node | null = null;

  private liftMenuToBody(): void {
    const menu = this.host.nativeElement.querySelector('.asm-menu') as HTMLElement | null;
    if (!menu?.parentNode) return;
    this.movedMenu = menu;
    this.menuHome = menu.parentNode;
    document.body.appendChild(menu);
  }

  /**
   * Put it back before Angular's *ngIf tears it down — the view still expects to remove
   * the node from its original parent, and leaving it on <body> orphans it there.
   */
  private restoreMenu(): void {
    if (this.movedMenu && this.menuHome) this.menuHome.appendChild(this.movedMenu);
    this.movedMenu = null;
    this.menuHome = null;
  }

  private close(): void {
    this.restoreMenu();
    this.open = false;
    if (SelectMenuComponent.openInstance === this) SelectMenuComponent.openInstance = null;
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }

  private closeAndRefresh(): void {
    this.close();
    this.cdr.markForCheck();
  }

  private closeOnScroll = (e: Event) => {
    // Scrolling the option list itself must not dismiss the menu.
    if (e.target instanceof Node && this.ownsNode(e.target)) return;
    if (this.open) this.closeAndRefresh();
  };

  ngOnDestroy(): void {
    // Otherwise a menu open at teardown is stranded on <body> forever.
    this.movedMenu?.remove();
    this.movedMenu = null;
    if (SelectMenuComponent.openInstance === this) SelectMenuComponent.openInstance = null;
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }

  /** True for the button and for the menu, wherever the menu is currently parented. */
  private ownsNode(n: Node | null): boolean {
    if (!n) return false;
    return this.host.nativeElement.contains(n) || !!this.movedMenu?.contains(n);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open && !this.ownsNode(e.target as Node)) {
      this.closeAndRefresh();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.closeAndRefresh();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.open) this.closeAndRefresh();
  }

  /** Keyboard support the native <select> had: arrows navigate, Enter picks. */
  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (this.disabled) return;
    if (!this.open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.activeIdx = Math.min(this.options.length - 1, Math.max(0, this.activeIdx + step));
      this.host.nativeElement
        .querySelectorAll('.app-menu-item')
        [this.activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = this.options[this.activeIdx];
      if (o) {
        this.close();
        if (o.value !== this.value) this.valueChange.emit(o.value);
      }
    }
  }
}
