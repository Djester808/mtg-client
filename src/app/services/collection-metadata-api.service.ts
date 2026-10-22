import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
export interface CollectionMetadata {
  finish?: string;
  notes?: string | null;
  language: string;
  condition: string | null;
  purchasePrice: number | null;
  currency: string | null;
  tags: string[];
}
export interface BulkEditResult {
  undoToken: string;
  expiresAt: string;
  affected: number;
}
export type BulkEditAction = 'tag' | 'untag' | 'condition' | 'remove';
@Injectable({ providedIn: 'root' })
export class CollectionMetadataApiService {
  constructor(private http: HttpClient) {}
  get(collectionId: string, rowId: string, finish?: string) {
    return this.http.get<CollectionMetadata>(
      `/api/collections/${collectionId}/cards/${rowId}/metadata`,
      finish ? { params: { finish } } : {},
    );
  }
  update(collectionId: string, rowId: string, metadata: CollectionMetadata) {
    return this.http.put<void>(
      `/api/collections/${collectionId}/cards/${rowId}/metadata`,
      metadata,
    );
  }
  bulk(
    collectionId: string,
    cardIds: string[],
    action: BulkEditAction,
    tag: string,
    condition: string | null,
  ) {
    return this.http.post<BulkEditResult>(`/api/collections/${collectionId}/cards/bulk`, {
      cardIds,
      action,
      tag,
      condition,
    });
  }
  undo(token: string) {
    return this.http.post<void>(`/api/collections/undo/${token}`, {});
  }
}
