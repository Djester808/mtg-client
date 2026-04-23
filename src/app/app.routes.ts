import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { GameBoardComponent } from './board/game-board.component';
import { LobbyComponent } from './lobby/lobby.component';
import { KbComponent } from './kb/kb.component';

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
];
