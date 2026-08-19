import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { readSseStream } from '../utils/sse';
import {
  AiApplyPlanRequest,
  AiBuildPlan,
  AiBuildResult,
  AiRefineRequest,
  AiRefineResult,
  AiApplySwapsRequest,
  CommanderSuggestionRequest,
  CommanderSuggestions,
} from '../models/ai-builder.models';

/** What the build reports as it runs. */
export type BuildStreamEvent =
  | { type: 'stage'; label: string; step: number; total: number; named?: number }
  /** The deck, before it has been judged. Usable from here. */
  | { type: 'plan'; plan: AiBuildPlan }
  | { type: 'final'; plan: AiBuildPlan }
  | { type: 'error'; message: string };

/**
 * The AI deck builder: suggest a commander, plan a deck, then write it.
 *
 * Separate from `DeckApiService` because these three calls are one feature with one set of
 * models, and every one of them is a minutes-long model call rather than ordinary CRUD.
 */
@Injectable({ providedIn: 'root' })
export class AiBuilderApiService {
  private readonly base = '/api/decks';

  constructor(
    private http: HttpClient,
    private zone: NgZone,
  ) {}

  /** Commanders that fit what the player described. Does not need a deck to exist. */
  suggestCommanders(request: CommanderSuggestionRequest): Observable<CommanderSuggestions> {
    return this.http.post<CommanderSuggestions>(`${this.base}/commander-suggestions`, request);
  }

  /**
   * Computes the deck without writing it.
   *
   * Slow by nature — the server is reasoning over a full candidate pool — so callers should
   * show progress rather than assume this returns quickly.
   */
  planBuild(
    deckId: string,
    commanderOracleId: string,
    bracket: number,
    priceRange: string,
  ): Observable<AiBuildPlan> {
    return this.http.post<AiBuildPlan>(`${this.base}/${deckId}/ai-build/plan`, {
      commanderOracleId,
      bracket,
      priceRange,
      includeSideboard: false,
      includeMaybeboard: false,
    });
  }

  /**
   * The same build, streamed.
   *
   * The build runs for minutes — the model reasons over the whole legal pool, then a second
   * pass judges the result — so this reports progress and hands over the deck the moment it
   * exists, before it has been assessed. A caller can render the list while the verdict is
   * still being written.
   */
  planBuildStream(
    deckId: string,
    commanderOracleId: string,
    bracket: number,
    priceRange: string,
    token: string | null,
  ): Observable<BuildStreamEvent> {
    return new Observable<BuildStreamEvent>((subscriber) => {
      const controller = new AbortController();
      // Back inside Angular: fetch callbacks land outside the zone, and an OnPush view
      // bound to these events would never repaint.
      const emit = (e: BuildStreamEvent) => this.zone.run(() => subscriber.next(e));

      (async () => {
        try {
          const resp = await fetch(`${this.base}/${deckId}/ai-build/plan/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              commanderOracleId,
              bracket,
              priceRange,
              includeSideboard: false,
              includeMaybeboard: false,
            }),
            signal: controller.signal,
          });

          if (!resp.ok || !resp.body) {
            emit({ type: 'error', message: `Build failed (${resp.status})` });
            this.zone.run(() => subscriber.complete());
            return;
          }

          await readSseStream(resp.body, (frame) => {
            const payload = JSON.parse(frame.data);
            if (frame.event === 'stage') emit({ type: 'stage', ...payload });
            else if (frame.event === 'plan') emit({ type: 'plan', plan: payload });
            else if (frame.event === 'final') emit({ type: 'final', plan: payload });
            else if (frame.event === 'error')
              emit({ type: 'error', message: payload.message ?? 'Build failed' });
          });

          this.zone.run(() => subscriber.complete());
        } catch (err) {
          if (controller.signal.aborted) {
            this.zone.run(() => subscriber.complete());
            return;
          }
          emit({ type: 'error', message: (err as Error)?.message ?? 'Build failed' });
          this.zone.run(() => subscriber.complete());
        }
      })();

      return () => controller.abort();
    });
  }

  /** Writes an accepted plan. The server re-validates every card. */
  applyPlan(deckId: string, request: AiApplyPlanRequest): Observable<AiBuildResult> {
    return this.http.post<AiBuildResult>(`${this.base}/${deckId}/ai-build/apply`, request);
  }

  /**
   * Asks what would improve a saved deck.
   *
   * Always sent as a preview. Refine writes in place with no undo, and the builder's
   * standing promise is that nothing is saved until the player accepts it.
   */
  previewRefine(
    deckId: string,
    request: Omit<AiRefineRequest, 'preview'>,
  ): Observable<AiRefineResult> {
    return this.http.post<AiRefineResult>(`${this.base}/${deckId}/ai-refine`, {
      ...request,
      preview: true,
    });
  }

  /** Writes the swaps the player kept. No model call; the server validates them again. */
  applyRefineSwaps(deckId: string, request: AiApplySwapsRequest): Observable<AiRefineResult> {
    return this.http.post<AiRefineResult>(`${this.base}/${deckId}/ai-refine/apply`, request);
  }
}
