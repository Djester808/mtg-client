import { Injectable } from '@angular/core';

/** Tab-scoped uncertain request identities survive reload without storing game state. */
@Injectable({ providedIn: 'root' })
export class LibraryRequestJournal {
  private key(scope: string, action: string): string {
    return 'mtg.library.request:v1:' + JSON.stringify([scope, action]);
  }

  begin(scope: string, action: string): string {
    const key = this.key(scope, action);
    const request = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, request);
    return request;
  }

  complete(scope: string, action: string, request: string): void {
    const key = this.key(scope, action);
    if (sessionStorage.getItem(key) !== request) return;
    sessionStorage.removeItem(key);
    // A confirmed opposite action ends the previous inspection cycle.
    // Its uncertain request must not be reused in a later cycle.
    const opposite = action === 'look' ? 'stopLooking' : action === 'stopLooking' ? 'look' : null;
    if (opposite) {
      sessionStorage.removeItem(this.key(scope, opposite));
      return;
    }
    // A confirmed mutation ends the previous uncertain mutation intent.
    // Inspection alone leaves it available for an immediate safe retry.
    const prefix = 'mtg.library.request:v1:' + JSON.stringify([scope]).slice(0, -1) + ',';
    for (const stored of Object.keys(sessionStorage)) {
      if (
        stored.startsWith(prefix) &&
        stored !== this.key(scope, 'look') &&
        stored !== this.key(scope, 'stopLooking')
      )
        sessionStorage.removeItem(stored);
    }
  }
}
