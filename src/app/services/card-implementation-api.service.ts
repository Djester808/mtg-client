import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay } from 'rxjs';

/**
 * Where a card is on the road from oracle text to a table.
 *
 * Mirrors `MtgEngine.Cards.ImplementationStatus` (MtgEngine.Cards/Files.cs) name for name —
 * the endpoint serialises the enum, so a rename on that side has to be made here too or the
 * badge silently falls through to the honour system for every card.
 */
export type ImplementationStatus =
  | 'Untranslated'
  | 'Translated'
  | 'Disputed'
  | 'Verified'
  | 'Excluded';

/**
 * Which admission a card reaches the table under.
 *
 * `enforced` — the engine plays it. `honour-system` — it has a reading nothing has verified,
 * so the table plays it by hand through the board's manual controls. `refused` — it is on the
 * exclusion list and is not in the game at all.
 */
export type Admission = 'enforced' | 'honour-system' | 'refused';

/** One scenario from the verification run, as `Scenario` + its result. */
export interface ScenarioResult {
  name: string;
  passed: boolean;
}

/** `GET /api/cards/{oracleId}/implementation` — the deck gate's answer for one card. */
export interface CardImplementation {
  oracleId: string;
  status: ImplementationStatus;
  /** Present only for `Excluded`: why the card is out (mirrors `ExcludedProvenance.Reason`). */
  exclusionReason?: string;
  /** How the definition came to be — the `Provenance` discriminator, flattened to a phrase. */
  provenance?: string;
  scenarios?: ScenarioResult[];
}

/** One model's reading of a card, kept because the two readings disagreed. */
export interface CardReading {
  model: string;
  /** The `CardDefinition` as JSON, exactly as the file holds it. Pretty-printed on screen. */
  definitionJson: string;
}

/** One row of `GET /api/cards/coverage?status=Disputed`. */
export interface DisputedCard {
  oracleId: string;
  name: string;
  readings: CardReading[];
  /**
   * The path the two readings first differ at, e.g. `Effects[0].Amount`.
   *
   * The server finds it, because the server has both definitions in their typed form; the
   * client only has to point at it. Empty when the server could not name one.
   */
  firstDifference: string;
}

/**
 * The admission rule, in one place.
 *
 * `Verified` is the only status the engine enforces: a reading that has passed its scenarios
 * against a known engine build. `Excluded` is the only one that keeps a card off the table.
 * Everything in between — untranslated, translated-but-unverified, disputed — reaches the
 * table on the honour system, badged, so the players know the engine is not watching that
 * card. There is deliberately no fourth answer: a card with no admission at all would read
 * as "nobody has said", which is the one thing a table playing some cards by hand cannot be
 * left to infer.
 */
export function admissionFor(status: ImplementationStatus): Admission {
  if (status === 'Verified') return 'enforced';
  if (status === 'Excluded') return 'refused';
  return 'honour-system';
}

/**
 * The surface of this service that callers depend on.
 *
 * Specs provide a typed stub against this rather than a bare `jasmine.createSpyObj`, so a
 * signature change here is a compile error in every spec instead of a green suite testing a
 * call that no longer exists. The endpoints themselves are still being written on the API
 * side (P4, against `MtgEngine.Cards/Files.cs`), which is exactly why nothing outside this
 * file is allowed to know their shapes.
 */
export type CardImplementationApi = Pick<
  CardImplementationApiService,
  'getImplementation' | 'listDisputed' | 'chooseReading'
>;

/** Every call about a card's admission. The one seam between this client and the card pipeline. */
@Injectable({ providedIn: 'root' })
export class CardImplementationApiService {
  private readonly base = '/api/cards';
  private readonly http = inject(HttpClient);

  /**
   * One card's admission, cached per oracle id for the life of the page.
   *
   * A deck view badges every row, and a hundred rows must not be a hundred requests per
   * change-detection pass: the badge component asks per card, and the cache is what makes
   * that safe. `shareReplay` rather than a stored value so concurrent rows share one call.
   */
  private readonly cache = new Map<string, Observable<CardImplementation>>();

  getImplementation(oracleId: string): Observable<CardImplementation> {
    const hit = this.cache.get(oracleId);
    if (hit) return hit;

    const call = this.http
      .get<CardImplementation>(`${this.base}/${encodeURIComponent(oracleId)}/implementation`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.cache.set(oracleId, call);
    return call;
  }

  /** The dispute queue: cards whose two readings disagree, with both readings. */
  listDisputed(): Observable<DisputedCard[]> {
    return this.http.get<DisputedCard[]>(`${this.base}/coverage`, {
      params: { status: 'Disputed' },
    });
  }

  /**
   * Settles a dispute by naming the reading that is right.
   *
   * The card's cached implementation is dropped, because choosing a reading moves it off
   * `Disputed` and a badge still holding the old answer would be wrong in the direction that
   * matters — telling a table the engine is not playing a card it now plays.
   */
  chooseReading(oracleId: string, model: string): Observable<void> {
    this.cache.delete(oracleId);
    return this.http.post<void>(
      `${this.base}/${encodeURIComponent(oracleId)}/implementation/choose`,
      { model },
    );
  }

  /** Drops the per-card cache. For a view that knows the pipeline has re-run. */
  forget(): void {
    this.cache.clear();
  }
}

/**
 * A stub of the seam above, for specs and for a dev run against an API that does not serve
 * these endpoints yet. Typed against `CardImplementationApi`, so it cannot drift from it.
 */
export class CardImplementationApiStub implements CardImplementationApi {
  readonly implementations = new Map<string, CardImplementation>();
  disputed: DisputedCard[] = [];
  readonly chosen: { oracleId: string; model: string }[] = [];
  /** Set to make `chooseReading` fail, for the "it stays in the list" case. */
  chooseFails = false;

  getImplementation(oracleId: string): Observable<CardImplementation> {
    const known = this.implementations.get(oracleId);
    return of(known ?? { oracleId, status: 'Untranslated' as const });
  }

  listDisputed(): Observable<DisputedCard[]> {
    return of(this.disputed);
  }

  chooseReading(oracleId: string, model: string): Observable<void> {
    if (this.chooseFails) {
      return new Observable<void>((subscriber) => subscriber.error(new Error('refused')));
    }
    this.chosen.push({ oracleId, model });
    return of(undefined);
  }
}
