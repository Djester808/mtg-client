import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { GameBoardComponent } from './board/game-board.component';
import { LobbyComponent } from './lobby/lobby.component';
import { KbComponent } from './kb/kb.component';
import { CollectionListComponent } from './collection/collection-list/collection-list.component';
import { CollectionDetailComponent } from './collection/collection-detail/collection-detail.component';
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
];
