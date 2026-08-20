import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateGameRequest, GameView } from '../models/play.models';

/**
 * The parts of a game that are a request rather than a conversation.
 *
 * The board's live updates arrive over the hub; this is for starting a game and for the first
 * view after a page load. Without it a refresh shows an empty board until the next action
 * happens to push one, which on a slow turn can be a long time staring at nothing.
 *
 * It returns the same {@link GameView} the hub pushes — the server has exactly one shape for
 * "what this player may see", and there is deliberately no endpoint that returns anything else.
 */
@Injectable({ providedIn: 'root' })
export class PlayApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/games';

  create(request: CreateGameRequest): Observable<{ gameId: string }> {
    return this.http.post<{ gameId: string }>(this.base, request);
  }

  view(gameId: string): Observable<GameView> {
    return this.http.get<GameView>(`${this.base}/${gameId}`);
  }

  log(gameId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/${gameId}/log`);
  }
}
