import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';

export function motionReduced(document: Document): boolean {
  return (
    document.documentElement.classList.contains('reduce-motion') ||
    !!document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Original Compleat's free-board motion: visible cards glide from their previous positions. */
@Directive({ selector: '[appReorderMotion]', standalone: true })
export class ReorderMotionDirective implements OnChanges, OnDestroy {
  @Input() appReorderMotion: unknown;
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private frame: number | null = null;
  private animations: Animation[] = [];
  private readonly selector = '.free-card[data-card-id], .free-col-header';
  ngOnChanges(): void {
    const view = this.document.defaultView;
    if (!view || motionReduced(this.document)) {
      this.cancel();
      return;
    }
    this.cancel();
    const origins = new Map<string, DOMRect>();
    for (const item of Array.from(
      this.root.nativeElement.querySelectorAll<HTMLElement>(this.selector),
    )) {
      const rect = item.getBoundingClientRect();
      if (this.visible(rect)) origins.set(this.key(item), rect);
    }
    if (!origins.size) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      if (motionReduced(this.document)) return;
      for (const item of Array.from(
        this.root.nativeElement.querySelectorAll<HTMLElement>(this.selector),
      )) {
        const from = origins.get(this.key(item));
        const to = item.getBoundingClientRect();
        if (!from || !this.visible(to)) continue;
        const dx = from.left - to.left,
          dy = from.top - to.top;
        if (Math.abs(dx) + Math.abs(dy) < 1) continue;
        this.animations.push(
          item.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
            duration: 240,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }),
        );
      }
      origins.clear();
    });
  }
  private key(item: HTMLElement): string {
    return item.dataset['cardId']
      ? `card:${item.dataset['cardId']}`
      : `heading:${item.closest<HTMLElement>('[data-col-id]')?.dataset['colId']}`;
  }
  private visible(rect: DOMRect): boolean {
    const view = this.document.defaultView;
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (view?.innerHeight ?? 0) &&
      rect.left < (view?.innerWidth ?? 0)
    );
  }
  private cancel(): void {
    if (this.frame !== null) this.document.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.animations.forEach((a) => a.cancel());
    this.animations = [];
  }
  ngOnDestroy(): void {
    this.cancel();
  }
}
