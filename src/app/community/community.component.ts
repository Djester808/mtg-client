import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ScrollEdgesDirective } from '../directives/scroll-edges.directive';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, RouterModule, ScrollEdgesDirective],
  templateUrl: './community.component.html',
  styleUrls: ['./community.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityComponent implements OnDestroy {
  @ViewChild('tabs') tabsRef?: ElementRef<HTMLElement>;

  /**
   * Which edges have more strip past them is `appScrollEdges`' job — it puts
   * `can-scroll-left` / `can-scroll-right` on the element and the stylesheet fades that
   * side. This component had its own copy of that listener, its own ResizeObserver and its
   * own pair of signals; the deck's free board then needed the same thing, and a second
   * copy is how two fades drift apart.
   *
   * What stays here is the part that is genuinely this strip's own: bringing the active
   * tab into view once.
   */
  private ro?: ResizeObserver;

  /** Auto-centring happens once. After that the scroll position is the user's. */
  private centred = false;

  constructor(injector: Injector) {
    // Not ngAfterViewInit: routerLinkActive has not stamped `.active` onto a tab by
    // then, so centring found no active tab and silently did nothing — the strip sat at
    // scrollLeft 8 and landing on /community/players left its own tab off-screen.
    afterNextRender(() => this.init(), { injector });
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  private init(): void {
    const el = this.tabsRef?.nativeElement;
    if (!el) return;

    this.tryCentre();

    // The strip is not its final width on first paint — the icon font and the tab labels
    // land after, and it only becomes scrollable once they do. Without watching for that,
    // centring is computed against a geometry that no longer exists a frame later.
    if (typeof ResizeObserver === 'undefined') return;
    this.ro = new ResizeObserver(() => this.tryCentre());
    this.ro.observe(el);
    for (const tab of Array.from(el.children)) this.ro.observe(tab);
  }

  /**
   * Bring the active tab into view, once, as soon as the strip is genuinely scrollable.
   *
   * scrollLeft is set directly rather than via scrollIntoView, which also scrolls every
   * scrollable ancestor and would jump the page body.
   */
  private tryCentre(): void {
    if (this.centred) return;
    const el = this.tabsRef?.nativeElement;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const active = el.querySelector<HTMLElement>('.community-tab.active');
    if (!active) return;

    const target = active.offsetLeft - (el.clientWidth - active.clientWidth) / 2;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
    this.centred = true;
  }
}
