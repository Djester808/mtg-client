import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CardDto, RulingDto, SetSummaryDto } from '../models/game.models';

@Injectable({ providedIn: 'root' })
export class GameApiService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  // ---- Card data ------------------------------------------

  loadCard(oracleId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`${this.base}/cards/${oracleId}`);
  }

  getSets(filterQuery?: string): Observable<SetSummaryDto[]> {
    const params: Record<string, string> = {};
    if (filterQuery?.trim()) params['q'] = filterQuery.trim();
    return this.http.get<SetSummaryDto[]>(`${this.base}/cards/sets`, { params });
  }

  getCardRulings(oracleId: string): Observable<RulingDto[]> {
    return this.http.get<RulingDto[]>(`${this.base}/cards/${oracleId}/rulings`);
  }

  identifyCard(imageBase64: string): Observable<{ cardName: string | null; error: string | null }> {
    return this.http.post<{ cardName: string | null; error: string | null }>(
      `${this.base}/vision/identify-card`,
      { imageBase64, mediaType: 'image/jpeg' },
    );
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
