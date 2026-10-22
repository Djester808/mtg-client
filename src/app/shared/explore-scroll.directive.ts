import { AfterViewInit, Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';
import { Router, NavigationStart, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { ExploreScrollStateService } from '../services/explore-scroll-state.service';
@Directive({ selector: '[appExploreScroll]', standalone: true })
export class ExploreScrollDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() appExploreScroll = false;
  private host: HTMLElement | null = null;
  private key = '';
  private restoring = true;
  private leaving = false;
  private frame = 0;
  private subscription?: Subscription;
  private readonly onScroll = () => this.save();
  constructor(
    private element: ElementRef<HTMLElement>,
    private router: Router,
    private positions: ExploreScrollStateService,
  ) {}
  ngAfterViewInit(): void {
    this.host = this.element.nativeElement.closest('.app-content');
    this.key = this.router.getCurrentNavigation()?.finalUrl?.toString() ?? this.router.url;
    this.host?.addEventListener('scroll', this.onScroll, { passive: true });
    this.subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.save();
        this.leaving = event.url.split('?')[0] !== this.key.split('?')[0];
      }
      if (event instanceof NavigationEnd) {
        this.key = event.urlAfterRedirects;
        this.leaving = false;
      }
    });
    this.restore();
  }
  ngOnChanges(): void {
    if (!this.appExploreScroll) this.restoring = true;
    else this.restore();
  }
  private save(): void {
    if (!this.host || this.restoring) return;
    const open = Array.from(this.element.nativeElement.querySelectorAll('details')).flatMap(
      (panel, index) => (panel.open ? [index] : []),
    );
    this.positions.save(this.key, { top: this.host.scrollTop, open });
  }
  private restore(): void {
    if (!this.host || !this.appExploreScroll) return;
    cancelAnimationFrame(this.frame);
    this.restoring = true;
    this.frame = requestAnimationFrame(() => {
      const position = this.positions.read(this.key);
      if (position)
        Array.from(this.element.nativeElement.querySelectorAll('details')).forEach(
          (panel, index) => (panel.open = position.open.includes(index)),
        );
      this.frame = requestAnimationFrame(() => {
        if (this.host) this.host.scrollTop = position?.top ?? 0;
        this.restoring = false;
      });
    });
  }
  ngOnDestroy(): void {
    if (!this.leaving) this.save();
    cancelAnimationFrame(this.frame);
    this.host?.removeEventListener('scroll', this.onScroll);
    this.subscription?.unsubscribe();
  }
}
