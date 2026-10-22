import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, UIActions } from '../../store';
import { selectZoneViewer, selectPlayers, selectLocalPlayerId } from '../../store/selectors';
import { CardCastingService } from '../../game/card-casting.service';
import { selectGameState, selectUIMode } from '../../store/selectors';
import { CardDto } from '../../models/game.models';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { BoardZonesService, PublicZone, ZonePile } from '../../board/board-zones.service';

@Component({
  selector: 'app-zone-viewer',
  standalone: true,
  imports: [CommonModule, ManaCostComponent, CardOptionsMenuComponent],
  templateUrl: './zone-viewer.component.html',
  styleUrls: ['./zone-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneViewerComponent implements OnDestroy {
  private casting = inject(CardCastingService);
  private cdr = inject(ChangeDetectorRef);
  private zoneViews = inject(BoardZonesService);
  private returnFocus = document.activeElement as HTMLElement | null;
  pickZone(playerId: string, zone: PublicZone): void {
    this.contextCard = null;
    this.store.dispatch(UIActions.openZoneViewer({ playerId, zone }));
    this.cdr.markForCheck();
  }
  detail(card: CardDto): void {
    this.contextCard = null;
    this.store.dispatch(UIActions.selectCard({ cardId: card.cardId }));
    this.cdr.markForCheck();
  }
  cast(card: CardDto, allowed: boolean): void {
    if (!allowed) return;
    this.close();
    this.casting.start(card);
  }
  contextCard: CardDto | null = null;
  contextX = 0;
  contextY = 0;
  options(event: MouseEvent, card: CardDto): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextCard = card;
    this.contextX = event.clientX;
    this.contextY = event.clientY;
    this.cdr.markForCheck();
  }
  optionsKey(event: KeyboardEvent, card: CardDto): void {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.options(new MouseEvent('contextmenu', { clientX: r.left, clientY: r.bottom }), card);
  }
  inspect(): void {
    const card = this.contextCard;
    if (!card) return;
    this.detail(card);
  }

  private dialog: HTMLDialogElement | null = null;
  private frame: number | null = null;
  @ViewChild('viewerDialog') set viewerDialog(ref: ElementRef<HTMLDialogElement> | undefined) {
    this.dialog = ref?.nativeElement ?? null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.dialog)
      this.frame = requestAnimationFrame(() => {
        if (this.dialog?.isConnected && !this.dialog.open) this.dialog.showModal();
      });
  }
  ngOnDestroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.dialog?.close();
    this.returnFocus?.focus();
  }

  vm$ = combineLatest([
    this.store.select(selectZoneViewer),
    this.store.select(selectPlayers),
    this.store.select(selectLocalPlayerId),
    this.store.select(selectGameState),
    this.store.select(selectUIMode),
  ]).pipe(
    map(([viewer, players, localId, game, mode]) => {
      if (!viewer.open || !viewer.playerId) return null;

      const player = players.find((p) => p.playerId === viewer.playerId);
      if (!player) return null;

      const piles = this.zoneViews.piles(player);
      const hidden =
        viewer.zone === 'library' || (viewer.zone === 'hand' && player.playerId !== localId);
      const cards: CardDto[] = hidden
        ? []
        : viewer.zone === 'graveyard'
          ? player.graveyard
          : viewer.zone === 'exile'
            ? player.exile
            : viewer.zone === 'command'
              ? (player.command ?? [])
              : viewer.zone === 'hand'
                ? player.hand
                : [];
      const count =
        viewer.zone === 'library'
          ? player.libraryCount
          : viewer.zone === 'hand'
            ? player.handCount
            : cards.length;

      const isLocal = viewer.playerId === localId;
      const ownerLabel = isLocal ? 'Your' : `${player.name}'s`;
      const zoneLabel = viewer.zone ? viewer.zone[0].toUpperCase() + viewer.zone.slice(1) : 'Zone';

      const canCast =
        isLocal && viewer.zone === 'command' && mode === 'idle' ? (game?.castableCards ?? []) : [];
      return {
        cards:
          viewer.zone === 'hand' ? cards : (piles.find((p) => p.key === viewer.zone)?.cards ?? []),
        piles,
        playerId: player.playerId,
        count,
        hidden,
        isLocal,
        canCast,
        title: `${ownerLabel} ${zoneLabel}`,
        zone: viewer.zone,
      };
    }),
  );

  constructor(private store: Store<AppState>) {}

  close(): void {
    this.dialog?.close();
    this.store.dispatch(UIActions.closeZoneViewer());
    this.returnFocus?.focus();
    this.cdr.markForCheck();
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

  trackZone(_: number, pile: ZonePile): string {
    return pile.key;
  }
  trackByCard(_: number, c: CardDto): string {
    return c.cardId;
  }
}
