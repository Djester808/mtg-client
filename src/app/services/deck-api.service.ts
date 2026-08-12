import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CollectionCardDto,
  AddCardToCollectionRequest,
  UpdateCollectionCardRequest,
  PrintingDto,
  CardDto,
} from '../models/game.models';

export interface DeckDto {
  id: string;
  name: string;
  coverUri: string | null;
  format: string | null;
  commanderOracleId: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckDetailDto {
  id: string;
  name: string;
  coverUri: string | null;
  format: string | null;
  commanderOracleId: string | null;
  tags: string[];
  notes: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  cards: CollectionCardDto[];
}

export interface CreateDeckRequest {
  name: string;
  coverUri?: string | null;
  format?: string | null;
  commanderOracleId?: string | null;
}

export interface UpdateDeckRequest {
  name: string;
  coverUri?: string | null;
  format?: string | null;
  commanderOracleId?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface ImportDeckRequest {
  name: string;
  text?: string;
  url?: string;
  format?: string | null;
}

export interface ImportDeckResult {
  deck: DeckDetailDto;
  cardsResolved: number;
  cardsTotal: number;
  unresolvedCards: string[];
}

export interface SynergyRequest {
  commanderOracleId: string;
  commanderName: string;
  commanderText: string;
  cardOracleId: string;
  cardName: string;
  cardText: string;
  deckCardNames?: string[];
}

export interface SynergyResult {
  score: number;
  reason: string;
}

export interface ScoredCardDto {
  oracleId: string;
  name: string;
  score: number;
  reason: string;
}

export interface SuggestedCardDto {
  name: string;
  reason: string;
  score: number;
  scryfallId: string | null;
  card: import('../models/game.models').CardDto | null;
}

export interface RecentSetDto {
  code: string;
  name: string;
  releasedAt: string;
  legalCardCount: number;
}

export interface DeckSuggestionsDto {
  latestSet: SuggestedCardDto[];
  topSynergy: SuggestedCardDto[];
  gameChangers: SuggestedCardDto[];
  /** Which sets latestSet was actually drawn from, so the label can name them. */
  latestSetSources?: RecentSetDto[];
}

export interface DeckSuggestionsRequest {
  commanderOracleId: string;
  commanderName: string;
  commanderText: string;
  deckCardNames: string[];
  deckTags?: string[];
  suggestionTags?: string[];
}

/**
 * Events streamed from the suggestions SSE endpoint.
 * - `stage`: a coarse progress step to show under the spinner.
 * - `cards`: the provisional (pre-judge) lists — render them right away.
 * - `final`: the validated result; replaces whatever `cards` showed.
 * - `error`: generation failed.
 */
export type SuggestionStreamEvent =
  | { type: 'stage'; label: string; step: number; total: number }
  | { type: 'cards'; data: DeckSuggestionsDto }
  | { type: 'final'; data: DeckSuggestionsDto }
  | { type: 'error'; message: string };

export interface ManaFineTuneRequest {
  format: string;
  deckCardNames: string[];
  currentLands: number;
  recommendedLands: number;
  avgCmc: number;
  activeColors: string[];
}

export interface ManaLandSuggestion {
  name: string;
  reason: string;
  /** Newest printing, preselected server-side so the card can be added directly. */
  scryfallId: string | null;
  /** Resolved card data; the server drops suggestions it cannot resolve. */
  card: CardDto | null;
}

export interface ManaFineTuneDto {
  advice: string[];
  landSuggestions: ManaLandSuggestion[];
}

@Injectable({ providedIn: 'root' })
export class DeckApiService {
  private readonly base = '/api/decks';

  constructor(
    private http: HttpClient,
    private zone: NgZone,
  ) {}

  getDecks(): Observable<DeckDto[]> {
    return this.http.get<DeckDto[]>(this.base);
  }

  getDeck(id: string): Observable<DeckDetailDto> {
    return this.http.get<DeckDetailDto>(`${this.base}/${id}`);
  }

  createDeck(req: CreateDeckRequest): Observable<DeckDetailDto> {
    return this.http.post<DeckDetailDto>(this.base, req);
  }

  updateDeck(id: string, req: UpdateDeckRequest): Observable<DeckDetailDto> {
    return this.http.put<DeckDetailDto>(`${this.base}/${id}`, req);
  }

