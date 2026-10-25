import { createSelector } from '@ngrx/store';
import { AppState } from '..';
import { ForumState } from './forum.reducer';

const selectForumState = (state: AppState) => state.forum as ForumState;

export const selectForumPosts = createSelector(selectForumState, (s) => s.posts);
export const selectActiveForumPost = createSelector(selectForumState, (s) => s.activePost);
export const selectForumLoading = createSelector(selectForumState, (s) => s.loading);
export const selectForumPostLoading = createSelector(selectForumState, (s) => s.postLoading);
export const selectForumPublishLoading = createSelector(selectForumState, (s) => s.publishLoading);
export const selectForumError = createSelector(selectForumState, (s) => s.error);

export const selectForumPagination = createSelector(selectForumState, (s) => ({
  offset: s.postsOffset,
  more: s.morePosts,
}));
export const selectForumCommentPagination = createSelector(selectForumState, (s) => ({
  offset: s.commentsOffset,
  more: s.moreComments,
  loading: s.commentsLoading,
}));
