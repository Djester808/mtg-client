import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LossReason } from '../models/life-counter.models';

/** One seat as it goes onto the record. Mirrors `RecordMatchSeatRequest`. */
export interface RecordMatchSeat {
  seat: number;
  displayName: string;
  /**
   * The token that seat's player got by signing in on the counter, or omitted for a guest.
   *
   * This is what makes the record mean anything: the server writes a seat against an account
   * only when it holds that account's own token, so a device cannot post losses onto a
   * stranger's name. A seat with no token is stored as a guest.
   */
  token?: string;
  won: boolean;
  lossReason: LossReason;
  finalLife: number;
}

export interface RecordMatchRequest {
  startingLife: number;
  startedAt: string;
  seats: RecordMatchSeat[];
}

export interface MatchRecorded {
  matchId: string;
  /** The accounts the game actually counted for. Guests are absent. */
  attributedUsernames: string[];
}

export interface MatchSummary {
  matchId: string;
  recordedAt: string;
  seatCount: number;
  won: boolean;
  lossReason: LossReason;
  finalLife: number;
  opponents: string[];
}

export interface PlayerRecord {
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  recent: MatchSummary[];
}

/** Games played at a real table, filed from the life counter. */
@Injectable({ providedIn: 'root' })
export class MatchApiService {
  private readonly base = '/api/matches';
  private readonly http = inject(HttpClient);

  /**
   * Files a finished game.
   *
   * `callerToken` is for the table where nobody signed in to the app itself — four friends
   * around one phone, two of whom signed in at their own seats. The endpoint needs an
   * authenticated caller so a stream of records has an owner, and a seat's token is a
   * perfectly good one; requiring a *separate* app session on top would block the exact
   * case the per-seat sign-in exists for.
   *
   * `authInterceptor` leaves an explicitly-set `Authorization` alone, so this is what the
   * request goes up as.
   */
  record(request: RecordMatchRequest, callerToken?: string): Observable<MatchRecorded> {
    return this.http.post<MatchRecorded>(
      this.base,
      request,
      callerToken ? { headers: { Authorization: `Bearer ${callerToken}` } } : {},
    );
  }

  /**
   * One player's record.
   *
   * `seatToken` is required to read a *seat's* record rather than the browser's own: several
   * people share this device, and without it the answer would be about whoever the app is
   * signed in as, quietly and with no way to tell.
   */
  myRecord(seatToken?: string): Observable<PlayerRecord> {
    return this.http.get<PlayerRecord>(
      `${this.base}/me`,
      seatToken ? { headers: { Authorization: `Bearer ${seatToken}` } } : {},
    );
  }
}
