import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface AccountDetails {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}
export interface AccountSession {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  constructor(private http: HttpClient) {}
  usernameAvailable(username: string) {
    return this.http.get<{ available: boolean }>('/api/account/username-available', {
      params: { username },
    });
  }
  changeUsername(username: string, currentPassword: string) {
    return this.http.put<void>('/api/account/username', { username, currentPassword });
  }
  deckPrivacy() {
    return this.http.get<{ hideProfileDecks: boolean }>('/api/account/deck-privacy');
  }
  setDeckPrivacy(hideProfileDecks: boolean) {
    return this.http.put<{ hideProfileDecks: boolean }>('/api/account/deck-privacy', {
      hideProfileDecks,
    });
  }
  get() {
    return this.http.get<AccountDetails>('/api/account');
  }
  sessions() {
    return this.http.get<AccountSession[]>('/api/account/sessions');
  }
  revoke(id: string) {
    return this.http.delete<void>(`/api/account/sessions/${encodeURIComponent(id)}`);
  }
  signOutAll() {
    return this.http.post<void>('/api/account/sign-out-all', {});
  }
  verify(code: string) {
    return this.http.post<void>('/api/account/verify-email', { code });
  }
  resend() {
    return this.http.post<void>('/api/account/verify-email/resend', {});
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<void>('/api/account/password', { currentPassword, newPassword });
  }
  changeEmail(currentPassword: string, email: string) {
    return this.http.put<void>('/api/account/email', { currentPassword, email });
  }
  delete(password: string) {
    return this.http.delete<void>('/api/account', { body: { password } });
  }
  forgot(email: string) {
    return this.http.post<void>('/api/auth/password/forgot', { email });
  }
  reset(email: string, code: string, newPassword: string) {
    return this.http.post<void>('/api/auth/password/reset', { email, code, newPassword });
  }
}
