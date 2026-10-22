import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { storedAuth } from './auth-storage';
import { CollectionOwnershipService } from './collection-ownership.service';
import { describeHttpError } from '../utils/http-error.utils';
export interface CollectionUndoOffer {
  token: string;
  expires: number;
  collections: string[];
  kind: string;
  owner: string;
}
@Injectable({ providedIn: 'root' })
export class CollectionUndoService {
  private readonly http = inject(HttpClient);
  private readonly ownership = inject(CollectionOwnershipService);
  readonly offer = signal<CollectionUndoOffer | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly completed = new Subject<string[]>();
  private readonly additions = signal<CollectionUndoOffer[]>([]);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly lastAdds = computed(() => {
    const map = new Map<string, CollectionUndoOffer>();
    for (const offer of this.additions()) map.set(offer.owner + '|' + offer.collections[0], offer);
    return map;
  });
  accept(headers: HttpHeaders, owner: string | null): void {
    const token = headers.get('X-Compleat-Undo'),
      expires = Date.parse(headers.get('X-Compleat-Undo-Expires') ?? '');
    if (
      !owner ||
      owner !== storedAuth('auth_username') ||
      !token ||
      !Number.isFinite(expires) ||
      expires <= Date.now()
    )
      return;
    const offer = {
      token,
      expires,
      collections: (headers.get('X-Compleat-Undo-Collections') ?? '').split(',').filter(Boolean),
      kind: headers.get('X-Compleat-Undo-Kind') ?? 'edit',
      owner,
    };
    if (!offer.collections.length) return;
    this.error.set('');
    this.offer.set(offer);
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        if (this.offer()?.token === token) this.offer.set(null);
      },
      Math.min(5000, expires - Date.now()),
    );
    if (offer.kind === 'add')
      this.additions.update((rows) =>
        [...rows.filter((r) => r.owner === owner && r.expires > Date.now()), offer].slice(-100),
      );
  }
  lastAdd(collection: string): CollectionUndoOffer | null {
    const offer = this.lastAdds().get(storedAuth('auth_username') + '|' + collection);
    return offer && offer.expires > Date.now() ? offer : null;
  }
  undo(offer: CollectionUndoOffer): void {
    if (this.busy() || offer.owner !== storedAuth('auth_username')) return;
    this.busy.set(true);
    this.error.set('');
    this.http.post<void>('/api/collections/undo/' + encodeURIComponent(offer.token), {}).subscribe({
      next: () => {
        this.busy.set(false);
        this.offer.set(null);
        this.additions.update((rows) => rows.filter((r) => r.token !== offer.token));
        this.ownership.invalidate();
        this.completed.next(offer.collections);
      },
      error: (e) => {
        this.busy.set(false);
        this.offer.set(null);
        this.additions.update((rows) => rows.filter((r) => r.token !== offer.token));
        this.error.set(describeHttpError(e, 'Undo could not be completed safely.'));
      },
    });
  }
}
