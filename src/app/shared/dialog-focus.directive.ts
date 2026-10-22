import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';

/** Keeps keyboard focus in a modal and returns it to the control that opened it. */
@Directive({ selector: '[appDialogFocus]', standalone: true })
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previous: HTMLElement | null = null;
  ngAfterViewInit() {
    this.previous = this.document.activeElement as HTMLElement | null;
    this.controls()[0]?.focus({ preventScroll: true });
  }
  @HostListener('keydown', ['$event']) keydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = this.controls();
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  ngOnDestroy() {
    if (this.previous?.isConnected) this.previous.focus({ preventScroll: true });
  }
  private controls() {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
      ),
    ).filter((element) => element.getClientRects().length > 0);
  }
}
