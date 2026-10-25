import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { storedAuth } from './auth-storage';
import { Observable, tap } from 'rxjs';
import {
  AvatarLimits,
  MyProfile,
  PlayerSummary,
  UpdateProfileRequest,
  UserCommentPage,
  UserProfile,
} from '../models/profile.models';

/**
 * Profiles: the public ones under `/api/users`, and the caller's own under `/api/profile`.
 *
 * Both live here because they are one feature and one set of models; the split in the URL
 * is an authorization boundary, not a domain boundary.
 */
@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly users = '/api/users';
  private readonly me = '/api/profile/me';

  private profileGeneration = 0;
  private readonly _myProfile = signal<MyProfile | null>(null);

  /**
   * The signed-in user's profile, as last returned by any call on this service.
   *
   * Here rather than in each component because two places render it: the account page
   * edits it, and the navbar shows the avatar from it. Without one source of truth the
   * navbar keeps showing the old picture until a reload — which is precisely when someone
   * is looking to see whether their new one took.
   */
  readonly myProfile = this._myProfile.asReadonly();

  constructor(private http: HttpClient) {}

  /** Drops the cached profile. Call on sign-out so the next user does not inherit a face. */
  clearMyProfile(): void {
    this.profileGeneration++;
    this._myProfile.set(null);
  }

  private remember(request: Observable<MyProfile>): Observable<MyProfile> {
    const owner = storedAuth('auth_username'),
      generation = this.profileGeneration;
    return request.pipe(
      tap((me) => {
        if (owner === storedAuth('auth_username') && generation === this.profileGeneration)
          this._myProfile.set(me);
      }),
    );
  }

  // ---- Public -----------------------------------------------------------

  getPlayers(): Observable<PlayerSummary[]> {
    return this.http.get<PlayerSummary[]>(this.users);
  }

  getProfile(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.users}/${encodeURIComponent(username)}`);
  }

  /** A page of comment history. The server caps `pageSize`, so a large ask is safe. */
  getComments(username: string, page: number, pageSize: number): Observable<UserCommentPage> {
    return this.http.get<UserCommentPage>(
      `${this.users}/${encodeURIComponent(username)}/comments`,
      { params: { page, pageSize } },
    );
  }

  // ---- Owner ------------------------------------------------------------

  getMyProfile(): Observable<MyProfile> {
    return this.remember(this.http.get<MyProfile>(this.me));
  }

  updateMyProfile(request: UpdateProfileRequest): Observable<MyProfile> {
    return this.remember(this.http.put<MyProfile>(this.me, request));
  }

  getAvatarLimits(): Observable<AvatarLimits> {
    return this.http.get<AvatarLimits>(`${this.me}/avatar/limits`);
  }

  /**
   * Uploads an avatar.
   *
   * Sent as multipart under the field name `file`, which is what the controller's
   * `IFormFile file` parameter binds to; renaming one without the other silently produces
   * "Choose an image to upload".
   */
  uploadAvatar(image: Blob, filename = 'avatar.jpg'): Observable<MyProfile> {
    const body = new FormData();
    body.append('file', image, filename);
    return this.remember(this.http.put<MyProfile>(`${this.me}/avatar`, body));
  }

  deleteAvatar(): Observable<MyProfile> {
    return this.remember(this.http.delete<MyProfile>(`${this.me}/avatar`));
  }
}
