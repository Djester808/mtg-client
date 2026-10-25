import { LibraryAction, LibrarySearchRequest } from './library-action';
import { LibraryRequestJournal } from './library-request-journal';
import { Injectable, inject } from '@angular/core';
import { SignalRService } from '../services/signalr.service';

/** Keeps the same request ID when retrying an uncertain library action. */
@Injectable({ providedIn: 'root' })
export class LibraryActionsService {
  private readonly hub = inject(SignalRService);
  private readonly requests = inject(LibraryRequestJournal);
  private busy = false;

  perform(action: LibraryAction): Promise<void> {
    return this.execute(action, (request) => this.hub.manualLibrary(action, request));
  }

  arrange(order: readonly string[]): Promise<void> {
    const snapshot = [...order];
    return this.execute(JSON.stringify(['arrange', snapshot]), (request) =>
      this.hub.manualLibraryArrange(request, snapshot),
    );
  }

  reposition(cardId: string, position: number): Promise<void> {
    return this.execute(JSON.stringify(['reposition', cardId, position]), (request) =>
      this.hub.manualLibraryReposition(request, cardId, position),
    );
  }

  search(options: LibrarySearchRequest): Promise<void> {
    const key = JSON.stringify([
      'search',
      options.count,
      options.destination,
      options.filter?.types ?? null,
      options.filter?.subtypes ?? [],
      options.filter?.supertypes ?? null,
      options.reveal,
      options.shuffleAfter,
      options.tapped,
      options.where,
    ]);
    return this.execute(key, (request) => this.hub.manualLibrarySearch(request, options));
  }
  private async execute(action: string, send: (request: string) => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const scope = this.hub.libraryRequestScope;
      if (!scope) throw Error('Waiting for the current table.');
      const request = this.requests.begin(scope, action);
      await send(request);
      this.requests.complete(scope, action, request);
    } finally {
      this.busy = false;
    }
  }
}
