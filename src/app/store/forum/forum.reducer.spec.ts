import { forumReducer, ForumState } from './forum.reducer';
import { ForumActions } from './forum.actions';
import { ForumPostSummary, ForumPostDetail, ForumComment } from '../../models/forum.models';

function initialState(): ForumState {
  return {
    posts: [],
    activePost: null,
    loading: false,
    postLoading: false,
    publishLoading: false,
    error: null,
  };
}

function makePost(overrides: Partial<ForumPostSummary> = {}): ForumPostSummary {
  return {
    id: 'post-1',
    deckId: 'deck-1',
    authorUsername: 'player1',
    deckName: 'My Deck',
    deckCoverUri: null,
    deckFormat: 'commander',
    description: null,
    colorIdentity: ['R', 'G'],
    cardCount: 100,
    commentCount: 0,
    publishedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePostDetail(overrides: Partial<ForumPostDetail> = {}): ForumPostDetail {
  return {
    id: 'post-1',
    deckId: 'deck-1',
    authorId: 'user-1',
    authorUsername: 'player1',
    deckName: 'My Deck',
    deckCoverUri: null,
    deckFormat: 'commander',
    commanderOracleId: null,
    commanderImageUri: null,
    commanderName: null,
    description: null,
    colorIdentity: ['R', 'G'],
    publishedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    cards: [],
    comments: [],
    ...overrides,
  };
}

function makeComment(overrides: Partial<ForumComment> = {}): ForumComment {
  return {
    id: 'comment-1',
    authorId: 'user-1',
    authorUsername: 'player1',
    content: 'Great deck!',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('forumReducer', () => {
  // ── loadPosts ─────────────────────────────────────────────────────────────

  it('sets loading on loadPosts', () => {
    const s = forumReducer(initialState(), ForumActions.loadPosts());
    expect(s.loading).toBeTrue();
    expect(s.error).toBeNull();
  });

  it('stores posts and clears loading on loadPostsSuccess', () => {
    const posts = [makePost()];
    const s = forumReducer(
      { ...initialState(), loading: true },
      ForumActions.loadPostsSuccess({ posts }),
    );
    expect(s.loading).toBeFalse();
    expect(s.posts).toEqual(posts);
  });

  it('stores error and clears loading on loadPostsFailure', () => {
    const s = forumReducer(
      { ...initialState(), loading: true },
      ForumActions.loadPostsFailure({ error: 'network error' }),
    );
    expect(s.loading).toBeFalse();
    expect(s.error).toBe('network error');
  });

  // ── loadPost ──────────────────────────────────────────────────────────────

  it('clears activePost and sets postLoading on loadPost', () => {
    const base = { ...initialState(), activePost: makePostDetail() };
    const s = forumReducer(base, ForumActions.loadPost({ id: 'post-1' }));
    expect(s.postLoading).toBeTrue();
    expect(s.activePost).toBeNull();
  });

  it('stores activePost on loadPostSuccess', () => {
    const post = makePostDetail();
    const s = forumReducer(
      { ...initialState(), postLoading: true },
      ForumActions.loadPostSuccess({ post }),
    );
    expect(s.postLoading).toBeFalse();
    expect(s.activePost).toEqual(post);
  });

  it('stores error and clears postLoading on loadPostFailure', () => {
    const s = forumReducer(
      { ...initialState(), postLoading: true },
      ForumActions.loadPostFailure({ error: 'not found' }),
    );
    expect(s.postLoading).toBeFalse();
    expect(s.error).toBe('not found');
  });

  // ── publishDeck ───────────────────────────────────────────────────────────

  it('sets publishLoading on publishDeck', () => {
    const s = forumReducer(
      initialState(),
      ForumActions.publishDeck({ deckId: 'deck-1', description: null }),
    );
    expect(s.publishLoading).toBeTrue();
    expect(s.error).toBeNull();
  });

  it('prepends new post on publishDeckSuccess when not already in list', () => {
    const existing = makePost({ id: 'old' });
    const newPost = makePost({ id: 'new-post' });
    const s = forumReducer(
      { ...initialState(), posts: [existing] },
      ForumActions.publishDeckSuccess({ post: newPost }),
    );
    expect(s.publishLoading).toBeFalse();
    expect(s.posts[0].id).toBe('new-post');
    expect(s.posts).toHaveSize(2);
  });

  it('replaces existing post on publishDeckSuccess when id matches', () => {
    const original = makePost({ id: 'post-1', cardCount: 50 });
    const updated = makePost({ id: 'post-1', cardCount: 100 });
    const s = forumReducer(
      { ...initialState(), posts: [original] },
      ForumActions.publishDeckSuccess({ post: updated }),
    );
    expect(s.posts).toHaveSize(1);
    expect(s.posts[0].cardCount).toBe(100);
  });

  it('stores error and clears publishLoading on publishDeckFailure', () => {
    const s = forumReducer(
      { ...initialState(), publishLoading: true },
      ForumActions.publishDeckFailure({ error: 'unauthorized' }),
    );
    expect(s.publishLoading).toBeFalse();
    expect(s.error).toBe('unauthorized');
  });

  // ── deletePost ────────────────────────────────────────────────────────────

  it('removes post from list on deletePostSuccess', () => {
    const base = { ...initialState(), posts: [makePost({ id: 'p1' }), makePost({ id: 'p2' })] };
    const s = forumReducer(base, ForumActions.deletePostSuccess({ id: 'p1' }));
    expect(s.posts).toHaveSize(1);
    expect(s.posts[0].id).toBe('p2');
  });

  it('clears activePost on deletePostSuccess when ids match', () => {
    const base = { ...initialState(), activePost: makePostDetail({ id: 'p1' }) };
    const s = forumReducer(base, ForumActions.deletePostSuccess({ id: 'p1' }));
    expect(s.activePost).toBeNull();
  });

  it('preserves activePost on deletePostSuccess when ids do not match', () => {
    const active = makePostDetail({ id: 'p2' });
    const base = { ...initialState(), activePost: active };
    const s = forumReducer(base, ForumActions.deletePostSuccess({ id: 'p1' }));
    expect(s.activePost).toBe(active);
  });

  // ── addComment ────────────────────────────────────────────────────────────

  it('appends comment to activePost on addCommentSuccess', () => {
    const base = { ...initialState(), activePost: makePostDetail({ comments: [] }) };
    const comment = makeComment();
    const s = forumReducer(base, ForumActions.addCommentSuccess({ comment }));
    expect(s.activePost!.comments).toHaveSize(1);
    expect(s.activePost!.comments[0]).toEqual(comment);
  });

  it('does not mutate existing comments array on addCommentSuccess', () => {
    const c1 = makeComment({ id: 'c1' });
    const base = { ...initialState(), activePost: makePostDetail({ comments: [c1] }) };
    const c2 = makeComment({ id: 'c2' });
    const s = forumReducer(base, ForumActions.addCommentSuccess({ comment: c2 }));
    expect(s.activePost!.comments).toHaveSize(2);
    expect(base.activePost!.comments).toHaveSize(1); // original unchanged
  });

  it('returns same state reference on addCommentSuccess when activePost is null', () => {
    const base = initialState();
    const s = forumReducer(base, ForumActions.addCommentSuccess({ comment: makeComment() }));
    expect(s).toBe(base);
  });

  // ── updateComment ─────────────────────────────────────────────────────────

  it('replaces comment by id on updateCommentSuccess', () => {
    const original = makeComment({ id: 'c1', content: 'original' });
    const base = { ...initialState(), activePost: makePostDetail({ comments: [original] }) };
    const updated = makeComment({ id: 'c1', content: 'updated' });
    const s = forumReducer(base, ForumActions.updateCommentSuccess({ comment: updated }));
    expect(s.activePost!.comments[0].content).toBe('updated');
    expect(s.activePost!.comments).toHaveSize(1);
  });

  it('leaves other comments unchanged on updateCommentSuccess', () => {
    const c1 = makeComment({ id: 'c1', content: 'first' });
    const c2 = makeComment({ id: 'c2', content: 'second' });
    const base = { ...initialState(), activePost: makePostDetail({ comments: [c1, c2] }) };
    const updatedC1 = makeComment({ id: 'c1', content: 'changed' });
    const s = forumReducer(base, ForumActions.updateCommentSuccess({ comment: updatedC1 }));
    expect(s.activePost!.comments[1].content).toBe('second');
  });

  it('returns same state reference on updateCommentSuccess when activePost is null', () => {
    const base = initialState();
    const s = forumReducer(base, ForumActions.updateCommentSuccess({ comment: makeComment() }));
    expect(s).toBe(base);
  });

  // ── deleteComment ─────────────────────────────────────────────────────────

  it('removes comment by id on deleteCommentSuccess', () => {
    const c1 = makeComment({ id: 'c1' });
    const c2 = makeComment({ id: 'c2' });
    const base = { ...initialState(), activePost: makePostDetail({ comments: [c1, c2] }) };
    const s = forumReducer(base, ForumActions.deleteCommentSuccess({ commentId: 'c1' }));
    expect(s.activePost!.comments).toHaveSize(1);
    expect(s.activePost!.comments[0].id).toBe('c2');
  });

  it('returns same state reference on deleteCommentSuccess when activePost is null', () => {
    const base = initialState();
    const s = forumReducer(base, ForumActions.deleteCommentSuccess({ commentId: 'c1' }));
    expect(s).toBe(base);
  });
});
