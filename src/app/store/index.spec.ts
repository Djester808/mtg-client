import { combineReducers } from '@ngrx/store';
import { appReducers, resetOnSessionChange } from './index';
import { AuthActions } from './auth/auth.actions';
describe('session state isolation', () => {
  it('clears every feature at logout and a new login while accepting the new credentials', () => {
    const reduce = resetOnSessionChange(combineReducers(appReducers));
    const initial = reduce(undefined, { type: 'init' });
    const dirty = { ...initial, forum: { ...initial.forum, posts: [{ id: 'private' } as any] } };
    expect(reduce(dirty, AuthActions.logout()).forum.posts).toEqual([]);
    const next = reduce(dirty, AuthActions.loginSuccess({ token: 'new', username: 'Other' }));
    expect(next.forum.posts).toEqual([]);
    expect(next.auth.token).toBe('new');
  });
});
