import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  private readonly base = '/api/collections';

  constructor(private http: HttpClient) {}

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
    return this.http.post<MoveCardResultDto>(
      `${this.base}/${collectionId}/cards/${cardId}/move`,
      req,
    );
  }

  /** Moves several whole rows at once; all-or-nothing on the server. */
  moveCards(collectionId: string, req: MoveCardsRequest): Observable<MoveCardsResultDto> {
    return this.http.post<MoveCardsResultDto>(`${this.base}/${collectionId}/cards/move`, req);
  }

  /** Folds every card of `req.sourceCollectionId` into `targetCollectionId`. */
  mergeCollections(
    targetCollectionId: string,
    req: MergeCollectionsRequest,
  ): Observable<MergeCollectionsResultDto> {
    return this.http.post<MergeCollectionsResultDto>(
      `${this.base}/${targetCollectionId}/merge`,
      req,
    );
  }

  getCollection(id: string): Observable<CollectionDetailDto> {
    return this.http.get<CollectionDetailDto>(`${this.base}/${id}`);
  }

  createCollection(req: CreateCollectionRequest): Observable<CollectionDetailDto> {
    return this.http.post<CollectionDetailDto>(this.base, req);
  }

  updateCollection(id: string, req: UpdateCollectionRequest): Observable<CollectionDetailDto> {
    return this.http.put<CollectionDetailDto>(`${this.base}/${id}`, req);
  }

  deleteCollection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addCard(collectionId: string, req: AddCardToCollectionRequest): Observable<CollectionCardDto> {
    return this.http.post<CollectionCardDto>(`${this.base}/${collectionId}/cards`, req);
  }

  updateCard(
    collectionId: string,
    cardId: string,
    req: UpdateCollectionCardRequest,
  ): Observable<CollectionCardDto> {
    return this.http.put<CollectionCardDto>(`${this.base}/${collectionId}/cards/${cardId}`, req);
  }

  removeCard(collectionId: string, cardId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${collectionId}/cards/${cardId}`);
  }

  // Printings loading lives in PrintingsService — one cache, one endpoint owner.
}
