import { CollectionQueryState, CollectionPageRequest } from './collection-query-state';
import { storedAuth } from './auth-storage';
import { CollectionUndoService } from './collection-undo.service';
import { CollectionOwnershipService } from './collection-ownership.service';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import {
  CollectionDto,
  CollectionDetailDto,
  CollectionCardDto,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  AddCardToCollectionRequest,
  UpdateCollectionCardRequest,
  MoveCardRequest,
  MoveCardResultDto,
  MoveCardsRequest,
  MoveCardsResultDto,
  MergeCollectionsRequest,
  MergeCollectionsResultDto,
} from '../models/game.models';

@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly queries = inject(CollectionQueryState);
  private readonly ownership = inject(CollectionOwnershipService);
  private readonly undo = inject(CollectionUndoService);
  private changed<T>(request: Observable<HttpResponse<T>>): Observable<T> {
    const owner = storedAuth('auth_username');
    return request.pipe(
      tap((response) => {
        if (owner === storedAuth('auth_username')) {
          this.ownership.invalidate();
          this.undo.accept(response.headers, owner);
        }
      }),
      map((response) => response.body as T),
    );
  }
  private readonly base = '/api/collections';

  constructor(private http: HttpClient) {}

  exportCollection(id: string, format: 'csv' | 'text') {
    return this.http.get(this.base + '/' + encodeURIComponent(id) + '/export', {
      params: { format },
      responseType: 'blob',
    });
  }

  getCollections(): Observable<CollectionDto[]> {
    return this.http.get<CollectionDto[]>(this.base);
  }

  /**
   * Every oracle id the user owns a copy of, across all collections. Decks are excluded
   * server-side: a card sitting in a deck list is not a card you own.
   */
  getOwnedOracleIds(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/owned-oracle-ids`);
  }

  /** Moves copies of a card row into another collection, folding into a matching printing there. */
  moveCard(
    collectionId: string,
    cardId: string,
    req: MoveCardRequest,
  ): Observable<MoveCardResultDto> {
    return this.changed(
      this.http.post<MoveCardResultDto>(`${this.base}/${collectionId}/cards/${cardId}/move`, req, {
        observe: 'response',
      }),
    );
  }

  /** Moves several whole rows at once; all-or-nothing on the server. */
  moveCards(collectionId: string, req: MoveCardsRequest): Observable<MoveCardsResultDto> {
    return this.changed(
      this.http.post<MoveCardsResultDto>(`${this.base}/${collectionId}/cards/move`, req, {
        observe: 'response',
      }),
    );
  }

  /** Folds every card of `req.sourceCollectionId` into `targetCollectionId`. */
  mergeCollections(
    targetCollectionId: string,
    req: MergeCollectionsRequest,
  ): Observable<MergeCollectionsResultDto> {
    return this.changed(
      this.http.post<MergeCollectionsResultDto>(`${this.base}/${targetCollectionId}/merge`, req, {
        observe: 'response',
      }),
    );
  }

  getCollection(id: string): Observable<CollectionDetailDto> {
    return this.queryCollection(id, this.queries.get(id));
  }

  lookupRows(id: string, oracleIds: string[]): Observable<CollectionCardDto[]> {
    return this.http.post<CollectionCardDto[]>(this.base + '/' + id + '/rows', oracleIds);
  }

  queryCollection(id: string, request: CollectionPageRequest): Observable<CollectionDetailDto> {
    return this.http.post<CollectionDetailDto>(this.base + '/' + id + '/query', request);
  }

  createCollection(req: CreateCollectionRequest): Observable<CollectionDetailDto> {
    return this.changed(
      this.http.post<CollectionDetailDto>(this.base, req, { observe: 'response' }),
    );
  }

  updateCollection(id: string, req: UpdateCollectionRequest): Observable<CollectionDetailDto> {
    return this.changed(
      this.http.put<CollectionDetailDto>(`${this.base}/${id}`, req, { observe: 'response' }),
    );
  }

  deleteCollection(id: string): Observable<void> {
    return this.changed(this.http.delete<void>(`${this.base}/${id}`, { observe: 'response' }));
  }

  addCard(collectionId: string, req: AddCardToCollectionRequest): Observable<CollectionCardDto> {
    return this.changed(
      this.http.post<CollectionCardDto>(`${this.base}/${collectionId}/cards`, req, {
        observe: 'response',
      }),
    );
  }

  updateCard(
    collectionId: string,
    cardId: string,
    req: UpdateCollectionCardRequest,
  ): Observable<CollectionCardDto> {
    return this.changed(
      this.http.put<CollectionCardDto>(`${this.base}/${collectionId}/cards/${cardId}`, req, {
        observe: 'response',
      }),
    );
  }

  removeCard(collectionId: string, cardId: string): Observable<void> {
    return this.changed(
      this.http.delete<void>(`${this.base}/${collectionId}/cards/${cardId}`, {
        observe: 'response',
      }),
    );
  }

  // Printings loading lives in PrintingsService — one cache, one endpoint owner.
}
