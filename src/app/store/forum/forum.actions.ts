import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ForumPostSummary, ForumPostDetail, ForumComment } from '../../models/forum.models';

export const ForumActions = createActionGroup({
  source: 'Forum',
  events: {
    'Load Posts': emptyProps(),
    'Load More Posts': props<{ offset: number }>(),
    'Load Posts Success': props<{ posts: ForumPostSummary[]; offset?: number }>(),
    'Load Posts Failure': props<{ error: string }>(),

    'Load Post': props<{ id: string }>(),
    'Load Post Success': props<{ post: ForumPostDetail }>(),
    'Load Post Failure': props<{ error: string }>(),
    'Load More Comments': props<{ id: string; offset: number }>(),
    'Load More Comments Success': props<{ id: string; comments: ForumComment[]; offset: number }>(),
    'Load More Comments Failure': props<{ id: string; error: string }>(),

    'Publish Deck': props<{ deckId: string; description: string | null }>(),
    'Publish Deck Success': props<{ post: ForumPostSummary }>(),
    'Publish Deck Failure': props<{ error: string }>(),

    'Delete Post': props<{ id: string }>(),
    'Delete Post Success': props<{ id: string }>(),
    'Delete Post Failure': props<{ error: string }>(),

    'Add Comment': props<{ postId: string; content: string }>(),
    'Add Comment Success': props<{ comment: ForumComment; postId: string }>(),
    'Add Comment Failure': props<{ error: string }>(),

    'Update Comment': props<{ postId: string; commentId: string; content: string }>(),
    'Update Comment Success': props<{ comment: ForumComment; postId: string }>(),
    'Update Comment Failure': props<{ error: string }>(),

    'Delete Comment': props<{ postId: string; commentId: string }>(),
    'Delete Comment Success': props<{ commentId: string; postId: string }>(),
    'Delete Comment Failure': props<{ error: string }>(),
  },
});
