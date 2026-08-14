import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap, tap } from 'rxjs';
import { ForumActions } from './forum.actions';
import { ForumApiService } from '../../services/forum-api.service';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class ForumEffects {
  loadPosts$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.loadPosts),
      switchMap(() =>
        this.api.getPosts().pipe(
          map((posts) => ForumActions.loadPostsSuccess({ posts })),
          catchError((err) => of(ForumActions.loadPostsFailure({ error: err.message }))),
        ),
      ),
    ),
  );

  loadPost$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.loadPost),
      switchMap(({ id }) =>
        this.api.getPost(id).pipe(
          map((post) => ForumActions.loadPostSuccess({ post })),
          catchError((err) => of(ForumActions.loadPostFailure({ error: err.message }))),
        ),
      ),
    ),
  );

  publishDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.publishDeck),
      switchMap(({ deckId, description }) =>
        this.api.publishDeck(deckId, description).pipe(
          map((post) => ForumActions.publishDeckSuccess({ post })),
          catchError((err) => of(ForumActions.publishDeckFailure({ error: err.message }))),
        ),
      ),
    ),
  );

  navigateAfterPublish$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ForumActions.publishDeckSuccess),
        tap(({ post }) => this.router.navigate(['/forum', post.id])),
      ),
    { dispatch: false },
  );

  deletePost$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.deletePost),
      mergeMap(({ id }) =>
        this.api.deletePost(id).pipe(
          map(() => ForumActions.deletePostSuccess({ id })),
          catchError((err) =>
            of(ForumActions.deletePostFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
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
      mergeMap(({ postId, content }) =>
        this.api.addComment(postId, content).pipe(
          map((comment) => ForumActions.addCommentSuccess({ comment })),
          catchError((err) => of(ForumActions.addCommentFailure({ error: err.message }))),
        ),
      ),
    ),
  );

  updateComment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.updateComment),
      mergeMap(({ postId, commentId, content }) =>
        this.api.updateComment(postId, commentId, content).pipe(
          map((comment) => ForumActions.updateCommentSuccess({ comment })),
          catchError((err) =>
            of(ForumActions.updateCommentFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  deleteComment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForumActions.deleteComment),
      mergeMap(({ postId, commentId }) =>
        this.api.deleteComment(postId, commentId).pipe(
          map(() => ForumActions.deleteCommentSuccess({ commentId })),
          catchError((err) =>
            of(ForumActions.deleteCommentFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
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
