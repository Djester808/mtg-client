import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ProfileEditComponent } from './profile-edit.component';
import { MyProfile } from '../../models/profile.models';
import { ToastService } from '../../services/toast.service';

function makeMe(overrides: Partial<MyProfile['profile']> = {}): MyProfile {
  return {
    email: 'nissa@example.com',
    privateStats: { collectionValueUsd: 1234.5, copiesValued: 300, unpublishedDecks: 2 },
    profile: {
      username: 'Nissa',
      displayName: null,
      tagline: null,
      bio: null,
      favoriteFormat: null,
      avatarUrl: null,
      joinedAt: '2026-01-02T03:04:05Z',
      deckCount: 0,
      commentCount: 0,
      stats: {
        decksBuilt: 0,
        decksPublished: 0,
        collections: 0,
        cardsOwned: 400,
        distinctCards: 0,
        commentsPosted: 0,
        commentsReceived: 0,
        colorSpread: [],
        formats: [],
        lastActiveAt: null,
      },
      favoriteCommander: null,
      topCommanders: [],
      mostPlayedCards: [],
      topDecks: [],
      recentlyActive: [],
      publishedDecks: [],
      recentComments: [],
      ...overrides,
    },
  };
}

describe('ProfileEditComponent', () => {
  let http: HttpTestingController;
  let toasts: string[];

  beforeEach(() => {
    toasts = [];
    TestBed.configureTestingModule({
      imports: [ProfileEditComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: ToastService,
          useValue: {
            show: (m: string) => toasts.push(m),
            error: (m: string) => toasts.push(`error:${m}`),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(me: MyProfile = makeMe()) {
    const fixture = TestBed.createComponent(ProfileEditComponent);
    fixture.detectChanges();
    http.expectOne('/api/profile/me').flush(me);
    http
      .expectOne('/api/profile/me/avatar/limits')
      .flush({ maxBytes: 512 * 1024, maxDimension: 1024, acceptedContentTypes: ['image/jpeg'] });
    fixture.detectChanges();
    return fixture;
  }

  it('fills the edit buffer from the loaded profile', () => {
    const fixture = load(makeMe({ displayName: 'Nissa Revane', bio: 'I play green.' }));

    expect(fixture.componentInstance.displayName).toBe('Nissa Revane');
    expect(fixture.componentInstance.bio).toBe('I play green.');
    expect(fixture.componentInstance.dirty).withContext('untouched').toBeFalse();
  });

  it('offers a save only once something actually changed', () => {
    const fixture = load();
    const page = fixture.componentInstance;

    expect(page.dirty).toBeFalse();
    page.tagline = 'Group hug enjoyer';
    expect(page.dirty).toBeTrue();
  });

  it('sends blank fields as null so they are cleared rather than stored empty', () => {
    const fixture = load(makeMe({ tagline: 'old' }));
    fixture.componentInstance.tagline = '';
    fixture.componentInstance.save();

    const req = http.expectOne((r) => r.url === '/api/profile/me' && r.method === 'PUT');
    expect(req.request.body.tagline).toBeNull();

    req.flush(makeMe());
    expect(toasts).toContain('Profile saved');
  });

  it('restores the loaded values on cancel', () => {
    const fixture = load(makeMe({ bio: 'original' }));
    const page = fixture.componentInstance;

    page.bio = 'scribbled over';
    page.revert();

    expect(page.bio).toBe('original');
    expect(page.dirty).toBeFalse();
  });

  it('reports a failed save without dropping the edit', () => {
    const fixture = load();
    fixture.componentInstance.tagline = 'kept';
    fixture.componentInstance.save();

    http
      .expectOne((r) => r.method === 'PUT')
      .flush(
        { detail: 'That commander could not be found.' },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(toasts).toContain('error:That commander could not be found.');
    expect(fixture.componentInstance.tagline).withContext('not discarded').toBe('kept');
    expect(fixture.componentInstance.saving).toBeFalse();
  });

  it('toggles a pinned commander off when it is picked again', () => {
    const fixture = load();
    const page = fixture.componentInstance;

    page.pinCommander('atraxa');
    expect(page.favoriteCommanderOracleId).toBe('atraxa');

    page.pinCommander('atraxa');
    expect(page.favoriteCommanderOracleId).toBeNull();
  });

  it('only offers commanders the user actually builds with', () => {
    const fixture = load(
      makeMe({
        topCommanders: [
          {
            oracleId: 'atraxa',
            name: 'Atraxa',
            imageUriArtCrop: null,
            colorIdentity: [],
            deckCount: 2,
          },
        ],
      }),
    );

    expect(fixture.componentInstance.commanderChoices.length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Atraxa');
  });

  it('removes the avatar and clears the picture', () => {
    const fixture = load(makeMe({ avatarUrl: '/api/users/Nissa/avatar?v=1' }));

    fixture.componentInstance.removeAvatar();
    http.expectOne((r) => r.method === 'DELETE').flush(makeMe());

    expect(fixture.componentInstance.me?.profile.avatarUrl).toBeNull();
    expect(toasts).toContain('Avatar removed');
  });

  it('does not fire a delete when there is no avatar to remove', () => {
    const fixture = load();

    fixture.componentInstance.removeAvatar();

    http.expectNone((r) => r.method === 'DELETE');
    expect(http.match((r) => r.method === 'DELETE').length)
      .withContext('nothing to delete, so nothing is sent')
      .toBe(0);
  });

  it('falls back to the documented limits when the limits call fails', () => {
    const fixture = TestBed.createComponent(ProfileEditComponent);
    fixture.detectChanges();
    http.expectOne('/api/profile/me').flush(makeMe());
    http
      .expectOne('/api/profile/me/avatar/limits')
      .flush(null, { status: 503, statusText: 'Unavailable' });

    // Uploading has to keep working; without a fallback the resize would have no target.
    expect(fixture.componentInstance.limits?.maxDimension).toBe(1024);
  });

  it('shows the private stats and says how much of the collection was priced', () => {
    const fixture = load();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('$1,234.50');
    expect(text).toContain('300 of');
    expect(text).toContain('400 copies priced');
  });

  it('offers a retry that actually re-requests the profile', () => {
    // The failure the user hit was the API being down. Without this the only way out of
    // the error state is a full page reload.
    const fixture = TestBed.createComponent(ProfileEditComponent);
    fixture.detectChanges();
    http.expectOne('/api/profile/me').flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne('/api/profile/me/avatar/limits')
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.error).not.toBeNull();

    fixture.componentInstance.load();
    http.expectOne('/api/profile/me').flush(makeMe());
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBeNull();
    expect(fixture.componentInstance.me).not.toBeNull();
  });

  it('reports the profile as unavailable when it cannot be loaded', () => {
    const fixture = TestBed.createComponent(ProfileEditComponent);
    fixture.detectChanges();
    http.expectOne('/api/profile/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/profile/me/avatar/limits')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBe('Please sign in again');
  });
});
