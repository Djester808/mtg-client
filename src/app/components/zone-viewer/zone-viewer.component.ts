import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, UIActions } from '../../store';
import {
  selectZoneViewer, selectPlayers, selectLocalPlayerId,
} from '../../store/selectors';
import { CardDto } from '../../models/game.models';
import { CardComponent } from '../card/card.component';

@Component({
  selector: 'app-zone-viewer',
  standalone: true,
  imports: [CommonModule, CardComponent],
  templateUrl: './zone-viewer.component.html',
  styleUrls: ['./zone-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneViewerComponent {
  vm$ = combineLatest([
    this.store.select(selectZoneViewer),
    this.store.select(selectPlayers),
    this.store.select(selectLocalPlayerId),
  ]).pipe(
    map(([viewer, players, localId]) => {
      if (!viewer.open || !viewer.playerId) return null;

      const player = players.find(p => p.playerId === viewer.playerId);
      if (!player) return null;

      const cards: CardDto[] = viewer.zone === 'graveyard'
        ? player.graveyard
        : player.exile;

      const isLocal = viewer.playerId === localId;
      const ownerLabel = isLocal ? 'Your' : `${player.name}'s`;
      const zoneLabel = viewer.zone === 'graveyard' ? 'Graveyard' : 'Exile';

      return { cards, title: `${ownerLabel} ${zoneLabel}`, zone: viewer.zone };
    })
  );

  constructor(private store: Store<AppState>) {}

  close(): void {
    this.store.dispatch(UIActions.closeZoneViewer());
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('viewer-backdrop')) {
      this.close();
    }
  }

  onCardHover(card: CardDto): void {
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }

  trackByCard(_: number, c: CardDto): string {
    return c.cardId;
  }
}
