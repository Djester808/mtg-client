import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideStore, Store } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import { appReducers } from './store';
import { GameEffects } from './store/game/game.effects';
import { CollectionEffects } from './store/collection/collection.effects';
import { AuthEffects } from './store/auth/auth.effects';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthActions } from './store/auth/auth.actions';

function restoreSession(store: Store) {
  return () => store.dispatch(AuthActions.restoreSession());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimations(),
    provideStore(appReducers),
    provideEffects([GameEffects, CollectionEffects, AuthEffects]),
    provideStoreDevtools({
      maxAge: 50,
      logOnly: false,
      connectInZone: true,
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: restoreSession,
      deps: [Store],
      multi: true,
    },
  ],
};
