import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface CountBucket {
  key: string;
  copies: number;
}
export interface PublicCollectionSummary {
  copies: number;
  uniquePrintings: number;
  uniqueCards: number;
  byColor: CountBucket[];
  byType: CountBucket[];
  byRarity: CountBucket[];
  bySet: CountBucket[];
  byFinish: CountBucket[];
  curve: CountBucket[];
}
@Injectable({ providedIn: 'root' })
export class PublicCollectionApiService {
  private readonly http = inject(HttpClient);
  visibility() {
    return this.http.get<{ public: boolean }>('/api/profile/me/collection-visibility');
  }
  setVisibility(visible: boolean) {
    return this.http.put<void>('/api/profile/me/collection-visibility', { public: visible });
  }
  summary(username: string) {
    return this.http.get<PublicCollectionSummary>(
      `/api/public-collections/${encodeURIComponent(username)}/summary`,
    );
  }
}
