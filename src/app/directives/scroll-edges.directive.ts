import { Directive, ElementRef, NgZone, OnDestroy, Renderer2, inject } from '@angular/core';

/**
 * Marks a horizontal scroller with `can-scroll-left` / `can-scroll-right` while there is
 * content past that edge, so a stylesheet can fade it.
 *
 * A strip sliced flat at the screen edge reads as a broken layout, not as a scroller —
 * that was the finding on the community tab bar, and it is the same finding on the deck's
 * free-arrange board, which pans 2104px inside a 369px window with nothing to say so. The
 * fade is the whole affordance, so it belongs somewhere both can reach rather than being
 * written a second time.
 *
 * Classes go on directly rather than through host bindings: the listener runs outside
 * Angular (scroll fires at frame rate) and this way a swipe costs no change detection at
 * all, only the two class writes on the frames where an edge actually flips.
 */
@Directive({
  selector: '[appScrollEdges]',
  standalone: true,
})
export class ScrollEdgesDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly zone = inject(NgZone);
  private readonly renderer = inject(Renderer2);

  private onScroll = () => this.update();
  private ro?: ResizeObserver;
  private left = false;
  private right = false;

  constructor() {
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('scroll', this.onScroll, { passive: true });

      // The content is not its final width on first paint — card art and web fonts land
      // after — and a scroller only becomes scrollable once it is. Measuring once would
      // fade against a geometry that no longer exists a frame later.
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.update());
        this.ro.observe(this.host);
        if (this.host.firstElementChild) this.ro.observe(this.host.firstElementChild);
      }
      this.update();
    });
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('scroll', this.onScroll);
    this.ro?.disconnect();
  }

  private update(): void {
    const el = this.host;
    // 2px: a fractional scrollLeft at either end must not leave a fade hanging over an
    // edge that has nothing past it.
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    if (left !== this.left) {
      this.left = left;
      this.toggle('can-scroll-left', left);
    }
    if (right !== this.right) {
      this.right = right;
      this.toggle('can-scroll-right', right);
    }
  }

  private toggle(cls: string, on: boolean): void {
    if (on) this.renderer.addClass(this.host, cls);
    else this.renderer.removeClass(this.host, cls);
  }
}
