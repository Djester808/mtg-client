import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollEdgesDirective } from './scroll-edges.directive';

@Component({
  standalone: true,
  imports: [ScrollEdgesDirective],
  template: `
    <div class="strip" appScrollEdges style="width: 120px; overflow-x: auto">
      <div class="content" [style.width.px]="width" style="height: 20px"></div>
    </div>
  `,
})
class HostComponent {
  width = 400;
}

/**
 * The element has no geometry until it is in the document, and the directive learns its
 * real size from a ResizeObserver — which is exactly the case it exists for, since a strip
 * is never its final width on first paint. So these wait for that observation rather than
 * asserting into an unlaid-out box.
 */
async function mount(width: number) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.width = width;
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const el = fixture.nativeElement.querySelector('.strip') as HTMLElement;
  return { fixture, el, done: () => document.body.removeChild(fixture.nativeElement) };
}

/** Re-reads after a programmatic scroll, which fires no event in some engines. */
function scrollTo(el: HTMLElement, left: number) {
  el.scrollLeft = left;
  el.dispatchEvent(new Event('scroll'));
}

describe('ScrollEdgesDirective', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  it('marks the right edge while there is content past it', async () => {
    const { el, done } = await mount(400);
    expect(el.classList.contains('can-scroll-right')).toBeTrue();
    expect(el.classList.contains('can-scroll-left')).withContext('at the start').toBeFalse();
    done();
  });

  it('marks both edges in the middle and only the left at the end', async () => {
    const { el, done } = await mount(400);

    scrollTo(el, 100);
    expect(el.classList.contains('can-scroll-left')).toBeTrue();
    expect(el.classList.contains('can-scroll-right')).toBeTrue();

    scrollTo(el, el.scrollWidth - el.clientWidth);
    expect(el.classList.contains('can-scroll-left')).toBeTrue();
    expect(el.classList.contains('can-scroll-right'))
      .withContext('nothing past the right edge at the end')
      .toBeFalse();

    done();
  });

  it('marks neither edge when the content fits', async () => {
    // The fade is the whole point of the directive, and a fade over an edge with nothing
    // past it dims content for no reason.
    const { el, done } = await mount(60);
    expect(el.classList.contains('can-scroll-left')).toBeFalse();
    expect(el.classList.contains('can-scroll-right')).toBeFalse();
    done();
  });
});
