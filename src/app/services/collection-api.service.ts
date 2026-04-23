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
  PrintingDto,
} from '../models/game.models';

@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly base = '/api/collections';

  constructor(private http: HttpClient) {}

  getCollections(): Observable<CollectionDto[]> {
    return this.http.get<CollectionDto[]>(this.base);
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

  getPrintings(oracleId: string): Observable<PrintingDto[]> {
    return this.http.get<PrintingDto[]>(`/api/cards/${oracleId}/printings`);
  }
}
