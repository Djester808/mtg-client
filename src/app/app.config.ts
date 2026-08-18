import { ApplicationConfig, APP_INITIALIZER, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideStore, Store } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import { appReducers } from './store';
import { CollectionEffects } from './store/collection/collection.effects';
import { AuthEffects } from './store/auth/auth.effects';
import { DeckEffects } from './store/deck/deck.effects';
import { ForumEffects } from './store/forum/forum.effects';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthActions } from './store/auth/auth.actions';
import { KeywordLinkService } from './services/keyword-link.service';

function restoreSession(store: Store) {
  return () => store.dispatch(AuthActions.restoreSession());
}

/**
 * `OracleSymbolsPipe` is pure and synchronous, so the keyword terms have to be in place
 * before the first card renders or its text stays unlinked until something else changes
 * its input. The request is ~10 KB of static data and the service swallows its own
 * failures, so a slow or missing API delays boot briefly and then renders plain text
 * rather than blocking the app.
 */
export function loadKeywordLinks(keywords: KeywordLinkService) {
  return () => keywords.load();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimations(),
    provideStore(appReducers),
    provideEffects([CollectionEffects, AuthEffects, DeckEffects, ForumEffects]),
    // Dev builds only: devtools keeps 50 deep state snapshots and re-enters the
    // zone per message — none of which belongs in production.
    ...(isDevMode()
      ? [
          provideStoreDevtools({
            maxAge: 50,
            logOnly: false,
            connectInZone: true,
          }),
        ]
      : []),
    {
      provide: APP_INITIALIZER,
      useFactory: restoreSession,
      deps: [Store],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: loadKeywordLinks,
      deps: [KeywordLinkService],
      multi: true,
    },
  ],
};
