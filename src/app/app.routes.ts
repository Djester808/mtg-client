import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

// Every route is lazy (loadComponent) so the initial bundle carries only the
// shell. Home stays eager-ish in practice — the router fetches it immediately on
// '/' — but heavyweight pages like deck-detail no longer ship to visitors who
// never open them.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'kb',
    loadComponent: () => import('./kb/kb.component').then((m) => m.KbComponent),
  },
  {
    path: 'collection',
    loadComponent: () =>
      import('./collection/collection-list/collection-list.component').then(
        (m) => m.CollectionListComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'collection/:id',
    loadComponent: () =>
      import('./collection/collection-detail/collection-detail.component').then(
        (m) => m.CollectionDetailComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'deck',
    loadComponent: () =>
      import('./deck/deck-list/deck-list.component').then((m) => m.DeckListComponent),
    canActivate: [authGuard],
  },
  // Must precede 'deck/:id', or /deck/build is read as a deck whose id is "build".
  {
    path: 'deck/build',
    loadComponent: () =>
      import('./deck/ai-deck-builder/ai-deck-builder.component').then(
        (m) => m.AiDeckBuilderComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'deck/:id',
    loadComponent: () =>
      import('./deck/deck-detail/deck-detail.component').then((m) => m.DeckDetailComponent),
    canActivate: [authGuard],
  },
  // Community hub: Forum + Commanders + Players tabs
  {
    path: 'community',
    loadComponent: () =>
      import('./community/community.component').then((m) => m.CommunityComponent),
    children: [
      { path: '', redirectTo: 'forum', pathMatch: 'full' },
      {
        path: 'forum',
        loadComponent: () =>
          import('./forum/forum-list/forum-list.component').then((m) => m.ForumListComponent),
      },
      {
        path: 'commanders',
        loadComponent: () =>
          import('./commanders/commander-list/commander-list.component').then(
            (m) => m.CommanderListComponent,
          ),
      },
      {
        path: 'players',
        loadComponent: () =>
          import('./community/players-list/players-list.component').then(
            (m) => m.PlayersListComponent,
          ),
      },
    ],
  },
  // Legacy redirects so old direct links still work
  { path: 'forum', redirectTo: '/community/forum', pathMatch: 'full' },
  { path: 'commanders', redirectTo: '/community/commanders', pathMatch: 'full' },
  // Detail pages stay at their own top-level routes
  {
    path: 'forum/:id',
    loadComponent: () =>
      import('./forum/forum-detail/forum-detail.component').then((m) => m.ForumDetailComponent),
  },
  {
    path: 'commanders/:oracleId',
    loadComponent: () =>
      import('./commanders/commander-detail/commander-detail.component').then(
        (m) => m.CommanderDetailComponent,
      ),
  },
  // The account page: the signed-in user's own profile. The navbar has linked here since
  // it was written; until now there was no route behind it, so the item did nothing.
  {
    path: 'account',
    loadComponent: () =>
      import('./profile/profile-edit/profile-edit.component').then((m) => m.ProfileEditComponent),
    canActivate: [authGuard],
  },
  // Playing a game. The board joins the SignalR hub on init and leaves on destroy, so the
  // route is the whole lifecycle of a connection.
  {
    path: 'play/:gameId',
    loadComponent: () =>
      import('./game/game-board/game-board.component').then((m) => m.GameBoardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'u/:username',
    loadComponent: () =>
      import('./community/user-profile/user-profile.component').then((m) => m.UserProfileComponent),
  },
];
