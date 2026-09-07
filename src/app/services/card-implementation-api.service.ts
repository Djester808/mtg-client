import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, shareReplay } from 'rxjs';

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
   * Sixty characters of each reading around the first character they differ at, joined by ` | `.
   *
   * **Not a path**, despite the name. `CardImplementationService.FirstDifference` walks the two
   * JSON *strings* to the first unequal character and excerpts both sides of it, so a value here
   * reads like `], "spell": true | ] }` — unreadable on screen and not something a lookup can
   * resolve. The queue was written against a path this endpoint has never sent, which is why no
   * line was ever highlighted; it now finds the differing line itself
   * (`CardDisputeDiffService.render`) and nothing binds this field. Kept on the interface because
   * the DTO carries it, and documented so the next reader does not try again.
   */
  firstDifference: string;
}

/**
 * A primitive the translation stage could not express, and how many cards are waiting on it.
 *
 * This is the vocabulary backlog: each reason is one thing the card language cannot yet say, and
 * `cardsBlocked` is what saying it would buy. Mirrors `PrimitiveBacklogDto`.
 */
export interface PrimitiveBacklog {
  reason: string;
  cardsBlocked: number;
}

/**
 * The last time the runner played the corpus' scenarios. Mirrors `VerificationDto`.
 *
 * Note what is *not* here: a count of cards carrying no scenarios at all. The DTO has no field
 * for it, so the dashboard says the number is not carried rather than showing a zero that would
 * read as "every card has scenarios" — the opposite of the truth while the corpus is being
 * translated. `failed` is not carried either, but is honestly derivable as `total - passed`.
 */
export interface Verification {
  engineHash: string;
  runId: string;
  passed: number;
  total: number;
  /** ISO-8601, as `DateTimeOffset` serialises. */
  at: string;
}

/** `GET /api/cards/coverage` — the whole ledger in one call. Mirrors `CardCoverageDto`. */
export interface CardCoverage {
  total: number;
  /** Keyed by `ImplementationStatus` name. A status with no cards may be absent, not zero. */
  byStatus: Partial<Record<ImplementationStatus, number>>;
  primitiveBacklog: PrimitiveBacklog[];
  lastVerification?: Verification | null;
  /** Populated only when the call named `?status=Disputed`. */
  disputed?: DisputedCard[] | null;
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
  'getImplementation' | 'getCoverage' | 'listDisputed' | 'chooseReading'
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

  /**
   * The whole ledger: counts by status, the primitive backlog, and the last verification run.
   *
   * Uncached on purpose — the dashboard exists to say what the pipeline has done *since* the
   * page was last looked at, and a cached count would make a re-run look like nothing happened.
   */
  getCoverage(): Observable<CardCoverage> {
    return this.http.get<CardCoverage>(`${this.base}/coverage`);
  }

  /**
   * The dispute queue: cards whose two readings disagree, with both readings.
   *
   * `?status=Disputed` narrows the same coverage document rather than returning a bare list —
   * `CardsImplementationController.Coverage` returns `CardCoverageDto` for every call — so the
   * rows come out of its `disputed` field. Absent means the server named no disputes, which is
   * an empty queue and not an error.
   */
  listDisputed(): Observable<DisputedCard[]> {
    return this.http
      .get<CardCoverage>(`${this.base}/coverage`, { params: { status: 'Disputed' } })
      .pipe(map((coverage) => coverage.disputed ?? []));
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
  /** What `getCoverage()` answers with. An empty ledger by default, which is a real state. */
  coverage: CardCoverage = { total: 0, byStatus: {}, primitiveBacklog: [], lastVerification: null };
  readonly chosen: { oracleId: string; model: string }[] = [];
  /** Set to make `chooseReading` fail, for the "it stays in the list" case. */
  chooseFails = false;

  getImplementation(oracleId: string): Observable<CardImplementation> {
    const known = this.implementations.get(oracleId);
    return of(known ?? { oracleId, status: 'Untranslated' as const });
  }

  getCoverage(): Observable<CardCoverage> {
    return of(this.coverage);
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