  deleteDeck(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addCard(deckId: string, req: AddCardToCollectionRequest): Observable<CollectionCardDto> {
    return this.http.post<CollectionCardDto>(`${this.base}/${deckId}/cards`, req);
  }

  updateCard(
    deckId: string,
    cardId: string,
    req: UpdateCollectionCardRequest,
  ): Observable<CollectionCardDto> {
    return this.http.put<CollectionCardDto>(`${this.base}/${deckId}/cards/${cardId}`, req);
  }

  removeCard(deckId: string, cardId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${deckId}/cards/${cardId}`);
  }

  importDeck(req: ImportDeckRequest): Observable<ImportDeckResult> {
    return this.http.post<ImportDeckResult>(`${this.base}/import`, req);
  }

  analyzeSynergy(req: SynergyRequest): Observable<SynergyResult> {
    return this.http.post<SynergyResult>(`${this.base}/synergy`, req);
  }

  /** Scores a page of cards in one request instead of one per row. */
  /**
   * @param focus Themes the player asked to build around. Scoring without them answers a
   * different question, so the same card comes back with a different percentage than the
   * suggestion lists show — which is exactly what happened before this was passed through.
   */
  analyzeSynergyBatch(
    commanderOracleId: string,
    cardOracleIds: string[],
    focus: string[] = [],
  ): Observable<ScoredCardDto[]> {
    return this.http.post<ScoredCardDto[]>(`${this.base}/synergy/batch`, {
      commanderOracleId,
      cardOracleIds,
      focus,
    });
  }

  /**
   * Streams suggestion progress over Server-Sent Events so the panel can show stages and
   * reveal cards before the (slow) reason-grounding finishes. Uses `fetch` rather than
   * HttpClient because we need to read the response body incrementally; the JWT is attached
   * manually since the HttpClient interceptor does not run here. Emissions are marshalled
   * back into Angular's zone so OnPush change detection fires. Unsubscribe aborts the request.
   */
  getSuggestionsStream(req: DeckSuggestionsRequest): Observable<SuggestionStreamEvent> {
    return new Observable<SuggestionStreamEvent>((subscriber) => {
      const controller = new AbortController();
      const token = localStorage.getItem('auth_token');

      const emit = (ev: SuggestionStreamEvent) => this.zone.run(() => subscriber.next(ev));

      const parseFrame = (frame: string): SuggestionStreamEvent | null => {
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return null;
        let payload: unknown;
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch {
          return null;
        }
        if (event === 'stage') {
          const p = payload as { label: string; step: number; total: number };
          return { type: 'stage', label: p.label, step: p.step, total: p.total };
        }
        if (event === 'cards') return { type: 'cards', data: payload as DeckSuggestionsDto };
        if (event === 'final') return { type: 'final', data: payload as DeckSuggestionsDto };
        if (event === 'error')
          return { type: 'error', message: (payload as { message?: string }).message ?? 'Failed' };
        return null;
      };

      (async () => {
        try {
          const resp = await fetch(`${this.base}/suggestions/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(req),
            signal: controller.signal,
          });

          if (!resp.ok || !resp.body) {
            emit({ type: 'error', message: `Request failed (${resp.status})` });
            this.zone.run(() => subscriber.complete());
            return;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep: number;
            // SSE frames are separated by a blank line (\n\n).
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              const parsed = parseFrame(frame);
              if (parsed) emit(parsed);
            }
          }
          this.zone.run(() => subscriber.complete());
        } catch (err) {
          if (controller.signal.aborted) {
            this.zone.run(() => subscriber.complete());
            return;
          }
          emit({ type: 'error', message: (err as Error)?.message ?? 'Stream failed' });
          this.zone.run(() => subscriber.complete());
        }
      })();

      return () => controller.abort();
    });
  }

  getManaFineTune(req: ManaFineTuneRequest): Observable<ManaFineTuneDto> {
    return this.http.post<ManaFineTuneDto>(`${this.base}/mana-tune`, req);
  }

  getPrintings(oracleId: string): Observable<PrintingDto[]> {
    return this.http.get<PrintingDto[]>(`/api/cards/${oracleId}/printings`);
  }

  getCardByScryfallId(scryfallId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`/api/cards/scryfall/${scryfallId}`);
  }

  getCardByName(name: string): Observable<CardDto | null> {
    const n = encodeURIComponent(name);
    return this.http.get<CardDto>(`/api/cards/by-name?name=${n}`).pipe(catchError(() => of(null)));
  }

  aiBuildDeck(
    deckId: string,
    commanderOracleId: string,
    bracket: number = 3,
    priceRange: string = 'any',
    includeSideboard: boolean = false,
    includeMaybeboard: boolean = false,
  ): Observable<{
    cardsAdded: number;
    sideboardAdded: number;
    maybeboardAdded: number;
    cardsSkipped: number;
  }> {
    return this.http.post<{
      cardsAdded: number;
      sideboardAdded: number;
      maybeboardAdded: number;
      cardsSkipped: number;
    }>(`${this.base}/${deckId}/ai-build`, {
      commanderOracleId,
      bracket,
      priceRange,
      includeSideboard,
      includeMaybeboard,
    });
  }
}
