import { Directive, ElementRef, HostBinding, AfterViewInit, OnDestroy } from '@angular/core';

@Directive({ selector: '[overflowScroll]', standalone: true })
export class OverflowScrollDirective implements AfterViewInit, OnDestroy {
  @HostBinding('class.should-scroll') shouldScroll = false;
  private observer?: ResizeObserver;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    this.check();
    this.observer = new ResizeObserver(() => this.check());
    this.observer.observe(this.el.nativeElement);
    const parent = this.el.nativeElement.parentElement;
    if (parent) this.observer.observe(parent);
  }

  private check() {
    const el = this.el.nativeElement;
    const parent = el.parentElement;
    if (!parent) return;
    this.shouldScroll = el.scrollHeight > parent.clientHeight;
  }

  ngOnDestroy() { this.observer?.disconnect(); }
}
