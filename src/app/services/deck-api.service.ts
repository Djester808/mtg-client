import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
  tags: string[];
  notes: string | null;
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
  tags?: string[];
  notes?: string | null;
}

export interface ImportDeckRequest {
  name: string;
  text?: string;
  url?: string;
  format?: string | null;
}

export interface ImportDeckResult {
  deck: DeckDetailDto;
  cardsResolved: number;
  cardsTotal: number;
  unresolvedCards: string[];
}

export interface SynergyRequest {
  commanderOracleId: string;
  commanderName: string;
  commanderText: string;
  cardOracleId: string;
  cardName: string;
  cardText: string;
  deckCardNames?: string[];
}

export interface SynergyResult {
  score: number;
  reason: string;
}

export interface SuggestedCardDto {
  name: string;
  reason: string;
  score: number;
  scryfallId: string | null;
  card: import('../models/game.models').CardDto | null;
}

export interface DeckSuggestionsDto {
  latestSet:       SuggestedCardDto[];
  topSynergy:      SuggestedCardDto[];
  gameChangers:    SuggestedCardDto[];
  notableMentions: SuggestedCardDto[];
}

export interface DeckSuggestionsRequest {
  commanderOracleId: string;
  commanderName:     string;
  commanderText:     string;
  deckCardNames:     string[];
  deckTags?:         string[];
  suggestionTags?:   string[];
}

export interface ManaFineTuneRequest {
  format:           string;
  deckCardNames:    string[];
  currentLands:     number;
  recommendedLands: number;
  avgCmc:           number;
  activeColors:     string[];
}

export interface ManaLandSuggestion {
  name:   string;
  reason: string;
}

export interface ManaFineTuneDto {
  advice:          string[];
  landSuggestions: ManaLandSuggestion[];
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

  importDeck(req: ImportDeckRequest): Observable<ImportDeckResult> {
    return this.http.post<ImportDeckResult>(`${this.base}/import`, req);
  }

  analyzeSynergy(req: SynergyRequest): Observable<SynergyResult> {
    return this.http.post<SynergyResult>(`${this.base}/synergy`, req);
  }

  getSuggestions(req: DeckSuggestionsRequest): Observable<DeckSuggestionsDto> {
    return this.http.post<DeckSuggestionsDto>(`${this.base}/suggestions`, req);
  }

  getManaFineTune(req: ManaFineTuneRequest): Observable<ManaFineTuneDto> {
    return this.http.post<ManaFineTuneDto>(`${this.base}/mana-tune`, req);
  }

  getPrintings(oracleId: string): Observable<PrintingDto[]> {
    return this.http.get<PrintingDto[]>(`/api/cards/${oracleId}/printings`);
  }

  getCardByScryfallId(scryfallId: string): Observable<CardDto> {
    return this.http.get<CardDto>(`/api/cards/scryfall/${scryfallId}`);
  }

  getCardByName(name: string): Observable<CardDto | null> {
    const n = encodeURIComponent(name);
    return this.http.get<CardDto>(`/api/cards/named?name=${n}`).pipe(
      catchError(() => of(null)),
    );
  }

  aiBuildDeck(
    deckId: string,
    commanderOracleId: string,
    bracket: number = 3,
    priceRange: string = 'any',
    includeSideboard: boolean = false,
    includeMaybeboard: boolean = false,
  ): Observable<{ cardsAdded: number; sideboardAdded: number; maybeboardAdded: number; cardsSkipped: number }> {
    return this.http.post<{ cardsAdded: number; sideboardAdded: number; maybeboardAdded: number; cardsSkipped: number }>(
      `${this.base}/${deckId}/ai-build`,
      { commanderOracleId, bracket, priceRange, includeSideboard, includeMaybeboard },
    );
  }
}
