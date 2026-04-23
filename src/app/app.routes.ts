import { Routes } from '@angular/router';
import { GameBoardComponent } from './board/game-board.component';
import { LobbyComponent } from './lobby/lobby.component';

export const routes: Routes = [
  {
    path: '',
    component: LobbyComponent,
    pathMatch: 'full',
  },
  {
    path: 'game/:gameId',
    component: GameBoardComponent,
  },
];
