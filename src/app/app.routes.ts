import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { GameBoardComponent } from './board/game-board.component';
import { LobbyComponent } from './lobby/lobby.component';
import { KbComponent } from './kb/kb.component';
import { CollectionListComponent } from './collection/collection-list/collection-list.component';
import { CollectionDetailComponent } from './collection/collection-detail/collection-detail.component';
import { DeckListComponent } from './deck/deck-list/deck-list.component';
import { DeckDetailComponent } from './deck/deck-detail/deck-detail.component';
import { ForumListComponent } from './forum/forum-list/forum-list.component';
import { ForumDetailComponent } from './forum/forum-detail/forum-detail.component';
import { CommanderListComponent } from './commanders/commander-list/commander-list.component';
import { CommanderDetailComponent } from './commanders/commander-detail/commander-detail.component';
import { CommunityComponent } from './community/community.component';
import { UserProfileComponent } from './community/user-profile/user-profile.component';
import { PlayersListComponent } from './community/players-list/players-list.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'register',
    component: RegisterComponent,
  },
  {
    path: 'lobby',
    component: LobbyComponent,
    canActivate: [authGuard],
  },
  {
    path: 'game/:gameId',
    component: GameBoardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'kb',
    component: KbComponent,
  },
  {
    path: 'collection',
    component: CollectionListComponent,
    canActivate: [authGuard],
  },
  {
    path: 'collection/:id',
    component: CollectionDetailComponent,
    canActivate: [authGuard],
  },
  {
    path: 'deck',
    component: DeckListComponent,
    canActivate: [authGuard],
  },
  {
    path: 'deck/:id',
    component: DeckDetailComponent,
    canActivate: [authGuard],
  },
  // Community hub: Forum + Commanders + Players tabs
  {
    path: 'community',
    component: CommunityComponent,
    children: [
      { path: '', redirectTo: 'forum', pathMatch: 'full' },
      { path: 'forum', component: ForumListComponent },
      { path: 'commanders', component: CommanderListComponent },
      { path: 'players', component: PlayersListComponent },
    ],
  },
  // Legacy redirects so old direct links still work
  { path: 'forum', redirectTo: '/community/forum', pathMatch: 'full' },
  { path: 'commanders', redirectTo: '/community/commanders', pathMatch: 'full' },
  // Detail pages stay at their own top-level routes
  { path: 'forum/:id', component: ForumDetailComponent },
  { path: 'commanders/:oracleId', component: CommanderDetailComponent },
  { path: 'u/:username', component: UserProfileComponent },
];
