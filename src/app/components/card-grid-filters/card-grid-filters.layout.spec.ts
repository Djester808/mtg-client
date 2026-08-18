import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { CardGridFiltersComponent } from './card-grid-filters.component';
import { CardFilters } from '../../models/card-filters';
import { PHONE_QUERY } from '../../shared/breakpoints.service';

/**
 * Geometry, measured in the browser Karma already runs.
 *
 * The sibling spec verifies the bar's behaviour without a TestBed and says the layout is
 * verified in the browser. This is the layout half, and it is here because eyeballing it
 * missed the bug twice: `.cgf-clusters .cgf-left` sets `flex-wrap: wrap` for the dropdown
 * panel, and `display: contents` removes the panel's *box* but not its DOM ancestry, so
 * that rule kept applying to the laid-out bar. The deck's left cluster wrapped onto a
 * second line and every other column sat a line below it. Nothing in 831 behavioural specs
 * could see that, and it only shows on the page with enough projected controls to overflow
 * one line — which is why it looked like the two grids were "behaving differently".
 *
 * `angular.json` puts `src/styles/global.scss` in the Karma harness, so these render
 * against the real cascade, `.cgf-group`/`.cgf-label` included.
 */
@Component({
  standalone: true,
  imports: [CommonModule, CardGridFiltersComponent],
  template: `
    <div [style.width.px]="width">
      <app-card-grid-filters
        [filters]="filters"
        [facets]="true"
        [sortControls]="sortControls"
        [setOptions]="setOptions"
        zoomLabel="100%"
      >
        <ng-container cgfLeft>
          <!-- Side by side, as both pages now project them: Group By then Layout. Stacking
               made the cluster taller than the bar's first grid row and the facet band
               below painted over the Layout buttons, swallowing every click on them. -->
          <div class="cgf-group" *ngFor="let g of leftGroups">
            <span class="cgf-label">{{ g.label }}</span>
            <div class="probe-control" [style.height.px]="g.h" [style.width.px]="g.w"></div>
          </div>
        </ng-container>
        <div class="cgf-group" cgfRight>
          <span class="cgf-label">Display</span>
          <div class="probe-control" style="height: 30px; width: 200px"></div>
        </div>
      </app-card-grid-filters>
    </div>
  `,
})
class HostComponent {
  filters = new CardFilters();
  setOptions = [{ value: '__all', label: 'All Sets' }];
  sortControls = false;
  width = 1400;
  /**
   * Group By and Layout at the widths the deck's real controls measure in the running app
   * (probed at 1366px: the two columns span x=24→128 and x=142→290). With the bar's own
   * Set and Filters columns beside them that is the widest cluster either page builds, so
   * it is the one that decides whether a column can hold its contents.
   */
  leftGroups = [
    { label: 'Group By', h: 38, w: 104 },
    { label: 'Layout', h: 34, w: 148 },
  ];
}

/** Renders at `width` and returns the bar's measured geometry. */
function layoutAt(width: number) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.width = width;
  // Container queries and getBoundingClientRect need the fixture in the document.
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();

  const root: HTMLElement = fixture.nativeElement;
  const left = root.querySelector('.cgf-left') as HTMLElement;
  const right = root.querySelector('.cgf-right') as HTMLElement;
  const center = root.querySelector('.cgf-center') as HTMLElement;

  const result = {
    isWide: getComputedStyle(root.querySelector('.cgf-clusters')!).display === 'contents',
    leftWraps: getComputedStyle(left).flexWrap === 'wrap',
    // > 0 means the column is narrower than the controls in it, and they spill over the
    // name box beside it.
    leftOverflow: left.scrollWidth - left.clientWidth,
    rightOverflow: right.scrollWidth - right.clientWidth,
    // Negative means a cluster's last control has crossed into the box.
    gapLeftToBox: Math.round(
      center.getBoundingClientRect().left - left.getBoundingClientRect().right,
    ),
    gapRightToBox: Math.round(
      right.getBoundingClientRect().left - center.getBoundingClientRect().right,
    ),
    // The captions are the row the eye follows, so every one of them has to share a line.
    // No stacked column is excused any more: nothing stacks.
    distinctLabelTops: new Set(
      Array.from(root.querySelectorAll('.cgf-label')).map((l) =>
        Math.round(l.getBoundingClientRect().top),
      ),
    ).size,
    // A caption block that differs between the bar's own columns and the projected ones is
    // what staggered them before the two definitions were merged into one.
    distinctLabelHeights: new Set(
      Array.from(root.querySelectorAll('.cgf-label')).map((l) =>
        Math.round(l.getBoundingClientRect().height),
      ),
    ).size,
    captions: Array.from(root.querySelectorAll('.cgf-label')).map((l) =>
      (l.textContent ?? '').trim(),
    ),
    // The facet band's width. It is pinned to a fixed 302px BELOW $bp-phone so the block
    // renders identically in every host that mounts it (verify-same.js holds that at 0
    // differing pixels across four contexts). That pin was once written without the
    // breakpoint, which left a 302px phone column stranded in the middle of a 1258px
    // desktop bar on every page with facets — the deck, the collection and home at once.
    facetsWidth: Math.round(
      (root.querySelector('app-filter-facets') as HTMLElement)?.getBoundingClientRect().width ?? 0,
    ),
  };

  document.body.removeChild(fixture.nativeElement);
  return result;
}

