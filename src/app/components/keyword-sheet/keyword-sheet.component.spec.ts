import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { KeywordSheetComponent, keywordFromHref } from './keyword-sheet.component';
import { KeywordDetail } from '../../services/rules-api.service';

function makeKeyword(name = 'Cascade'): KeywordDetail {
  return {
    name,
    category: 'Keyword Ability',
    ruleRef: '702.85',
    definition: 'A keyword ability that may let a player cast a random extra spell.',
    rules: [
      {
        number: '702.85',
        text: name,
        examples: [],
        subrules: [
          {
            number: '702.85a',
            text: 'Cascade is a triggered ability.',
            examples: [],
            subrules: [],
          },
        ],
      },
    ],
  };
}

describe('KeywordSheetComponent', () => {
  let fixture: ComponentFixture<KeywordSheetComponent>;
  let component: KeywordSheetComponent;
  let http: HttpTestingController;
  let link: HTMLAnchorElement;

  // The clicks below are on real anchors with real hrefs, and the whole point of some of
  // them is that the component does *not* cancel them — which in Karma means the runner
  // navigates away mid-suite ("Some of your tests did a full page reload!"). This guard
  // sits on window, so it runs after the component's document listener: it records
  // whether the component cancelled, then cancels itself so nothing actually navigates.
  let interceptedByComponent = false;
  const navigationGuard = (event: Event) => {
    interceptedByComponent = event.defaultPrevented;
    event.preventDefault();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KeywordSheetComponent, HttpClientTestingModule, RouterTestingModule],
    });

    fixture = TestBed.createComponent(KeywordSheetComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Stand in for the anchor OracleSymbolsPipe writes into a card's rules text.
    link = document.createElement('a');
    link.className = 'kw-link';
    link.href = '/kb?kw=Cascade';
    link.textContent = 'Cascade';
    document.body.appendChild(link);

    window.addEventListener('click', navigationGuard);
  });

  afterEach(() => {
    window.removeEventListener('click', navigationGuard);
    link.remove();
    http.verify();
  });

  /** Clicks the keyword link and reports whether the component cancelled the click. */
  function clickLink(init: Partial<MouseEventInit> = {}): boolean {
    interceptedByComponent = false;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    fixture.detectChanges();
    return interceptedByComponent;
  }

  // ---- The defect this exists for --------------------------------

  it('opens over the page instead of navigating away', () => {
    // Tapping a keyword used to leave for /kb in a second tab, losing the card, the
    // search that found it and the scroll position with no way back.
    expect(clickLink()).withContext('navigation must be cancelled').toBeTrue();
    expect(component.open).toBeTrue();

    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Cascade');
    expect(text).toContain('random extra spell');
    expect(text).toContain('702.85a');
  });

  it('closes without touching the page underneath', () => {
    clickLink();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    fixture.detectChanges();

    component.close();
    fixture.detectChanges();

    expect(component.open).toBeFalse();
    expect(fixture.nativeElement.querySelector('.kws-panel')).toBeNull();
  });

  it('survives a host that stops click propagation, like the card modal', () => {
    // The card modal calls stopPropagation() on clicks inside its own content so they do
    // not reach its backdrop and close it. A bubble-phase listener never sees a keyword
    // tapped inside a card — which is the one place this has to work.
    const modal = document.createElement('div');
    modal.addEventListener('click', (e) => e.stopPropagation());
    const nested = document.createElement('a');
    nested.className = 'kw-link';
    nested.href = '/kb?kw=Cascade';
    modal.appendChild(nested);
    document.body.appendChild(modal);

    nested.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.open).withContext('a stopped click must still open the sheet').toBeTrue();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    modal.remove();
  });

  it('closes on Escape', () => {
    clickLink();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    fixture.detectChanges();

    component.onEscape();
    expect(component.open).toBeFalse();
  });

  it('closes when the backdrop is tapped', () => {
    clickLink();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.kws-backdrop') as HTMLElement).click();
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  // ---- Clicks it must not steal -----------------------------------

  it('lets a modified click through so a new tab is still possible', () => {
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(clickLink(init))
        .withContext(`modified click ${JSON.stringify(init)} must not be intercepted`)
        .toBeFalse();
      expect(component.open).toBeFalse();
    }
  });

  it('ignores clicks that are not on a keyword link', () => {
    const other = document.createElement('a');
    other.href = '/deck';
    document.body.appendChild(other);

    interceptedByComponent = false;
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.open).toBeFalse();
    expect(interceptedByComponent).toBeFalse();
    other.remove();
  });

  it('opens from a click on markup nested inside the link', () => {
    const inner = document.createElement('em');
    inner.textContent = 'Cascade';
    link.textContent = '';
    link.appendChild(inner);

    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.open).toBeTrue();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
  });

  // ---- Loading and failure ---------------------------------------

  it('says so when the keyword cannot be loaded', () => {
    clickLink();
    http.expectOne('/api/rules/keywords/Cascade').error(new ProgressEvent('offline'));
    fixture.detectChanges();

    expect(component.failed).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('could not be loaded');
  });

  it('cancels the superseded request rather than racing it', () => {
    component.show('Flying');
    const stale = http.expectOne('/api/rules/keywords/Flying');

    component.show('Cascade');
    const current = http.expectOne('/api/rules/keywords/Cascade');

    expect(stale.cancelled).withContext('the superseded request must be cancelled').toBeTrue();

    current.flush(makeKeyword('Cascade'));
    fixture.detectChanges();

    expect(component.keyword?.name).toBe('Cascade');
  });

  it('offers the full knowledge base entry for the keyword it is showing', () => {
    clickLink();
    http.expectOne('/api/rules/keywords/Cascade').flush(makeKeyword());
    fixture.detectChanges();

    const more: HTMLAnchorElement = fixture.nativeElement.querySelector('.kws-more');
    expect(more).withContext('a way through to the full entry').not.toBeNull();
    expect(more.getAttribute('href')).toBe('/kb?kw=Cascade');
  });
});

describe('keywordFromHref', () => {
  it('reads the keyword out of a link', () => {
    expect(keywordFromHref('/kb?kw=Flying')).toBe('Flying');
  });

  it('decodes a multi-word keyword', () => {
    expect(keywordFromHref('/kb?kw=Double%20Strike')).toBe('Double Strike');
  });

  it('decodes a keyword that ends in punctuation', () => {
    expect(keywordFromHref('/kb?kw=For%20Mirrodin!')).toBe('For Mirrodin!');
  });

  it('stops at the next parameter', () => {
    expect(keywordFromHref('/kb?kw=Haste&x=1')).toBe('Haste');
  });

  it('returns null for anything that is not a keyword link', () => {
    expect(keywordFromHref(null)).toBeNull();
    expect(keywordFromHref('/kb')).toBeNull();
    expect(keywordFromHref('/kb?kw=')).toBeNull();
    expect(keywordFromHref('/kb?kw=%E0%A4%A')).toBeNull(); // malformed escape
  });
});
