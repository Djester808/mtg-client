import { inject } from '@angular/core';
import { OwnerDraftsService } from '../../services/owner-drafts.service';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, concatMap, of, switchMap, tap, takeUntil, repeat } from 'rxjs';
import { AuthActions } from '../auth/auth.actions';
import { ForumActions } from './forum.actions';
import { ForumApiService } from '../../services/forum-api.service';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class ForumEffects {
  private readonly sessionBoundary$ = this.actions$.pipe(
    ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
  );
  private readonly drafts = inject(OwnerDraftsService);
  loadPosts$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.loadPosts, ForumActions.loadMorePosts),
      switchMap((action) =>
        this.api.getPosts('offset' in action ? action.offset : 0).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map((posts) =>
            ForumActions.loadPostsSuccess({
              posts,
              offset: 'offset' in action ? action.offset : 0,
            }),
          ),
          catchError((err) => of(ForumActions.loadPostsFailure({ error: err.message }))),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  loadPost$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.loadPost),
      switchMap(({ id }) =>
        this.api.getPost(id).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map((post) => ForumActions.loadPostSuccess({ post })),
          catchError((err) => of(ForumActions.loadPostFailure({ error: err.message }))),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  loadMoreComments$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.loadMoreComments),
      switchMap(({ id, offset }) =>
        this.api.getPost(id, offset).pipe(
          map((post) =>
            ForumActions.loadMoreCommentsSuccess({ id, offset, comments: post.comments }),
          ),
          catchError((err) =>
            of(ForumActions.loadMoreCommentsFailure({ id, error: describeHttpError(err) })),
          ),
          takeUntil(
            this.actions$.pipe(
              ofType(
                ForumActions.loadPost,
                AuthActions.logout,
                AuthActions.loginSuccess,
                AuthActions.registerSuccess,
              ),
            ),
          ),
        ),
      ),
    ),
  );

  publishDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.publishDeck),
      concatMap(({ deckId, description }) =>
        this.api.publishDeck(deckId, description).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map((post) => ForumActions.publishDeckSuccess({ post })),
          catchError((err) => of(ForumActions.publishDeckFailure({ error: err.message }))),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  navigateAfterPublish$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ForumActions.publishDeckSuccess),
        tap(({ post }) => {
          this.drafts.remove('publish', post.deckId);
          void this.router.navigate(['/forum', post.id]);
        }),
      ),
    { dispatch: false },
  );

  deletePost$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.deletePost),
      concatMap(({ id }) =>
        this.api.deletePost(id).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map(() => ForumActions.deletePostSuccess({ id })),
          catchError((err) =>
            of(ForumActions.deletePostFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  navigateAfterDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ForumActions.deletePostSuccess),
        tap(() => this.router.navigate(['/forum'])),
      ),
    { dispatch: false },
  );

  addComment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.addComment),
      concatMap(({ postId, content }) =>
        this.api.addComment(postId, content).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map((comment) => ForumActions.addCommentSuccess({ comment, postId })),
          catchError((err) => of(ForumActions.addCommentFailure({ error: err.message }))),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  updateComment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.updateComment),
      concatMap(({ postId, commentId, content }) =>
        this.api.updateComment(postId, commentId, content).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map((comment) => ForumActions.updateCommentSuccess({ comment, postId })),
          catchError((err) =>
            of(ForumActions.updateCommentFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  deleteComment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.deleteComment),
      concatMap(({ postId, commentId }) =>
        this.api.deleteComment(postId, commentId).pipe(
          takeUntil(
            this.actions$.pipe(
              ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
            ),
          ),
          map(() => ForumActions.deleteCommentSuccess({ commentId, postId })),
          catchError((err) =>
            of(ForumActions.deleteCommentFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
      takeUntil(this.sessionBoundary$),
      repeat(),
    ),
  );

  notifyFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          ForumActions.publishDeckFailure,
          ForumActions.deletePostFailure,
          ForumActions.addCommentFailure,
          ForumActions.updateCommentFailure,
          ForumActions.deleteCommentFailure,
        ),
        tap(({ error }) => this.toast.error(error)),
      ),
    { dispatch: false },
  );

  constructor(
    private actions$: Actions,
    private api: ForumApiService,
    private router: Router,
    private toast: ToastService,
  ) {}
}
