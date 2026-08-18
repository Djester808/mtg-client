import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { CommunityComponent } from './community.component';
import { ScrollEdgesDirective } from '../directives/scroll-edges.directive';

/**
 * The tab strip's two jobs: name the three destinations, and hand its edges to
 * `appScrollEdges`.
 *
 * Centring the active tab is the third, and it is deliberately not here — it only happens
 * once the strip is actually scrollable, which depends on the viewport the runner happens
 * to have. It is covered where that can be controlled: the `community-tabs-players` state
 * in `e2e/shoot-states.js`, which lands on the last tab and reports `activeVisible`.
 */
describe('CommunityComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CommunityComponent],
      providers: [provideRouter([])],
    }),
  );

  it('offers all three community destinations', () => {
    const fixture = TestBed.createComponent(CommunityComponent);
    fixture.detectChanges();

    const tabs: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.community-tab'),
    );
    const text = tabs.map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(tabs.length).toBe(3);
    expect(text[0]).toContain('Decks');
    expect(text[1]).toContain('Commanders');
    expect(text[2]).toContain('Players');
  });

  it('hands the strip to appScrollEdges rather than watching it itself', () => {
    // The component used to carry its own scroll listener, ResizeObserver and pair of
    // signals for this, duplicating the directive the deck board uses. If the attribute
    // is ever dropped the fades die silently — nothing else in the app would notice.
    const fixture = TestBed.createComponent(CommunityComponent);
    fixture.detectChanges();

    const strip = fixture.debugElement.query(By.directive(ScrollEdgesDirective));
    expect(strip).withContext('appScrollEdges applied to the tab strip').not.toBeNull();
    expect(strip.nativeElement.classList).toContain('community-tabs');
  });

  it('drops "Community" from the first label so three tabs fit a phone', () => {
    // The word is redundant — you are on the Community page — and it is what let the
    // three tabs stop being a sliced scrolling strip at 375px.
    const fixture = TestBed.createComponent(CommunityComponent);
    fixture.detectChanges();

    const optional = fixture.nativeElement.querySelector('.tab-word-optional');
    expect(optional).withContext('the droppable word is its own element').not.toBeNull();
    expect((optional.textContent ?? '').trim()).toBe('Community');
  });
});
