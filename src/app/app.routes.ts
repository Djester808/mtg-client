import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { GameBoardComponent } from './board/game-board.component';
import { LobbyComponent } from './lobby/lobby.component';
import { KbComponent } from './kb/kb.component';
import { CollectionListComponent } from './collection/collection-list/collection-list.component';
import { CollectionDetailComponent } from './collection/collection-detail/collection-detail.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    pathMatch: 'full',
  },
  {
    path: 'lobby',
    component: LobbyComponent,
  },
  {
    path: 'game/:gameId',
    component: GameBoardComponent,
  },
  {
    path: 'kb',
    component: KbComponent,
  },
  {
    path: 'collection',
    component: CollectionListComponent,
  },
  {
    path: 'collection/:id',
    component: CollectionDetailComponent,
  },
];
