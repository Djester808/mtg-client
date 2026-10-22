import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { storedAuth } from './auth-storage';
export interface OwnedPrinting {
  oracleId: string;
  scryfallId: string | null;
  language: string;
  quantity: number;
  quantityFoil: number;
  quantityEtched?: number;
}
@Injectable({ providedIn: 'root' })
export class CollectionOwnershipService {
  private readonly http = inject(HttpClient);
  private readonly index = signal<Record<
    string,
    { normal: number; foil: number; etched: number }
  > | null>(null);
  private owner: string | null = null;
  private pending = false;
  private version = 0;
  ensure(): void {
    const owner = storedAuth('auth_username');
    if (owner !== this.owner) {
      this.owner = owner;
      this.index.set(null);
      this.pending = false;
      this.version++;
    }
    if (!owner || !storedAuth('auth_token') || this.index() || this.pending) return;
    this.pending = true;
    const version = this.version;
    this.http.get<OwnedPrinting[]>('/api/collections/owned').subscribe({
      next: (rows) => {
        if (version !== this.version) return;
        const index: Record<string, { normal: number; foil: number; etched: number }> = {};
        for (const row of rows)
          for (const key of [
            row.oracleId + '|@all',
            row.oracleId + '|' + (row.scryfallId ?? '@unpinned'),
          ]) {
            const count = index[key] ?? { normal: 0, foil: 0, etched: 0 };
            index[key] = {
              normal: count.normal + row.quantity,
              foil: count.foil + row.quantityFoil,
              etched: count.etched + (row.quantityEtched ?? 0),
            };
          }
        this.index.set(index);
        this.pending = false;
      },
      error: () => {
        if (version === this.version) this.pending = false;
      },
    });
  }
  invalidate(): void {
    this.version++;
    this.pending = false;
    this.index.set(null);
    this.ensure();
  }
  count(
    oracle: string,
    printing?: string | null,
  ): { normal: number; foil: number; etched: number } | null {
    const index = this.index();
    return index
      ? (index[oracle + '|' + (printing === undefined ? '@all' : (printing ?? '@unpinned'))] ?? {
          normal: 0,
          foil: 0,
          etched: 0,
        })
      : null;
  }
}
