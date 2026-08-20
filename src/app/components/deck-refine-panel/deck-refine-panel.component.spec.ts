import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DeckRefinePanelComponent } from './deck-refine-panel.component';
import { ToastService } from '../../services/toast.service';
import { AiRefineResult } from '../../models/ai-builder.models';

/**
 * The panel's job is to make refine safe to press.
 *
 * Refine rewrites a saved deck in place and there is no undo, so the panel must never call
 * it for real without showing what would happen first — the builder's standing promise is
 * that nothing is saved until the player accepts it.
 */
describe('DeckRefinePanelComponent', () => {
  let http: HttpTestingController;
  let toasts: string[];

  const result = (over: Partial<AiRefineResult> = {}): AiRefineResult => ({
    swaps: [
      { out: 'Weak Card', in: 'Strong Card', why: 'Better rate.' },
      { out: 'Filler', in: 'Payoff', why: 'Serves the plan.' },
    ],
    rejectedByReason: {},
    deckSizeBefore: 99,
    deckSizeAfter: 99,
    ...over,
  });

  function create(mainCount = 99): ComponentFixture<DeckRefinePanelComponent> {
    const fixture = TestBed.createComponent(DeckRefinePanelComponent);
    fixture.componentRef.setInput('deckId', 'deck-1');
    fixture.componentRef.setInput('mainCount', mainCount);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    toasts = [];
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, DeckRefinePanelComponent],
      providers: [
        {
          provide: ToastService,
          useValue: {
            show: (m: string) => toasts.push(m),
            error: (m: string) => toasts.push('ERR ' + m),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for a preview, never a write', () => {
    const fixture = create();
    fixture.componentInstance.ask();

    const req = http.expectOne('/api/decks/deck-1/ai-refine');
    expect(req.request.body.preview).withContext('must never write unasked').toBeTrue();
    req.flush(result());

    expect(fixture.componentInstance.state).toBe('review');
    expect(fixture.componentInstance.proposals.length).toBe(2);
  });

  it('keeps every proposal until one is dropped', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result());

    expect(page.keptCount).toBe(2);

    page.toggle(page.proposals[0]);
    expect(page.keptCount).toBe(1);
    // Dropped rows stay in the list so the decision can be revised.
    expect(page.proposals.length).toBe(2);
  });

  it('applies only the swaps that were kept', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result());

    page.toggle(page.proposals[0]);
    page.apply();

    const req = http.expectOne('/api/decks/deck-1/ai-refine/apply');
    expect(req.request.body.swaps.length).toBe(1);
    expect(req.request.body.swaps[0].in).toBe('Payoff');
    req.flush(result({ swaps: [{ out: 'Filler', in: 'Payoff', why: '' }] }));

    expect(toasts).toContain('Swapped 1 card');
    expect(page.state).toBe('idle');
  });

  it('tells the deck to reload once something was written', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    let reloaded = 0;
    page.deckChanged.subscribe(() => reloaded++);

    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result());
    page.apply();
    http.expectOne('/api/decks/deck-1/ai-refine/apply').flush(result());

    expect(reloaded).toBe(1);
  });

  it('discards a proposal without calling the server', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result());

    page.discard();

    expect(page.proposals).toEqual([]);
    expect(page.state).toBe('idle');
    http.expectNone(() => true);
  });

  it('says so when there is nothing worth swapping', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result({ swaps: [] }));

    expect(page.state).toBe('review');
    expect(page.proposals).toEqual([]);
    expect(page.keptCount).toBe(0);
  });

  it('says there is nothing to refine before asking, when the deck is empty', () => {
    // The tool button stays visible whatever the deck holds — the mana panel set that
    // precedent, and a tool that vanishes is a tool nobody finds. So the panel is what has
    // to be honest, and it says so up front rather than after a round trip.
    const fixture = create(0);
    const el: HTMLElement = fixture.nativeElement;

    expect(fixture.componentInstance.nothingToRefine).toBeTrue();
    expect(el.querySelector('.rf-empty-state')).toBeTruthy();
    expect(el.querySelector('.rf-intro'))
      .withContext('no invitation to ask for something that cannot be answered')
      .toBeNull();
    http.expectNone(() => true);
  });

  it('invites the ask once the deck has cards', () => {
    const fixture = create(99);
    const el: HTMLElement = fixture.nativeElement;

    expect(fixture.componentInstance.nothingToRefine).toBeFalse();
    expect(el.querySelector('.rf-empty-state')).toBeNull();
    expect(el.querySelector('.rf-intro')).toBeTruthy();
  });

  it('does not claim a verdict on a deck with nothing in it', () => {
    // The server returns no swaps for an empty deck without calling the model, so
    // "nothing worth swapping" would be a verdict it never formed. deckSizeBefore of 1 is
    // the commander alone.
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http
      .expectOne('/api/decks/deck-1/ai-refine')
      .flush(result({ swaps: [], deckSizeBefore: 1, deckSizeAfter: 1 }));

    expect(page.hadCards).toBeFalse();
  });

  it('does claim one when the deck had cards and none were worth swapping', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http
      .expectOne('/api/decks/deck-1/ai-refine')
      .flush(result({ swaps: [], deckSizeBefore: 99, deckSizeAfter: 99 }));

    expect(page.hadCards).toBeTrue();
  });

  it('surfaces what the server refused rather than hiding it', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http
      .expectOne('/api/decks/deck-1/ai-refine')
      .flush(result({ rejectedByReason: { 'out-card-not-in-deck': 2 } }));

    expect(page.rejectedSummary).toBe('out-card-not-in-deck ×2');
  });

  it('reports a failed preview without losing the panel', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http
      .expectOne('/api/decks/deck-1/ai-refine')
      .flush({ detail: 'nope' }, { status: 502, statusText: 'Bad Gateway' });

    expect(page.state).toBe('idle');
    expect(page.error).toBeTruthy();
  });

  it('keeps the proposal on screen when applying fails', () => {
    // The player still has a decision in front of them; throwing it away would make them
    // pay for the model call twice.
    const fixture = create();
    const page = fixture.componentInstance;
    page.ask();
    http.expectOne('/api/decks/deck-1/ai-refine').flush(result());

    page.apply();
    http
      .expectOne('/api/decks/deck-1/ai-refine/apply')
      .flush({ detail: 'nope' }, { status: 500, statusText: 'Server Error' });

    expect(page.state).toBe('review');
    expect(page.proposals.length).toBe(2);
  });
});
