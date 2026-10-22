import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateTable, GameTable, TableDeck } from '../models/game-table.models';

/** Account-bound tables. Only the server chooses seat identity and reveals private deck IDs. */
@Injectable({ providedIn: 'root' })
export class GameTableApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/games/lobbies';

  players(search: string): Observable<{ userId: string; username: string }[]> {
    return this.http.get<{ userId: string; username: string }[]>(`${this.base}/players`, {
      params: { search },
    });
  }

  list(): Observable<GameTable[]> {
    return this.http.get<GameTable[]>(this.base);
  }

  get(id: string): Observable<GameTable> {
    return this.http.get<GameTable>(`${this.base}/${encodeURIComponent(id)}`);
  }

  decks(): Observable<TableDeck[]> {
    return this.http.get<TableDeck[]>(`${this.base}/decks`);
  }

  create(request: CreateTable): Observable<GameTable> {
    return this.http.post<GameTable>(this.base, request);
  }

  bringDeck(table: GameTable, deckId: string): Observable<GameTable> {
    return this.http.post<GameTable>(`${this.base}/${encodeURIComponent(table.id)}/deck`, {
      deckId,
      revision: table.revision,
    });
  }

  leave(table: GameTable): Observable<GameTable> {
    return this.http.post<GameTable>(`${this.base}/${encodeURIComponent(table.id)}/leave`, {
      revision: table.revision,
    });
  }

  start(table: GameTable): Observable<{ gameId: string; revision: number }> {
    return this.http.post<{ gameId: string; revision: number }>(
      `${this.base}/${encodeURIComponent(table.id)}/start`,
      { revision: table.revision },
    );
  }
}
