import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CollectionCardDto,
  AddCardToCollectionRequest,
  UpdateCollectionCardRequest,
  PrintingDto,
  CardDto,
} from '../models/game.models';

export interface DeckDto {
  id: string;
  name: string;
  coverUri: string | null;
  format: string | null;
  commanderOracleId: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckDetailDto {
  id: string;
  name: string;
  coverUri: string | null;
  format: string | null;
  commanderOracleId: string | null;
  createdAt: string;
  updatedAt: string;
  cards: CollectionCardDto[];
}

export interface CreateDeckRequest {
  name: string;
  coverUri?: string | null;
  format?: string | null;
  commanderOracleId?: string | null;
}

export interface UpdateDeckRequest {
  name: string;
  coverUri?: string | null;
  format?: string | null;
  commanderOracleId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DeckApiService {
  private readonly base = '/api/decks';

  constructor(private http: HttpClient) {}

  getDecks(): Observable<DeckDto[]> {
    return this.http.get<DeckDto[]>(this.base);
  }

  getDeck(id: string): Observable<DeckDetailDto> {
    return this.http.get<DeckDetailDto>(`${this.base}/${id}`);
  }

  createDeck(req: CreateDeckRequest): Observable<DeckDetailDto> {
    return this.http.post<DeckDetailDto>(this.base, req);
  }

  updateDeck(id: string, req: UpdateDeckRequest): Observable<DeckDetailDto> {
    return this.http.put<DeckDetailDto>(`${this.base}/${id}`, req);
  }

  deleteDeck(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addCard(deckId: string, req: AddCardToCollectionRequest): Observable<CollectionCardDto> {
    return this.http.post<CollectionCardDto>(`${this.base}/${deckId}/cards`, req);
  }

  updateCard(deckId: string, cardId: string, req: UpdateCollectionCardRequest): Observable<CollectionCardDto> {
    return this.http.put<CollectionCardDto>(`${this.base}/${deckId}/cards/${cardId}`, req);
  }

  removeCard(deckId: string, cardId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${deckId}/cards/${cardId}`);
  }

  getPrintings(oracleId: string): Observable<PrintingDto[]> {
    return this.http.get<PrintingDto[]>(`/api/cards/${oracleId}/printings`);
  }

  getCardByScryfallId(scryfallId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`/api/cards/scryfall/${scryfallId}`);
  }
}
