import { Injectable } from '@angular/core';
import { CollectionDetailDto } from '../models/collection.models';
import { CollectionQueryState, CollectionPageRequest } from './collection-query-state';
@Injectable()
export class CollectionPageService {
  readonly size = 100;
  index = 0;
  total = 0;
  private key = '';
  private acceptedPage: CollectionDetailDto['pageData'];
  private id = '';
  private refresh: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private queries: CollectionQueryState) {}
  bind(id: string, refresh: () => void): void {
    this.destroy();
    this.key = '';
    this.index = 0;
    this.total = 0;
    this.acceptedPage = undefined;
    this.id = id;
    this.queries.reset();
    this.refresh = refresh;
  }
  get pages(): number {
    return Math.max(1, Math.ceil(this.total / this.size));
  }
  rows(collection: CollectionDetailDto, request: CollectionPageRequest) {
    if (!collection.pageData) return collection.cards;
    const key = JSON.stringify(request);
    if (this.key && key !== this.key) {
      this.index = 0;
      this.queries.set(this.id, request);
      this.schedule();
    } else if (!this.key) {
      this.queries.set(this.id, request);
      // Initial load has no filters. Refetch only when restoring a non-default query.
      if (
        request.query ||
        request.groupSameCard ||
        request.sort !== 'name' ||
        request.group !== 'none'
      )
        this.schedule();
    }
    this.key = key;
    this.total = collection.pageData.total;
    if (this.acceptedPage !== collection.pageData) {
      this.acceptedPage = collection.pageData;
      if (!this.timer) this.index = collection.pageData.page - 1;
    }
    return collection.cards;
  }
  go(index: number): void {
    this.index = Math.max(0, Math.min(this.pages - 1, index));
    this.queries.set(this.id, { ...this.queries.get(this.id), page: this.index + 1 });
    this.schedule();
  }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh?.();
    }, 180);
  }
  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.refresh = null;
    this.queries.reset();
  }
}
