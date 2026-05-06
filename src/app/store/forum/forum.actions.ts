import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ForumPostSummary, ForumPostDetail, ForumComment } from '../../models/forum.models';

export const ForumActions = createActionGroup({
  source: 'Forum',
  events: {
    'Load Posts':         emptyProps(),
    'Load Posts Success': props<{ posts: ForumPostSummary[] }>(),
    'Load Posts Failure': props<{ error: string }>(),

    'Load Post':         props<{ id: string }>(),
    'Load Post Success': props<{ post: ForumPostDetail }>(),
    'Load Post Failure': props<{ error: string }>(),

    'Publish Deck':         props<{ deckId: string; description: string | null }>(),
    'Publish Deck Success': props<{ post: ForumPostSummary }>(),
    'Publish Deck Failure': props<{ error: string }>(),

    'Delete Post':         props<{ id: string }>(),
    'Delete Post Success': props<{ id: string }>(),

    'Add Comment':         props<{ postId: string; content: string }>(),
    'Add Comment Success': props<{ comment: ForumComment }>(),
    'Add Comment Failure': props<{ error: string }>(),

    'Update Comment':         props<{ postId: string; commentId: string; content: string }>(),
    'Update Comment Success': props<{ comment: ForumComment }>(),

    'Delete Comment':         props<{ postId: string; commentId: string }>(),
    'Delete Comment Success': props<{ commentId: string }>(),
  },
});
