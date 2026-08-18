import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * What `/api/auth/login` and `/api/auth/register` return.
 *
 * `username` is the server's spelling and is the authoritative one — login accepts either
 * a username or an email address, so it is frequently not what the caller typed. This
 * interface omitted it, which left the effects echoing the request instead.
 */
interface AuthResponse {
  token: string;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = '/api/auth';

  constructor(private http: HttpClient) {}

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/register`, { username, email, password });
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, { username, password });
  }
}
