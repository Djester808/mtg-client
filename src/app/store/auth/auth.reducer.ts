import { createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';

export interface AuthState {
  token: string | null;
  username: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: null,
  username: null,
  loading: false,
  error: null,
};

export const authReducer = createReducer(
  initialState,

  on(AuthActions.login, AuthActions.register, state => ({
    ...state, loading: true, error: null,
  })),

  on(AuthActions.loginSuccess, AuthActions.registerSuccess, (state, { token, username }) => ({
    ...state, loading: false, token, username,
  })),

  on(AuthActions.loginFailure, AuthActions.registerFailure, (state, { error }) => ({
    ...state, loading: false, error,
  })),

  on(AuthActions.logout, () => initialState),

  on(AuthActions.restoreSession, state => {
    const token    = localStorage.getItem('auth_token');
    const username = localStorage.getItem('auth_username');
    return token && username ? { ...state, token, username } : state;
  }),
);
