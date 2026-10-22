import { Injectable, inject, signal } from '@angular/core';
import { OwnerDraftsService } from './owner-drafts.service';
import { storedAuth } from './auth-storage';
@Injectable({ providedIn: 'root' })
export class ExploreVisitService {
  private readonly drafts = inject(OwnerDraftsService);
  private owner: string | null = null;
  readonly deck = signal('');
  readonly trail = signal<{ deck: string; name: string; quantity: number }[]>([]);
  restore(): void {
    const owner = storedAuth('auth_username');
    if (owner === this.owner) return;
    this.owner = owner;
    this.trail.set([]);
    this.deck.set(
      this.drafts.read(
        'explore',
        'destination',
        (v): v is string => typeof v === 'string' && v.length <= 100,
      ) ?? '',
    );
  }
  added(deck: string, name: string, quantity: number): void {
    this.deck.set(deck);
    this.drafts.write('explore', 'destination', deck);
    this.trail.update((rows) => [...rows, { deck, name, quantity }].slice(-100));
  }
}
