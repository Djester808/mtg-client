import { Directive, ElementRef, OnDestroy, OnInit } from '@angular/core';

/**
 * Moves the host element to `document.body` on init and removes it on destroy.
 *
 * Overlays inside the deck view were being painted *behind* the app header: `.detail-body`
 * sets `position: relative; z-index: 3`, which creates a stacking context, so a `position:
 * fixed` modal nested inside it can never paint above a sibling with a higher z-index (the
 * header at z-index 60) no matter how large its own z-index is. Re-parenting the modal to
 * `<body>` lifts it out of that stacking context.
 *
 * Angular keeps the element's bindings and change detection working after the move — a
 * component's view is logical, not tied to its DOM parent — so click/scroll/ngModel all
 * continue to function.
 */
@Directive({
  selector: '[appToBody]',
  standalone: true,
})
export class ToBodyDirective implements OnInit, OnDestroy {
  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.body.appendChild(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.el.nativeElement.remove();
  }
}
