import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProfileApiService } from './profile-api.service';
import { MyProfile, UserProfile } from '../models/profile.models';

describe('ProfileApiService', () => {
  let service: ProfileApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ProfileApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches a public profile by username', () => {
    let received: UserProfile | undefined;
    service.getProfile('Nissa').subscribe((p) => (received = p));

    const req = http.expectOne('/api/users/Nissa');
    expect(req.request.method).toBe('GET');
    req.flush({ username: 'Nissa' } as UserProfile);

    expect(received?.username).toBe('Nissa');
  });

  it('escapes a username with characters that would otherwise change the path', () => {
    service.getProfile('a b/c').subscribe();

    // Unescaped, the slash would address /api/users/a b/c — a different route entirely.
    http.expectOne('/api/users/a%20b%2Fc').flush({} as UserProfile);
  });

  it('sends paging as query parameters on the comment history', () => {
    service.getComments('Nissa', 3, 10).subscribe();

    const req = http.expectOne((r) => r.url === '/api/users/Nissa/comments');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ total: 0, page: 3, pageSize: 10, items: [] });
  });

  it('posts the avatar as multipart under the field name the controller binds', () => {
    service.uploadAvatar(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })).subscribe();

    const req = http.expectOne('/api/profile/me/avatar');
    expect(req.request.method).toBe('PUT');

    // `file` is what `IFormFile file` binds to; any other name arrives as no file at all
    // and the endpoint answers "Choose an image to upload".
    const body = req.request.body as FormData;
    expect(body instanceof FormData).toBeTrue();
    expect(body.get('file')).toBeTruthy();

    req.flush({} as MyProfile);
  });

  it('deletes the avatar through the owner-only endpoint', () => {
    service.deleteAvatar().subscribe();

    const req = http.expectOne('/api/profile/me/avatar');
    expect(req.request.method).toBe('DELETE');
    req.flush({} as MyProfile);
  });

  it('reads and writes the caller profile at /api/profile/me', () => {
    service.getMyProfile().subscribe();
    http.expectOne((r) => r.url === '/api/profile/me' && r.method === 'GET').flush({} as MyProfile);

    service
      .updateMyProfile({
        displayName: 'Nissa Revane',
        tagline: null,
        bio: null,
        favoriteFormat: null,
        favoriteCommanderOracleId: null,
      })
      .subscribe();

    const put = http.expectOne((r) => r.url === '/api/profile/me' && r.method === 'PUT');
    expect(put.request.body.displayName).toBe('Nissa Revane');
    put.flush({} as MyProfile);
  });
});
