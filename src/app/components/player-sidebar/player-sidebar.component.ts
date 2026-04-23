import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { PlayerStateDto, ManaColor } from '../../models/game.models';
import { UIActions } from '../../store/ui/ui.actions';
import { AppState } from '../../store';

@Component({
  selector: 'app-player-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-sidebar.component.html',
  styleUrls: ['./player-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerSidebarComponent {
  @Input() player!: PlayerStateDto;
  @Input() isLocal = false;
  @Input() isActive = false;

  readonly ManaColor = ManaColor;

  readonly manaClass: Record<string, string> = {
    W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c',
  };

  constructor(private store: Store<AppState>) {}

  get manaEntries(): { color: ManaColor; count: number }[] {
    const amounts = this.player?.manaPool?.amounts ?? {};
    return Object.entries(amounts)
      .filter(([, count]) => count > 0)
      .map(([color, count]) => ({ color: color as ManaColor, count: count as number }));
  }

  get hasMana(): boolean {
    return this.manaEntries.length > 0;
  }

  openGraveyard(): void {
    this.store.dispatch(UIActions.openZoneViewer({
      playerId: this.player.playerId,
      zone: 'graveyard',
    }));
  }

  openExile(): void {
    this.store.dispatch(UIActions.openZoneViewer({
      playerId: this.player.playerId,
      zone: 'exile',
    }));
  }

  manaTrack(_: number, entry: { color: ManaColor; count: number }): string {
    return entry.color;
  }
}
