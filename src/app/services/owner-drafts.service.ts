import { Injectable, signal } from '@angular/core';
import { storedAuth } from './auth-storage';
@Injectable({ providedIn: 'root' })
export class OwnerDraftsService {
  readonly saved = signal(true);
  private key(scope: string, id: string): string | null {
    try {
      const token = storedAuth('auth_token');
      if (!token) return null;
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const owner =
        claims.sub ??
        claims.nameid ??
        claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
      return typeof owner === 'string' && owner.length <= 100
        ? 'compleat.draft.v1.' + owner + '.' + scope + '.' + id
        : null;
    } catch {
      return null;
    }
  }
  read<T>(scope: string, id: string, valid: (value: unknown) => value is T): T | null {
    const key = this.key(scope, id);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 2000000) return null;
      const value: unknown = JSON.parse(raw);
      return valid(value) ? value : null;
    } catch {
      return null;
    }
  }
  write(scope: string, id: string, value: unknown): void {
    const key = this.key(scope, id);
    if (!key) return;
    try {
      const json = JSON.stringify(value);
      if (json.length > 2000000) throw new Error('Draft too large');
      localStorage.setItem(key, json);
      this.saved.set(true);
    } catch {
      this.saved.set(false);
    }
  }
  remove(scope: string, id: string): void {
    const key = this.key(scope, id);
    if (key)
      try {
        localStorage.removeItem(key);
      } catch {
        this.saved.set(false);
      }
  }
}
