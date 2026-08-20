import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateInviteRequest, GameInvite, GameView, PlayableDeck } from '../models/play.models';

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

  /** The caller's own decks. There is deliberately no endpoint for anyone else's. */
  decks(): Observable<PlayableDeck[]> {
    return this.http.get<PlayableDeck[]>(`${this.base}/decks`);
  }

  /** Community members who could be invited. */
  players(): Observable<{ userId: string; username: string }[]> {
    return this.http.get<{ userId: string; username: string }[]>('/api/users?limit=100');
  }

  invite(request: CreateInviteRequest): Observable<GameInvite> {
    return this.http.post<GameInvite>(`${this.base}/invites`, request);
  }

  /** Invitations waiting for the caller to answer. */
  invites(): Observable<GameInvite[]> {
    return this.http.get<GameInvite[]>(`${this.base}/invites`);
  }

  /** Invitations the caller has sent and nobody has answered. */
  sentInvites(): Observable<GameInvite[]> {
    return this.http.get<GameInvite[]>(`${this.base}/invites/sent`);
  }

  /** Accepting starts the game and returns its id. */
  accept(inviteId: string, deckId: string): Observable<{ gameId: string }> {
    return this.http.post<{ gameId: string }>(`${this.base}/invites/${inviteId}/accept`, {
      deckId,
    });
  }

  withdraw(inviteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/invites/${inviteId}`);
  }

  view(gameId: string): Observable<GameView> {
    return this.http.get<GameView>(`${this.base}/${gameId}`);
  }

  log(gameId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/${gameId}/log`);
  }
}
