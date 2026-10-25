import { createReducer, on } from '@ngrx/store';
import { ForumPostSummary, ForumPostDetail } from '../../models/forum.models';
import { ForumActions } from './forum.actions';

export interface ForumState {
  posts: ForumPostSummary[];
  activePost: ForumPostDetail | null;
  loading: boolean;
  postLoading: boolean;
  publishLoading: boolean;
  error: string | null;
  postsOffset: number;
  morePosts: boolean;
  commentsOffset: number;
  moreComments: boolean;
  commentsLoading: boolean;
}

const initialState: ForumState = {
  posts: [],
  activePost: null,
  loading: false,
  postLoading: false,
  publishLoading: false,
  error: null,
  postsOffset: 0,
  morePosts: false,
  commentsOffset: 0,
  moreComments: false,
  commentsLoading: false,
};

export const forumReducer = createReducer(
  initialState,

  on(ForumActions.loadPosts, ForumActions.loadMorePosts, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(ForumActions.loadPostsSuccess, (state, { posts, offset = 0 }) => ({
    ...state,
    loading: false,
    error: null,
    postsOffset: offset + posts.length,
    morePosts: posts.length === 50,
    posts:
      offset === 0
        ? posts
        : [...state.posts, ...posts.filter((p) => !state.posts.some((old) => old.id === p.id))],
  })),
  on(ForumActions.loadPostsFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(ForumActions.loadPost, (state) => ({
    ...state,
    postLoading: true,
    error: null,
    activePost: null,
    commentsOffset: 0,
    moreComments: false,
    commentsLoading: false,
  })),
  on(ForumActions.loadPostSuccess, (state, { post }) => ({
    ...state,
    postLoading: false,
    activePost: post,
    commentsOffset: post.comments.length,
    moreComments: post.comments.length === 50,
  })),
  on(ForumActions.loadPostFailure, (state, { error }) => ({ ...state, postLoading: false, error })),

  on(ForumActions.loadMoreComments, (state) => ({ ...state, commentsLoading: true })),
  on(ForumActions.loadMoreCommentsSuccess, (state, { id, comments, offset }) =>
    state.activePost?.id !== id
      ? state
      : {
          ...state,
          commentsLoading: false,
          commentsOffset: offset + comments.length,
          moreComments: comments.length === 50,
          activePost: {
            ...state.activePost,
            comments: [
              ...state.activePost.comments,
              ...comments.filter((c) => !state.activePost!.comments.some((old) => old.id === c.id)),
            ],
          },
        },
  ),
  on(ForumActions.loadMoreCommentsFailure, (state, { id, error }) =>
    state.activePost?.id !== id ? state : { ...state, commentsLoading: false, error },
  ),
  on(ForumActions.publishDeck, (state) => ({ ...state, publishLoading: true, error: null })),
  on(ForumActions.publishDeckSuccess, (state, { post }) => ({
    ...state,
    publishLoading: false,
    posts: state.posts.some((p) => p.id === post.id)
      ? state.posts.map((p) => (p.id === post.id ? post : p))
      : [post, ...state.posts],
  })),
  on(ForumActions.publishDeckFailure, (state, { error }) => ({
    ...state,
    publishLoading: false,
    error,
  })),

  on(ForumActions.deletePostSuccess, (state, { id }) => ({
    ...state,
    posts: state.posts.filter((p) => p.id !== id),
    activePost: state.activePost?.id === id ? null : state.activePost,
  })),

  on(ForumActions.addCommentSuccess, (state, { comment, postId }) => {
    if (!state.activePost || state.activePost.id !== postId) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: [...state.activePost.comments, comment],
      },
    };
  }),

  on(ForumActions.updateCommentSuccess, (state, { comment, postId }) => {
    if (!state.activePost || state.activePost.id !== postId) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: state.activePost.comments.map((c) => (c.id === comment.id ? comment : c)),
      },
    };
  }),

  on(ForumActions.deleteCommentSuccess, (state, { commentId, postId }) => {
    if (!state.activePost || state.activePost.id !== postId) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: state.activePost.comments.filter((c) => c.id !== commentId),
      },
    };
  }),
);
