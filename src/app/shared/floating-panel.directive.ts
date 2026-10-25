import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  inject,
} from '@angular/core';
import { FloatingPanelStackService } from './floating-panel-stack.service';
import { UiPreferencesService } from '../services/ui-preferences.service';

/** Window interaction only: authorization and content remain owned by the caller. */
@Directive({ selector: '[appFloatingPanel]', standalone: true })
export class FloatingPanelDirective implements AfterViewInit, OnDestroy {
  @HostBinding('attr.tabindex') readonly tabIndex = -1;
  private readonly element = inject<ElementRef<HTMLDetailsElement>>(ElementRef).nativeElement;
  @Input() rememberPanel: 'library' | 'opponent-library' | null = null;
  private get preferenceKey(): 'libraryPanel' | 'opponentLibraryPanel' | null {
    return this.rememberPanel === 'library'
      ? 'libraryPanel'
      : this.rememberPanel === 'opponent-library'
        ? 'opponentLibraryPanel'
        : null;
  }
  private readonly stack = inject(FloatingPanelStackService);
  private readonly preferences = inject(UiPreferencesService);
  private observer?: ResizeObserver;
  private saved: { left: number; top: number; width: number; height: number } | null = null;
  private wasFloating = false;
  private drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  private floating(): boolean {
    return (
      this.element.open &&
      getComputedStyle(this.element).getPropertyValue('--floating-panel').trim() === '1'
    );
  }
  ngAfterViewInit(): void {
    this.stack.register(this.element);
    if (this.preferenceKey) this.saved = this.preferences.state()[this.preferenceKey];
    this.observer = new ResizeObserver(() => this.constrain());
    this.observer.observe(this.element);
  }
  @HostListener('focusin')
  activate(): void {
    if (this.floating()) this.stack.raise(this.element);
  }
  @HostListener('toggle')
  @HostListener('window:resize')
  constrain(): void {
    if (!this.floating()) {
      this.wasFloating = false;
      this.end();
      for (const name of ['left', 'top', 'width', 'height'])
        this.element.style.removeProperty(name);
      return;
    }
    const rect =
      !this.wasFloating && this.saved ? this.saved : this.element.getBoundingClientRect();
    this.wasFloating = true;
    this.place(rect.left, rect.top, rect.width, rect.height);
  }
  private place(left: number, top: number, width: number, height: number): void {
    const margin = 12;
    width = Math.min(width, window.innerWidth - margin * 2);
    height = Math.min(height, window.innerHeight - margin * 2);
    const box = {
      left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
      width,
      height,
    };
    this.saved = box;
    if (
      this.preferenceKey &&
      JSON.stringify(this.preferences.state()[this.preferenceKey]) !== JSON.stringify(box)
    )
      this.preferences.update({ [this.preferenceKey]: box });
    for (const [name, value] of Object.entries(box)) {
      const next = Math.round(value) + 'px';
      if (this.element.style.getPropertyValue(name) !== next)
        this.element.style.setProperty(name, next);
    }
  }
  @HostListener('pointerdown', ['$event'])
  start(event: PointerEvent): void {
    if (this.floating() && event.button === 0) this.element.focus({ preventScroll: true });
    if (
      !this.floating() ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      !event.target.closest('[data-panel-handle]')
    )
      return;
    const rect = this.element.getBoundingClientRect();
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    this.element.setPointerCapture(event.pointerId);
    (event.target.closest('[data-panel-handle]') as HTMLElement).focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
  }
  @HostListener('pointermove', ['$event'])
  move(event: PointerEvent): void {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    const rect = this.element.getBoundingClientRect();
    this.place(
      this.drag.left + event.clientX - this.drag.x,
      this.drag.top + event.clientY - this.drag.y,
      rect.width,
      rect.height,
    );
    event.preventDefault();
  }
  @HostListener('pointerup')
  @HostListener('pointercancel')
  @HostListener('lostpointercapture')
  end(): void {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.element.hasPointerCapture(drag.id))
      this.element.releasePointerCapture(drag.id);
  }
  @HostListener('click', ['$event'])
  click(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('[data-panel-handle]')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  @HostListener('keydown', ['$event'])
  key(event: KeyboardEvent): void {
    if (
      !this.floating() ||
      !(event.target instanceof Element) ||
      !event.target.closest('[data-panel-handle]')
    )
      return;
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = direction[event.key];
    if (!step) return;
    const rect = this.element.getBoundingClientRect(),
      distance = event.shiftKey ? 40 : 10;
    this.place(
      rect.left + step[0] * distance,
      rect.top + step[1] * distance,
      rect.width,
      rect.height,
    );
    event.preventDefault();
    event.stopPropagation();
  }
  ngOnDestroy(): void {
    this.stack.unregister(this.element);
    this.end();
    this.observer?.disconnect();
  }
}
