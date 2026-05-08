import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CommanderSummary,
  CommanderProfile,
  CommanderCards,
  CommanderHistoryPoint,
  SimilarCommander,
  CommanderDeck,
} from '../models/commander.models';
import { DeckSuggestionsDto } from './deck-api.service';

@Injectable({ providedIn: 'root' })
export class CommandersApiService {
  private readonly base = '/api/commanders';

  constructor(private http: HttpClient) {}

  getTopCommanders(limit = 50, sinceMonths = 0): Observable<CommanderSummary[]> {
    const params: Record<string, number> = { limit };
    if (sinceMonths > 0) params['sinceMonths'] = sinceMonths;
    return this.http.get<CommanderSummary[]>(this.base, { params });
  }

  getCommanderProfile(oracleId: string): Observable<CommanderProfile> {
    return this.http.get<CommanderProfile>(`${this.base}/${oracleId}`);
  }

  getCommanderCards(oracleId: string, limit = 100): Observable<CommanderCards> {
    return this.http.get<CommanderCards>(`${this.base}/${oracleId}/cards`, { params: { limit } });
  }

  getCommanderSuggestions(oracleId: string): Observable<DeckSuggestionsDto> {
    return this.http.get<DeckSuggestionsDto>(`${this.base}/${oracleId}/suggestions`);
  }

  getCommanderHistory(oracleId: string, months = 12): Observable<CommanderHistoryPoint[]> {
    return this.http.get<CommanderHistoryPoint[]>(`${this.base}/${oracleId}/history`, {
      params: { months },
    });
  }

  getSimilarCommanders(oracleId: string, limit = 6): Observable<SimilarCommander[]> {
    return this.http.get<SimilarCommander[]>(`${this.base}/${oracleId}/similar`, {
      params: { limit },
    });
  }

  getCommanderDecks(oracleId: string, limit = 50): Observable<CommanderDeck[]> {
    return this.http.get<CommanderDeck[]>(`${this.base}/${oracleId}/decks`, { params: { limit } });
  }
}