describe('CardGridFiltersComponent layout', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  it('projects the page’s own controls into the bar', () => {
    // Guards every measurement below. If the projected groups silently failed to render —
    // a missing CommonModule leaves *ngFor inert — the bar would still lay out and each
    // geometry assertion would pass while measuring nothing that matters.
    const captions = layoutAt(1400).captions;
    expect(captions).toContain('Group By');
    expect(captions).toContain('Layout');
    expect(captions).toContain('Display');
    // Plus the bar's own: Set, Filters, Zoom and the name box.
    expect(captions.length).toBeGreaterThanOrEqual(6);
  });

  it('gives the facet band the bar’s width, not the phone column', () => {
    // Viewport-dependent by design: the 302px pin is a viewport media query, so this
    // asserts nothing on a phone-sized Karma window rather than asserting the opposite.
    if (window.matchMedia(PHONE_QUERY).matches) {
      pending('Karma viewport is phone-width; the 302px pin is correct there');
      return;
    }
    const wide = layoutAt(1400);
    expect(wide.facetsWidth).toBeGreaterThan(900);
  });

  it('lays the controls out on the bar once it is wide enough', () => {
    expect(layoutAt(1400).isWide).toBeTrue();
    // Below the breakpoint everything folds into the menu instead.
    expect(layoutAt(900).isWide).toBeFalse();
  });

  it('never lets the panel’s wrap reach the laid-out bar', () => {
    // The regression: `display: contents` keeps the DOM ancestry, so the panel's
    // `flex-wrap: wrap` matched here and broke the cluster onto a second line.
    expect(layoutAt(1400).leftWraps).toBeFalse();
    expect(layoutAt(1180).leftWraps).toBeFalse();
  });

  it('puts every caption on one line, whatever the controls under them measure', () => {
    // Group By (38px), Layout (34px), Set, Filters, Display (30px) and the taller name box
    // all differ in height. Top alignment is what keeps the captions on a single line; with
    // the columns centred they landed across a 20px spread on the deck.
    expect(layoutAt(1400).distinctLabelTops).toBe(1);
    expect(layoutAt(1180).distinctLabelTops).toBe(1);
  });

  it('gives every cluster the width its controls need, at any bar width', () => {
    // The deck's left cluster — Group By, Layout, Set, Filters — is wider than an equal
    // share of the bar. With `minmax(0, 1fr)` columns it was squeezed below its contents
    // and the Filters chip spilled 17px over the name box at 1366; an auto minimum makes
    // the column take the room it needs instead.
    for (const width of [1180, 1280, 1366, 1500]) {
      const l = layoutAt(width);
      expect(l.leftOverflow).withContext(`left cluster overflows at ${width}px`).toBe(0);
      expect(l.rightOverflow).withContext(`right cluster overflows at ${width}px`).toBe(0);
      expect(l.gapLeftToBox)
        .withContext(`left cluster sits on the name box at ${width}px`)
        .toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps both clusters clear of the centred box at every width', () => {
    for (const width of [1180, 1280, 1366, 1420, 1500]) {
      const l = layoutAt(width);
      expect(l.gapRightToBox)
        .withContext(`right cluster sits on the name box at ${width}px`)
        .toBeGreaterThanOrEqual(0);
    }
  });

  it('captions the bar’s own columns and the projected ones identically', () => {
    // Three copies of this pair had drifted to 10.5px, 9.5px and 9px, and the differing
    // caption heights were half of why the deck's columns sat at the wrong height.
    expect(layoutAt(1400).distinctLabelHeights).toBe(1);
  });
});
