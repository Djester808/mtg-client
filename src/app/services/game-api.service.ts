import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Store } from '@ngrx/store';
import { GameStateDto, CardDto, RulingDto, SetSummaryDto } from '../models/game.models';
import { GameActions } from '../store/game/game.actions';
import { AppState } from '../store';

interface CreateGameRequest {
  player1Name: string;
  player2Name: string;
  player1DeckList: string[];   // card names, resolved server-side
  player2DeckList: string[];
}

interface CreateGameResponse {
  gameId: string;
  player1Token: string;
  player2Token: string;
}

interface JoinGameResponse {
  gameId: string;
  playerToken: string;
  playerId: string;
  initialState: GameStateDto;
}

@Injectable({ providedIn: 'root' })
export class GameApiService {
  private readonly base = '/api';

  constructor(
    private http: HttpClient,
    private store: Store<AppState>,
  ) {}

  // ---- Game lifecycle -------------------------------------

  createGame(req: CreateGameRequest): Observable<CreateGameResponse> {
    return this.http.post<CreateGameResponse>(`${this.base}/games`, req);
  }

  joinGame(gameId: string, playerToken: string): Observable<JoinGameResponse> {
    return this.http.post<JoinGameResponse>(`${this.base}/games/${gameId}/join`, { playerToken });
  }

  getGameState(gameId: string): Observable<GameStateDto> {
    return this.http.get<GameStateDto>(`${this.base}/games/${gameId}`);
  }

  // ---- Card data ------------------------------------------

  /**
   * Load a card by Scryfall oracle ID.
   * Dispatches CardLoaded to the store for caching.
   */
  loadCard(oracleId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`${this.base}/cards/${oracleId}`).pipe(
      tap(card => this.store.dispatch(GameActions.cardLoaded({ card }))),
    );
  }

  /**
   * Search cards by name (proxied to Scryfall).
   */
  getSets(filterQuery?: string): Observable<SetSummaryDto[]> {
    const params: Record<string, string> = {};
    if (filterQuery?.trim()) params['q'] = filterQuery.trim();
    return this.http.get<SetSummaryDto[]>(`${this.base}/cards/sets`, { params });
  }

  getCardRulings(oracleId: string): Observable<RulingDto[]> {
    return this.http.get<RulingDto[]>(`${this.base}/cards/${oracleId}/rulings`);
  }

  searchCards(
    query: string, limit = 60, offset = 0,
    sortBy = 'name', sortDir = 'asc',
    matchCase = false, matchWord = false, useRegex = false,
  ): Observable<CardDto[]> {
    return this.http.get<CardDto[]>(`${this.base}/cards/search`, {
      params: { q: query, limit, offset, sortBy, sortDir, matchCase, matchWord, useRegex },
    });
  }
}
