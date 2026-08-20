import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { AiDeckBuilderComponent } from './ai-deck-builder.component';
import { ToastService } from '../../services/toast.service';
import { AiBuildPlan, CommanderSuggestion, PlannedCard } from '../../models/ai-builder.models';
import { Subject } from 'rxjs';
import { AiBuilderApiService, BuildStreamEvent } from '../../services/ai-builder-api.service';

function commander(overrides: Partial<CommanderSuggestion> = {}): CommanderSuggestion {
  return {
    oracleId: 'oracle-1',
    name: 'Test Commander',
    manaCost: '{2}{G}',
    typeLine: 'Legendary Creature — Elf',
    oracleText: 'Does a thing.',
    imageUriArtCrop: null,
    imageUriNormal: null,
    colorIdentity: ['G'],
    reason: 'Its attack trigger makes a token every combat.',
    archetype: 'tokens',
    plan: 'Go wide, then overrun.',
    owned: false,
    ...overrides,
  };
}

function emptyAssessment() {
  return {
    verdict: 'It works.',
    findings: [{ area: 'Mana', severity: 'improve', finding: '0 lands', fix: 'add lands' }],
    facts: {
      cards: 1,
      lands: 0,
      ramp: 0,
      draw: 0,
      interaction: 0,
      interactionOnCreatures: 0,
      other: 1,
      creatures: 1,
      creaturePercentOfNonland: 100,
      manaSources: 0,
      averageManaValue: 1,
      colorSources: [{ color: 'G', count: 0 }],
    },
  };
}

function planFor(_deckId: string): AiBuildPlan {
  return {
    commanderOracleId: 'oracle-1',
    commanderName: 'Test Commander',
    cards: [card('Forest', 'Basic Land — Forest')],
    mainTarget: 99,
    mainShortfall: 98,
    cardsSkipped: 0,
    skippedByReason: {},
    assessment: emptyAssessment(),
  };
}

function card(name: string, typeLine: string): PlannedCard {
  return {
    oracleId: 'o-' + name,
    name,
    scryfallId: 's-' + name,
    manaCost: '{G}',
    typeLine,
    imageUriArtCrop: null,
    board: 'main',
    quantity: 1,
  };
}

