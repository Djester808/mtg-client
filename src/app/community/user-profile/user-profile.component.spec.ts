import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { UserProfileComponent } from './user-profile.component';
import { UserComment, UserProfile } from '../../models/profile.models';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
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
      cardsOwned: 0,
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
  };
}

function comment(id: string): UserComment {
  return {
    commentId: id,
    forumPostId: 'post-1',
    deckId: 'deck-1',
    deckName: 'Deck',
    content: 'nice',
    createdAt: '2026-08-01T00:00:00Z',
    edited: false,
  };
}

describe('UserProfileComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserProfileComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ username: 'Nissa' }) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(profile: UserProfile) {
    const fixture = TestBed.createComponent(UserProfileComponent);
    fixture.detectChanges();
    http.expectOne('/api/users/Nissa').flush(profile);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the profile once it arrives', () => {
    const fixture = load(
      makeProfile({
        tagline: 'Group hug enjoyer',
        stats: { ...makeProfile().stats, cardsOwned: 1234 },
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nissa');
    expect(text).toContain('Group hug enjoyer');
    expect(text).toContain('1,234');
  });

  it('shows the display name and keeps the username as the handle', () => {
    const fixture = load(makeProfile({ displayName: 'Nissa Revane' }));

    expect(fixture.componentInstance.name).toBe('Nissa Revane');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@Nissa');
  });

  it('reports a failed load instead of spinning forever', () => {
    const fixture = TestBed.createComponent(UserProfileComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/users/Nissa')
      .flush({ detail: "User 'Nissa' was not found." }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.error).toBe("User 'Nissa' was not found.");
  });

  it('pages more comment history in and does not offer more once it has them all', () => {
    const fixture = load(makeProfile({ commentCount: 12, recentComments: [comment('a')] }));
    const page = fixture.componentInstance;

    expect(page.hasMoreComments).toBeTrue();

    page.loadMoreComments();
    http
      .expectOne((r) => r.url === '/api/users/Nissa/comments')
      .flush({ total: 2, page: 2, pageSize: 10, items: [comment('b')] });

    expect(page.comments.map((c) => c.commentId)).toEqual(['a', 'b']);
    expect(page.hasMoreComments).withContext('2 of 2 fetched').toBeFalse();
  });

  it('never renders the same comment twice when a page overlaps what is already shown', () => {
    // The embedded first page is the server's choice of size. If it stops matching the
    // client's page size, the overlap would otherwise be appended as duplicates.
    const fixture = load(makeProfile({ commentCount: 5, recentComments: [comment('a')] }));

    fixture.componentInstance.loadMoreComments();
    http
      .expectOne((r) => r.url === '/api/users/Nissa/comments')
      .flush({ total: 5, page: 2, pageSize: 10, items: [comment('a'), comment('b')] });

    expect(fixture.componentInstance.comments.map((c) => c.commentId)).toEqual(['a', 'b']);
  });

  it('leaves the list alone when a page fails', () => {
    const fixture = load(makeProfile({ commentCount: 12, recentComments: [comment('a')] }));

    fixture.componentInstance.loadMoreComments();
    http
      .expectOne((r) => r.url === '/api/users/Nissa/comments')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.comments.length).toBe(1);
    expect(fixture.componentInstance.commentsLoading).toBeFalse();
  });

  it('expresses colour spread as a share of decks played', () => {
    const fixture = load(
      makeProfile({
        stats: {
          ...makeProfile().stats,
          colorSpread: [
            { color: 'B', deckCount: 3 },
            { color: 'G', deckCount: 1 },
          ],
        },
      }),
    );

    expect(fixture.componentInstance.colorShare(3)).toBe(75);
    expect(fixture.componentInstance.colorShare(1)).toBe(25);
  });

  it('switches between the decks and comments tabs', () => {
    const fixture = load(makeProfile());

    fixture.componentInstance.setTab('comments');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.up-comments')).toBeTruthy();

    fixture.componentInstance.setTab('decks');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.up-decks')).toBeTruthy();
  });
});
