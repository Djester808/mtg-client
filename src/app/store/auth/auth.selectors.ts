import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.reducer';

const selectAuthState = createFeatureSelector<AuthState>('auth');

export const selectToken      = createSelector(selectAuthState, s => s.token);
export const selectUsername   = createSelector(selectAuthState, s => s.username);
export const selectIsLoggedIn = createSelector(selectAuthState, s => !!s.token);
export const selectAuthLoading = createSelector(selectAuthState, s => s.loading);
export const selectAuthError   = createSelector(selectAuthState, s => s.error);
