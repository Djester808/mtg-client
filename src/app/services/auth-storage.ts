/** Shared by HTTP, streaming, live play and session restoration. */
export function storedAuth(key: 'auth_token' | 'auth_username'): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}
export function rememberSession(): boolean {
  return sessionStorage.getItem('auth_session_only') !== 'true';
}
export function saveAuth(token: string, username: string, remember = rememberSession()): void {
  clearAuth();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem('auth_token', token);
  storage.setItem('auth_username', username);
  if (!remember) sessionStorage.setItem('auth_session_only', 'true');
}
export function clearAuth(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('auth_token');
    storage.removeItem('auth_username');
    storage.removeItem('auth_session_only');
  }
}
