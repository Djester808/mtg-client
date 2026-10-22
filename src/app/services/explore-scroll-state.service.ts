import { Injectable } from '@angular/core';
export interface ExploreReadingPosition {
  top: number;
  open: number[];
}
@Injectable({ providedIn: 'root' })
export class ExploreScrollStateService {
  private readonly pages = new Map<string, ExploreReadingPosition>();
  save(key: string, value: ExploreReadingPosition): void {
    this.pages.set(key, { top: Math.max(0, value.top), open: [...value.open] });
    if (this.pages.size > 100) this.pages.delete(this.pages.keys().next().value!);
  }
  read(key: string): ExploreReadingPosition | undefined {
    return this.pages.get(key);
  }
}
