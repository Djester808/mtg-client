import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CandidatePoolDto,
  CardDto,
  CardHistoryEntryDto,
  PricePointDto,
  RulingDto,
  SetSummaryDto,
} from '../models/game.models';

/**
 * Result of scanning a card photo.
 *
 * `setName`/`setCode` are only populated when the API could tie the reading to a real
 * printing of the identified card; they are null when the printing is uncertain. They
 * are never the model's raw guess, so a null here means "unknown", not "failed".
 *
 * `error` covers only the recoverable case where the image was processed but no card
 * could be read. A provider failure is an HTTP 502, not an `error` value.
 */
export interface CardVisionResult {
  cardName: string | null;
  collectorNumber: string | null;
  setName: string | null;
  setCode: string | null;
  oracleId: string | null;
  scryfallId: string | null;
  /** True when the card name resolved against Scryfall. */
  verified: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class GameApiService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  // ---- Card data ------------------------------------------

  loadCard(oracleId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`${this.base}/cards/${oracleId}`);
  }

  /**
   * Daily price history for one printing. Empty until the printing has spent time in a
   * collection — the server only snapshots printings someone owns.
   */
  getPriceHistory(scryfallId: string, days: number): Observable<PricePointDto[]> {
    return this.http.get<PricePointDto[]>(
      `${this.base}/cards/printings/${scryfallId}/price-history`,
      { params: { days } },
    );
  }

  getSets(filterQuery?: string): Observable<SetSummaryDto[]> {
    const params: Record<string, string> = {};
    if (filterQuery?.trim()) params['q'] = filterQuery.trim();
    return this.http.get<SetSummaryDto[]>(`${this.base}/cards/sets`, { params });
  }

  /**
   * The pool a suggestion category was drawn from, for seeing more than the few the
   * model picked. Deterministic — no model involved.
   *
   * @param scope 'latest' | 'gamechangers' | 'all'
   */
  getCandidates(
    commanderOracleId: string,
    q: string,
    scope: string,
    filters: {
      types?: string[];
      cmcMin?: number | null;
      cmcMax?: number | null;
      /** Themes the player asked to build around; changes the scores, so it changes the order. */
      focus?: string[];
      /** 'synergy' asks the server to rank by score. Anything else keeps relevance order. */
      rank?: 'synergy' | 'relevance';
    } = {},
    limit = 30,
    offset = 0,
  ): Observable<CandidatePoolDto> {
    const params: Record<string, string> = {
      commanderOracleId,
      scope,
      limit: String(limit),
      offset: String(offset),
    };
    if (q.trim()) params['q'] = q.trim();
    if (filters.types?.length) params['types'] = filters.types.join(',');
    if (filters.cmcMin != null) params['cmcMin'] = String(filters.cmcMin);
    if (filters.cmcMax != null) params['cmcMax'] = String(filters.cmcMax);
    if (filters.focus?.length) params['focus'] = filters.focus.join(',');
    if (filters.rank) params['rank'] = filters.rank;
    return this.http.get<CandidatePoolDto>(`${this.base}/cards/candidates`, { params });
  }

  getCardRulings(oracleId: string): Observable<RulingDto[]> {
    return this.http.get<RulingDto[]>(`${this.base}/cards/${oracleId}/rulings`);
  }

  /**
   * What the signed-in user has done with this card — added, removed, moved between
   * collections and decks — newest first. Scoped to the caller server-side, so this is
   * their activity, not the card's.
   *
   * Empty for a card untouched since history recording shipped: nothing reconstructs
   * changes made before that, so an empty list is correct rather than a failure.
   */
  getCardHistory(oracleId: string, limit = 100): Observable<CardHistoryEntryDto[]> {
    return this.http.get<CardHistoryEntryDto[]>(`${this.base}/cards/${oracleId}/history`, {
      params: { limit },
    });
  }

  // Printings loading lives in PrintingsService — one cache, one endpoint owner.

  getCardByName(name: string): Observable<CardDto> {
    return this.http.get<CardDto>(`${this.base}/cards/by-name`, { params: { name } });
  }

  identifyCard(imageBase64: string): Observable<CardVisionResult> {
    return this.http.post<CardVisionResult>(`${this.base}/vision/identify-card`, {
      imageBase64,
      mediaType: 'image/jpeg',
    });
  }

  searchCards(
    query: string,
    limit = 60,
    offset = 0,
    sortBy = 'name',
    sortDir = 'asc',
    matchCase = false,
    matchWord = false,
    useRegex = false,
  ): Observable<CardDto[]> {
    return this.http.get<CardDto[]>(`${this.base}/cards/search`, {
      params: { q: query, limit, offset, sortBy, sortDir, matchCase, matchWord, useRegex },
    });
  }
}
