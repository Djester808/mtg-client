import { Injectable } from '@angular/core';
import { CardFilterState } from '../models/card-filters';
export interface CollectionPageRequest {
  page: number;
  pageSize: number;
  query?: string;
  matchCase?: boolean;
  matchWord?: boolean;
  regex?: boolean;
  colors?: string[];
  types?: string[];
  rarities?: string[];
  cmc?: string | null;
  set?: string | null;
  finish?: string;
  condition?: string;
  language?: string;
  tag?: string;
  duplicatesOnly?: boolean;
  sort?: string;
  sortDir?: string;
  groupSameCard?: boolean;
  group?: string;
}
@Injectable({ providedIn: 'root' })
export class CollectionQueryState {
  private id = '';
  private request: CollectionPageRequest = { page: 1, pageSize: 100 };
  get(id: string): CollectionPageRequest {
    return id === this.id ? this.request : { page: 1, pageSize: 100 };
  }
  set(id: string, request: CollectionPageRequest): void {
    this.id = id;
    this.request = request;
  }
  reset(): void {
    this.id = '';
    this.request = { page: 1, pageSize: 100 };
  }
  from(state: CardFilterState, grouped: boolean, group = 'none'): CollectionPageRequest {
    return {
      ...state,
      colors: [...state.colors],
      types: [...state.types],
      rarities: [...state.rarities],
      groupSameCard: grouped,
      group,
      page: 1,
      pageSize: 100,
    };
  }
}
