import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay, tap } from 'rxjs/operators';
import { PrintingDto } from '../models/game.models';

/**
 * The single owner of printings loading and caching.
 *
 * Seven components used to run their own `printingsCache` map plus a load-subject
 * pipeline over one of three duplicate API methods for the same endpoint. This service
 * replaces all of them: one app-wide cache, in-flight de-duplication (concurrent
 * requests for the same oracle id share one HTTP call), and a synchronous `cached()`
 * accessor for template getters that render from the cache.
 */
@Injectable({ providedIn: 'root' })
export class PrintingsService {
  private readonly cache = new Map<string, PrintingDto[]>();
  private readonly inflight = new Map<string, Observable<PrintingDto[]>>();

  constructor(private http: HttpClient) {}

  /** Synchronous cache read for template getters; null until loaded. */
  cached(oracleId: string): PrintingDto[] | null {
    return this.cache.get(oracleId) ?? null;
  }

  has(oracleId: string): boolean {
    return this.cache.has(oracleId);
  }

  /**
   * Loads a card's printings, newest set first (the server's ordering). Cached after
   * the first load; a failed load resolves to an empty array and is retried on the
   * next call rather than cached.
   */
  get(oracleId: string): Observable<PrintingDto[]> {
    const hit = this.cache.get(oracleId);
    if (hit) return of(hit);

    let req = this.inflight.get(oracleId);
    if (!req) {
      req = this.http.get<PrintingDto[]>(`/api/cards/${oracleId}/printings`).pipe(
        tap((printings) => {
          this.cache.set(oracleId, printings);
          this.inflight.delete(oracleId);
        }),
        catchError(() => {
          this.inflight.delete(oracleId);
          return of([] as PrintingDto[]);
        }),
        shareReplay(1),
      );
      this.inflight.set(oracleId, req);
    }
    return req;
  }
}
