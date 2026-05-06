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
}

const initialState: ForumState = {
  posts: [],
  activePost: null,
  loading: false,
  postLoading: false,
  publishLoading: false,
  error: null,
};

export const forumReducer = createReducer(
  initialState,

  on(ForumActions.loadPosts, state => ({ ...state, loading: true, error: null })),
  on(ForumActions.loadPostsSuccess, (state, { posts }) => ({ ...state, loading: false, posts })),
  on(ForumActions.loadPostsFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(ForumActions.loadPost, state => ({ ...state, postLoading: true, error: null, activePost: null })),
  on(ForumActions.loadPostSuccess, (state, { post }) => ({ ...state, postLoading: false, activePost: post })),
  on(ForumActions.loadPostFailure, (state, { error }) => ({ ...state, postLoading: false, error })),

  on(ForumActions.publishDeck, state => ({ ...state, publishLoading: true, error: null })),
  on(ForumActions.publishDeckSuccess, (state, { post }) => ({
    ...state,
    publishLoading: false,
    posts: state.posts.some(p => p.id === post.id)
      ? state.posts.map(p => p.id === post.id ? post : p)
      : [post, ...state.posts],
  })),
  on(ForumActions.publishDeckFailure, (state, { error }) => ({ ...state, publishLoading: false, error })),

  on(ForumActions.deletePostSuccess, (state, { id }) => ({
    ...state,
    posts: state.posts.filter(p => p.id !== id),
    activePost: state.activePost?.id === id ? null : state.activePost,
  })),

  on(ForumActions.addCommentSuccess, (state, { comment }) => {
    if (!state.activePost) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: [...state.activePost.comments, comment],
      },
    };
  }),

  on(ForumActions.updateCommentSuccess, (state, { comment }) => {
    if (!state.activePost) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: state.activePost.comments.map(c => c.id === comment.id ? comment : c),
      },
    };
  }),

  on(ForumActions.deleteCommentSuccess, (state, { commentId }) => {
    if (!state.activePost) return state;
    return {
      ...state,
      activePost: {
        ...state.activePost,
        comments: state.activePost.comments.filter(c => c.id !== commentId),
      },
    };
  }),
);
