import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AiBuilderApiService, BuildStreamEvent } from './ai-builder-api.service';
import { CommanderSuggestions } from '../models/ai-builder.models';

/** A fetch Response whose body streams the given text. */
function streamingResponse(text: string, ok = true, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return { ok, status, body } as unknown as Response;
}

describe('AiBuilderApiService', () => {
  let service: AiBuilderApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AiBuilderApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for commander suggestions without needing a deck', () => {
    let received: CommanderSuggestions | undefined;
    service
      .suggestCommanders({ brief: 'tokens', colors: ['G'], bracket: 3, ownedOnly: false, count: 4 })
      .subscribe((r) => (received = r));

    const req = http.expectOne('/api/decks/commander-suggestions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.brief).toBe('tokens');
    req.flush({ commanders: [], discarded: 0, skippedByReason: {} });

    expect(received?.commanders).toEqual([]);
  });

  it('applies a plan through the owner endpoint', () => {
    service.applyPlan('deck-1', { commanderOracleId: 'o1', bracket: 3, cards: [] }).subscribe();

    const req = http.expectOne('/api/decks/deck-1/ai-build/apply');
    expect(req.request.method).toBe('POST');
    req.flush({
      cardsAdded: 0,
      sideboardAdded: 0,
      maybeboardAdded: 0,
      cardsSkipped: 0,
      mainTarget: 99,
      mainShortfall: 99,
      skippedByReason: {},
    });
  });

  // ---- Streaming ----------------------------------------------------------

  it('reports stages, then the deck, then the final plan', async () => {
    const sse =
      'event: stage\ndata: {"label":"Choosing","step":2,"total":4}\n\n' +
      'event: plan\ndata: {"commanderName":"C"}\n\n' +
      'event: final\ndata: {"commanderName":"C"}\n\n';
    spyOn(window, 'fetch').and.resolveTo(streamingResponse(sse));

    const seen: BuildStreamEvent[] = [];
    await new Promise<void>((done) =>
      service
        .planBuildStream('deck-1', 'o1', 3, 'any', 'jwt')
        .subscribe({ next: (e) => seen.push(e), complete: () => done() }),
    );

    expect(seen.map((e) => e.type)).toEqual(['stage', 'plan', 'final']);
    expect(seen[0]).toEqual({ type: 'stage', label: 'Choosing', step: 2, total: 4 });
  });

  it('sends the bearer token by hand, since fetch bypasses the interceptor', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(
      streamingResponse('event: final\ndata: {}\n\n'),
    );

    await new Promise<void>((done) =>
      service
        .planBuildStream('deck-1', 'o1', 3, 'any', 'jwt')
        .subscribe({ complete: () => done() }),
    );

    const init = fetchSpy.calls.mostRecent().args[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt');
    expect(init.method).toBe('POST');
  });

  it('reports a failed response as an error event rather than throwing', async () => {
    spyOn(window, 'fetch').and.resolveTo(streamingResponse('', false, 502));

    const seen: BuildStreamEvent[] = [];
    await new Promise<void>((done) =>
      service
        .planBuildStream('deck-1', 'o1', 3, 'any', null)
        .subscribe({ next: (e) => seen.push(e), complete: () => done() }),
    );

    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe('error');
  });

  it('surfaces a server-sent error event', async () => {
    spyOn(window, 'fetch').and.resolveTo(
      streamingResponse('event: error\ndata: {"message":"Failed to build the deck."}\n\n'),
    );

    const seen: BuildStreamEvent[] = [];
    await new Promise<void>((done) =>
      service
        .planBuildStream('deck-1', 'o1', 3, 'any', null)
        .subscribe({ next: (e) => seen.push(e), complete: () => done() }),
    );

    expect(seen[0]).toEqual({ type: 'error', message: 'Failed to build the deck.' });
  });
});