describe('AiDeckBuilderComponent', () => {
  let http: HttpTestingController;
  let toasts: string[];

  beforeEach(() => {
    toasts = [];
    TestBed.configureTestingModule({
      imports: [AiDeckBuilderComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        // DeckApiService reaches for the store; the builder never dispatches through it.
        provideMockStore({ initialState: { deck: { decks: [] } } }),
        {
          provide: ToastService,
          useValue: {
            show: (m: string) => toasts.push(m),
            error: (m: string) => toasts.push(`error:${m}`),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Global, so it is cleared whatever the spec did. Clearing it in the body only happens
    // when nothing above threw, and a leaked token outlives the spec that set it.
    localStorage.removeItem('auth_token');
    http.verify();
  });

  function create() {
    const fixture = TestBed.createComponent(AiDeckBuilderComponent);
    fixture.detectChanges();
    return fixture;
  }

  function suggest(fixture: ReturnType<typeof create>, commanders: CommanderSuggestion[]) {
    fixture.componentInstance.suggestCommanders();
    http.expectOne('/api/decks/commander-suggestions').flush({
      commanders,
      discarded: 0,
      skippedByReason: {},
    });
    fixture.detectChanges();
  }

  it('sends the brief, colours and bracket the player chose', () => {
    const fixture = create();
    const page = fixture.componentInstance;

    page.brief = '  lots of tokens  ';
    page.toggleColor('G');
    page.toggleColor('W');
    page.bracket = 4;
    page.ownedOnly = true;
    page.suggestCommanders();

    const req = http.expectOne('/api/decks/commander-suggestions');
    expect(req.request.body.brief).toBe('lots of tokens');
    expect(req.request.body.colors).toEqual(['G', 'W']);
    expect(req.request.body.bracket).toBe(4);
    expect(req.request.body.ownedOnly).toBeTrue();

    req.flush({ commanders: [commander()], discarded: 0, skippedByReason: {} });
    expect(page.step).toBe('commanders');
  });

  it('sends a null brief rather than an empty string', () => {
    const fixture = create();
    fixture.componentInstance.suggestCommanders();

    const req = http.expectOne('/api/decks/commander-suggestions');
    expect(req.request.body.brief).toBeNull();
    req.flush({ commanders: [commander()], discarded: 0, skippedByReason: {} });
  });

  it('explains an empty result instead of showing a blank step', () => {
    // Colours plus owned-only can legitimately match nothing, and that is not an error.
    const fixture = create();
    fixture.componentInstance.suggestCommanders();
    http
      .expectOne('/api/decks/commander-suggestions')
      .flush({ commanders: [], discarded: 0, skippedByReason: { 'empty-pool': 1 } });
    fixture.detectChanges();

    expect(fixture.componentInstance.step).toBe('brief');
    expect(fixture.componentInstance.error).toContain('No commanders matched');
  });

  it('creates the deck, then streams the build into it, writing nothing yet', () => {
    const fixture = create();
    suggest(fixture, [commander()]);

    // The build runs over SSE via fetch, so it is stubbed at the service rather than
    // through HttpTestingController, which only sees HttpClient.
    const events = new Subject<BuildStreamEvent>();
    const api = TestBed.inject(AiBuilderApiService);
    const stream = spyOn(api, 'planBuildStream').and.returnValue(events.asObservable());

    fixture.componentInstance.buildAround(commander());

    const created = http.expectOne((r) => r.url === '/api/decks' && r.method === 'POST');
    expect(created.request.body.commanderOracleId).toBe('oracle-1');
    created.flush({ id: 'deck-9', name: 'Test Commander', cards: [] });

    expect(stream).toHaveBeenCalled();

    // Stages move the indicator without ending the wait.
    events.next({ type: 'stage', label: 'Choosing ninety-nine cards', step: 2, total: 4 });
    fixture.detectChanges();
    expect(fixture.componentInstance.stageLabel).toBe('Choosing ninety-nine cards');

    // Nothing measurable yet: the model emits no output for the first ~160s, so the bar
    // sweeps rather than claiming a percentage it cannot know.
    expect(fixture.componentInstance.indeterminate).toBeTrue();
    expect(fixture.componentInstance.progress).toBe(0);

    // Once names arrive it becomes a real measure.
    events.next({
      type: 'stage',
      label: 'Choosing cards — 33 named',
      step: 2,
      total: 4,
      named: 33,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.indeterminate).toBeFalse();
    expect(fixture.componentInstance.progress).toBe(33);

    // The deck arrives before the verdict, and is shown straight away.
    events.next({ type: 'plan', plan: planFor('deck-9') });
    fixture.detectChanges();
    expect(fixture.componentInstance.step).toBe('plan');
    expect(fixture.componentInstance.assessing).withContext('verdict still pending').toBeTrue();

    events.next({ type: 'final', plan: planFor('deck-9') });
    fixture.detectChanges();
    expect(fixture.componentInstance.assessing).toBeFalse();

    // Still nothing written.
    http.expectNone((r) => r.url.includes('ai-build/apply'));

    // The screen still owns this deck, so tearing it down deletes it — that is the feature,
    // not a stray request. Consumed explicitly, because leaving it to the automatic teardown
    // races the suite's http.verify(): whichever runs first decides whether this spec passes,
    // and Jasmine shuffles spec order on every run.
    fixture.destroy();
    http.expectOne((r) => r.url === '/api/decks/deck-9' && r.method === 'DELETE').flush(null);
  });

  it('shows only the commander being built once one is chosen', () => {
    const fixture = create();
    const other = commander({ oracleId: 'oracle-2', name: 'Other Commander' });
    suggest(fixture, [commander(), other]);

    expect(fixture.componentInstance.visibleCommanders.length).toBe(2);

    const events = new Subject<BuildStreamEvent>();
    spyOn(TestBed.inject(AiBuilderApiService), 'planBuildStream').and.returnValue(
      events.asObservable(),
    );
    fixture.componentInstance.buildAround(other);
    http.expectOne((r) => r.url === '/api/decks').flush({ id: 'd', name: 'x', cards: [] });
    fixture.detectChanges();

    // The others are no longer choices; leaving them on screen invites a dead click.
    const visible = fixture.componentInstance.visibleCommanders;
    expect(visible.length).toBe(1);
    expect(visible[0].oracleId).toBe('oracle-2');

    // The screen still owns this deck, so tearing it down deletes it — that is the feature,
    // not a stray request. Consumed explicitly, because leaving it to the automatic teardown
    // races the suite's http.verify(): whichever runs first decides whether this spec passes,
    // and Jasmine shuffles spec order on every run.
    fixture.destroy();
    http.expectOne((r) => r.url === '/api/decks/d' && r.method === 'DELETE').flush(null);
  });

  it('writes only once the player accepts, then opens the deck', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.deckId = 'deck-9';
    page.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [card('Forest', 'Basic Land — Forest')],
      mainTarget: 99,
      mainShortfall: 98,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    page.acceptPlan();

    const applied = http.expectOne('/api/decks/deck-9/ai-build/apply');
    expect(applied.request.body.cards.length).toBe(1);
    applied.flush({
      cardsAdded: 1,
      sideboardAdded: 0,
      maybeboardAdded: 0,
      cardsSkipped: 0,
      mainTarget: 99,
      mainShortfall: 98,
      skippedByReason: {},
    });

    expect(toasts).toContain('Added 1 cards');
    expect(navigate).toHaveBeenCalledWith(['/deck', 'deck-9']);
  });

  it('discards a plan for a deck it did not create without calling the server', () => {
    // No deck was created by this screen here, so there is nothing of its own to clean up
    // and the discard stays local. The case where it did create one is below.
    const fixture = create();
    const page = fixture.componentInstance;
    page.step = 'plan';
    page.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [card('Forest', 'Basic Land — Forest')],
      mainTarget: 99,
      mainShortfall: 0,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    page.discardPlan();

    expect(page.plan).toBeNull();
    expect(page.step).toBe('commanders');
    http.expectNone(() => true);
  });

  /** Drives the screen to a finished plan on a deck it created itself. */
  function buildToPlan(fixture: ComponentFixture<AiDeckBuilderComponent>) {
    suggest(fixture, [commander()]);
    const events = new Subject<BuildStreamEvent>();
    spyOn(TestBed.inject(AiBuilderApiService), 'planBuildStream').and.returnValue(
      events.asObservable(),
    );

    fixture.componentInstance.buildAround(commander());
    http
      .expectOne((r) => r.url === '/api/decks' && r.method === 'POST')
      .flush({ id: 'deck-9', name: 'Test Commander', cards: [] });

    events.next({ type: 'final', plan: planFor('deck-9') });
    fixture.detectChanges();
    return events;
  }

  it('deletes the deck it created when the plan is discarded', () => {
    // The build needs somewhere to write before the player has agreed to anything, so the
    // deck is created up front. Discarding has to take it away again: left alone, every
    // abandoned build put an empty deck named after a commander in the player's list, and
    // 47 of one account's 69 decks were exactly that.
    const fixture = create();
    buildToPlan(fixture);

    fixture.componentInstance.discardPlan();

    const deleted = http.expectOne((r) => r.url === '/api/decks/deck-9' && r.method === 'DELETE');
    deleted.flush(null);
    expect(fixture.componentInstance.step).toBe('commanders');
  });

  it('deletes the deck it created when the player leaves the page', () => {
    // Navigating away is the commoner way to abandon a build, and it left the same orphan.
    const fixture = create();
    buildToPlan(fixture);

    fixture.destroy();

    const cleanup = http.expectOne((r) => r.url === '/api/decks/deck-9' && r.method === 'DELETE');
    expect(cleanup.request.method).withContext('the abandoned deck is deleted').toBe('DELETE');
    cleanup.flush(null);
  });

  it('cleans up on a hard unload, which ngOnDestroy never sees', () => {
    // Closing the tab or reloading tears the page down without running ngOnDestroy, and a
    // request started there dies with the context. Measured against the running app:
    // discard and in-app navigation both cleaned up, a hard unload left the deck every
    // time. keepalive is what survives it.
    const fixture = create();
    buildToPlan(fixture);
    localStorage.setItem('auth_token', 'jwt-1');
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 204 }));

    fixture.componentInstance.onPageHide();

    expect(fetchSpy).toHaveBeenCalled();
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe('/api/decks/deck-9');
    expect(init.method).toBe('DELETE');
    expect(init.keepalive).withContext('must outlive the page').toBeTrue();
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-1');

    // And it must not go a second time when the component is then destroyed.
    fixture.destroy();
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('sends no unload request when there is no deck of its own', () => {
    const fixture = create();
    const fetchSpy = spyOn(window, 'fetch');

    fixture.componentInstance.onPageHide();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the deck once the plan has been accepted', () => {
    const fixture = create();
    buildToPlan(fixture);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    fixture.componentInstance.acceptPlan();
    http.expectOne('/api/decks/deck-9/ai-build/apply').flush({
      cardsAdded: 1,
      sideboardAdded: 0,
      maybeboardAdded: 0,
      cardsSkipped: 0,
      mainTarget: 99,
      mainShortfall: 98,
      skippedByReason: {},
    });

    // From here the deck is the player's, so leaving must not delete it.
    fixture.destroy();
    http.expectNone((r) => r.method === 'DELETE');
    expect(http.match((r) => r.method === 'DELETE').length)
      .withContext('an accepted deck is never cleaned up')
      .toBe(0);
  });

  it('can still clean up after a failed save', () => {
    // The claim is handed over before the write so a mid-write navigation cannot delete
    // the deck. If the write fails it has to come back, or the orphan returns by a
    // different route.
    const fixture = create();
    buildToPlan(fixture);

    fixture.componentInstance.acceptPlan();
    http
      .expectOne('/api/decks/deck-9/ai-build/apply')
      .flush({ detail: 'nope' }, { status: 500, statusText: 'Server Error' });

    fixture.componentInstance.discardPlan();
    const cleanup = http.expectOne((r) => r.url === '/api/decks/deck-9' && r.method === 'DELETE');
    expect(cleanup.request.method).withContext('the orphan is still deleted').toBe('DELETE');
    cleanup.flush(null);
  });

  it('groups the plan into lands, creatures and spells', () => {
    const fixture = create();
    fixture.componentInstance.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [
        card('Forest', 'Basic Land — Forest'),
        card('Elf', 'Creature — Elf'),
        card('Growth', 'Sorcery'),
      ],
      mainTarget: 99,
      mainShortfall: 96,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    const groups = fixture.componentInstance.planByRole;

    expect(groups.map((g) => g.role)).toEqual(['Lands', 'Creatures', 'Spells']);
    expect(groups[0].cards[0].name).toBe('Forest');
  });

  it('keeps the assessment findings closed until asked', () => {
    // Measured at 375x667: a 925-character verdict and eleven findings ran about 2,200px,
    // so the deck the player asked for sat below the critique of it. The verdict stays
    // visible; the findings are one tap away.
    const fixture = create();
    const page = fixture.componentInstance;

    expect(page.findingsOpen).toBeFalse();

    page.toggleFindings();
    expect(page.findingsOpen).toBeTrue();

    page.toggleFindings();
    expect(page.findingsOpen).toBeFalse();
  });

  it('stacks repeated cards instead of printing a row each', () => {
    // A 99-card deck is mostly basics. Printed one per row, the Lands tab was thirty-six
    // identical lines of "Forest" — unreadable, and impossible to check against the count.
    const fixture = create();
    const forests = Array.from({ length: 36 }, () => card('Forest', 'Basic Land — Forest'));
    fixture.componentInstance.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [...forests, card('Swamp', 'Basic Land — Swamp')],
      mainTarget: 99,
      mainShortfall: 62,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    const lands = fixture.componentInstance.planByRole[0];

    // Two rows drawn, thirty-seven cards counted: the tab must still report what the deck
    // actually holds.
    expect(lands.rows.length).toBe(2);
    expect(lands.rows[0].card.name).toBe('Forest');
    expect(lands.rows[0].count).toBe(36);
    expect(lands.rows[1].count).toBe(1);
    expect(lands.cards.length).toBe(37);
  });

  it('keeps two different cards apart even when they stack elsewhere', () => {
    const fixture = create();
    fixture.componentInstance.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [card('Forest', 'Basic Land — Forest'), card('Island', 'Basic Land — Island')],
      mainTarget: 99,
      mainShortfall: 97,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    const rows = fixture.componentInstance.planByRole[0].rows;

    expect(rows.map((r) => r.count)).toEqual([1, 1]);
  });

  it('returns the same grouping instance until the plan changes', () => {
    // The template binds this getter, so it runs on every change-detection pass and would
    // otherwise re-bucket ninety-nine cards each time.
    const fixture = create();
    fixture.componentInstance.plan = {
      commanderOracleId: 'oracle-1',
      commanderName: 'Test Commander',
      cards: [card('Forest', 'Basic Land — Forest')],
      mainTarget: 99,
      mainShortfall: 98,
      cardsSkipped: 0,
      skippedByReason: {},
      assessment: emptyAssessment(),
    };

    const first = fixture.componentInstance.planByRole;
    expect(fixture.componentInstance.planByRole).toBe(first);
  });

  it('reports a failed suggestion without leaving the step', () => {
    const fixture = create();
    fixture.componentInstance.suggestCommanders();
    http
      .expectOne('/api/decks/commander-suggestions')
      .flush({ detail: 'The AI provider timed out.' }, { status: 504, statusText: 'Timeout' });
    fixture.detectChanges();

    expect(fixture.componentInstance.step).toBe('brief');
    expect(fixture.componentInstance.error).toBe('The AI provider timed out.');
    expect(fixture.componentInstance.suggesting).toBeFalse();
  });
});
