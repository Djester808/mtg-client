import { Injectable, Signal, signal } from '@angular/core';

/**
 * The viewport widths, mirroring `styles/_breakpoints.scss`. Exported so a spec can ask the
 * same question the app does rather than restating the number.
 */
export const PHONE_QUERY = '(max-width: 639.98px)';
export const NAV_COLLAPSED_QUERY = '(max-width: 899.98px)';

/**
 * The viewport questions the TypeScript side asks.
 *
 * Nearly everything responsive belongs in a stylesheet, and does. What cannot go there is
 * a decision about which of two *parents* a control is rendered under, which list a
 * component is handed, or whether a piece of state still means anything at this width —
 * CSS can move a box, but it cannot reparent a node, swap an array, or close a menu.
 *
 * Those decisions had grown four inline `matchMedia('(max-width: 639.98px)')` strings
 * across three components and a spec, which is a breakpoint living in five places and
 * agreeing with the stylesheet only by luck. This is the one place that holds them.
 *
 * Signals rather than callbacks: a template reading `isPhone()` registers the dependency
 * and an OnPush component re-renders on the flip with nothing else wired up.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointsService {
  /** `$bp-phone`. Below this the narrow layouts apply. */
  readonly isPhone = this.watch(PHONE_QUERY);

  /** `$bp-nav`. Below this the navbar is collapsed to its drawer. */
  readonly isNavCollapsed = this.watch(NAV_COLLAPSED_QUERY);

  /**
   * No listener teardown: this is a root singleton, so its queries live exactly as long as
   * the application does. Server-side or in a stripped test environment there is no
   * `matchMedia`, and every question answers "no" — the wide layout, which is the one that
   * renders correctly without JavaScript.
   */
  private watch(query: string): Signal<boolean> {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return signal(false).asReadonly();
    }
    const mql = window.matchMedia(query);
    const state = signal(mql.matches);
    mql.addEventListener('change', (e) => state.set(e.matches));
    return state.asReadonly();
  }
}
