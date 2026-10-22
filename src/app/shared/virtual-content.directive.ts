import {
  AfterViewInit,
  Directive,
  EmbeddedViewRef,
  NgZone,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
/** Retains a measured slot while releasing offscreen card controls and images. */
@Directive({ selector: '[appVirtualContent]', standalone: true })
export class VirtualContentDirective implements AfterViewInit, OnDestroy {
  private view: EmbeddedViewRef<unknown> | null = null;
  private observer?: IntersectionObserver;
  private resize?: ResizeObserver;
  private height = 0;
  private width = 0;
  private host: HTMLElement | null = null;
  constructor(
    private template: TemplateRef<unknown>,
    private container: ViewContainerRef,
    private zone: NgZone,
  ) {
    this.show();
  }
  ngAfterViewInit(): void {
    this.host = this.container.element.nativeElement.parentElement;
    if (!this.host || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) =>
        this.zone.run(() => {
          if (entries[0]?.isIntersecting) {
            this.host!.style.minHeight = '';
            this.show();
          } else if (this.view) {
            const bounds = this.host!.getBoundingClientRect();
            this.height = bounds.height;
            this.width = bounds.width;
            this.host!.style.minHeight = this.height + 'px';
            this.container.clear();
            this.view = null;
          }
        }),
      { rootMargin: '500px 0px' },
    );
    this.observer.observe(this.host);
    this.resize = new ResizeObserver(() => {
      if (!this.view && this.host && this.width > 0) {
        const width = this.host.getBoundingClientRect().width;
        this.host.style.minHeight = (this.height * width) / this.width + 'px';
      }
    });
    this.resize.observe(this.host);
  }
  private show(): void {
    if (!this.view) {
      this.view = this.container.createEmbeddedView(this.template);
      this.view.detectChanges();
    }
  }
  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.resize?.disconnect();
  }
}
