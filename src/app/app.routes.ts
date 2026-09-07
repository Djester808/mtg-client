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
  // Tools: things for the table rather than the deck list. No guard — the life counter is
  // useful to four people around a kitchen table with nobody signed in, and asking for an
  // account first would be asking for one to do arithmetic.
  {
    path: 'tools',
    loadComponent: () =>
      import('./tools/tools-hub/tools-hub.component').then((m) => m.ToolsHubComponent),
    pathMatch: 'full',
  },
  {
    path: 'tools/life-counter',
    loadComponent: () =>
      import('./tools/life-counter/life-counter.component').then((m) => m.LifeCounterComponent),
  },
  // The card pipeline's dispute queue: cards two models translated differently, with both
  // readings side by side so a person can say which one is right. A desktop surface
  // (CARD_ENGINE_PLAN.md, 2026-09-06) — two JSON documents read against each other is a
  // two-column layout by nature.
  {
    path: 'tools/card-disputes',
    loadComponent: () =>
      import('./tools/card-disputes/card-disputes.component').then((m) => m.CardDisputesComponent),
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
  // Starting a game: your decks, who to invite, and who has invited you.
  {
    path: 'play',
    loadComponent: () =>
      import('./game/game-lobby/game-lobby.component').then((m) => m.GameLobbyComponent),
    canActivate: [authGuard],
  },
  // The lobby and the board, restored to the routes they had before the engine UI was
  // removed. Both are lazy so the game slice is not paid for on every other page.
  {
    path: 'lobby',
    loadComponent: () => import('./lobby/lobby.component').then((m) => m.LobbyComponent),
    canActivate: [authGuard],
  },
  {
    path: 'game/:gameId',
    loadComponent: () => import('./board/game-board.component').then((m) => m.GameBoardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'u/:username',
    loadComponent: () =>
      import('./community/user-profile/user-profile.component').then((m) => m.UserProfileComponent),
  },
];
