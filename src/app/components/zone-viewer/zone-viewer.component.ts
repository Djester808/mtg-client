import { LibraryArrangementDraftService } from '../../game/library-arrangement-draft.service';
import { ChoiceSelectionService } from '../../game/choices/choice-selection.service';
import { ChoiceControlsComponent } from '../choice-controls/choice-controls.component';
import { LibraryAction, LibrarySearchRequest } from '../../game/library-action';
import { LibraryActionsService } from '../../game/library-actions.service';
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
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, UIActions } from '../../store';
import { selectZoneViewer, selectPlayers, selectLocalPlayerId } from '../../store/selectors';
import { CardCastingService } from '../../game/card-casting.service';
import { selectGameState, selectUIMode, selectGameReady } from '../../store/selectors';
import { CardDto } from '../../models/game.models';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { BoardZonesService, PublicZone, ZonePile } from '../../board/board-zones.service';

@Component({
  selector: 'app-zone-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ManaCostComponent,
    CardOptionsMenuComponent,
    ChoiceControlsComponent,
  ],
  providers: [ChoiceSelectionService, LibraryArrangementDraftService],
  templateUrl: './zone-viewer.component.html',
  styleUrls: ['./zone-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneViewerComponent implements OnDestroy {
  readonly arrangement = inject(LibraryArrangementDraftService);
  beginArrangement(cards: CardDto[], ownerId: string, allowed: boolean): void {
    if (!allowed || this.libraryBusy) return;
    this.arrangement.begin(cards, ownerId);
    this.cdr.markForCheck();
  }
  pickArrangement(optionId: string): void {
    if (this.libraryBusy || !this.arrangement.choice) return;
    this.arrangement.selection.select(this.arrangement.choice, optionId);
    this.cdr.markForCheck();
  }
  inspectArrangementCard(cardId: string): void {
    const card = this.arrangement.choice?.options?.find((option) => option.id === cardId)?.card;
    if (card) this.detail(card);
  }
  clearArrangement(): void {
    if (this.libraryBusy) return;
    this.arrangement.selection.reset();
    this.cdr.markForCheck();
  }
  cancelArrangement(): void {
    if (this.libraryBusy) return;
    this.arrangement.cancel();
    this.cdr.markForCheck();
  }
  arrangeLibrary(allowed: boolean): Promise<void> {
    const order = this.arrangement.order;
    return order
      ? this.runLibraryAction(() => this.libraryActions.arrange(order), allowed)
      : Promise.resolve();
  }
  private readonly libraryActions = inject(LibraryActionsService);
  libraryBusy = false;
  libraryStatus: string | null = null;
  searchOptions: LibrarySearchRequest & { filter: NonNullable<LibrarySearchRequest['filter']> } = {
    count: 1,
    destination: 'Hand',
    filter: {},
    reveal: false,
    shuffleAfter: true,
    tapped: false,
    where: 'Default',
  };
  searchSubtypes = '';
  libraryAction(action: LibraryAction, allowed: boolean): Promise<void> {
    return this.runLibraryAction(() => this.libraryActions.perform(action), allowed);
  }
  get validSearchCount(): boolean {
    return Number.isInteger(this.searchOptions.count) && this.searchOptions.count >= 0;
  }
  searchLibrary(allowed: boolean): Promise<void> {
    if (!this.validSearchCount) return Promise.resolve();
    const options = { ...this.searchOptions, filter: { ...this.searchOptions.filter } };
    const subtypes = this.searchSubtypes
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (subtypes.length) options.filter.subtypes = subtypes;
    return this.runLibraryAction(() => this.libraryActions.search(options), allowed);
  }
  private async runLibraryAction(send: () => Promise<void>, allowed: boolean): Promise<void> {
    if (!allowed || this.libraryBusy) return;
    this.libraryBusy = true;
    this.libraryStatus = null;
    this.cdr.markForCheck();
    try {
      await send();
      this.close();
    } catch {
      this.libraryStatus = 'Library action was not confirmed. Check the board before retrying.';
    } finally {
      this.libraryBusy = false;
      this.cdr.markForCheck();
    }
  }
  private casting = inject(CardCastingService);
  private cdr = inject(ChangeDetectorRef);
  private zoneViews = inject(BoardZonesService);
  private returnFocus = document.activeElement as HTMLElement | null;
  pickZone(playerId: string, zone: PublicZone): void {
    this.libraryStatus = null;
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
    this.store.select(selectGameReady),
  ]).pipe(
    map(([viewer, players, localId, game, mode, ready]) => {
      if (!viewer.open || !viewer.playerId) {
        this.arrangement.cancel();
        this.contextCard = null;
        return null;
      }

      const player = players.find((p) => p.playerId === viewer.playerId);
      if (!player) {
        this.arrangement.cancel();
        this.contextCard = null;
        return null;
      }

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
        ready && isLocal && viewer.zone === 'command' && mode === 'idle'
          ? (game?.castableCards ?? [])
          : [];
      const canManualLibrary =
        ready &&
        isLocal &&
        viewer.zone === 'library' &&
        game?.manualLibraryActionsAllowed === true &&
        mode === 'idle';
      const inspectedLibraryCards = (game?.inspectedLibraryCards ?? []).filter(
        (card) => card.ownerId === player.playerId,
      );
      const canArrange =
        canManualLibrary &&
        game?.manualLibraryLookActive === true &&
        inspectedLibraryCards.length === count;
      this.arrangement.reconcile(inspectedLibraryCards, player.playerId, canArrange);
      const visibleCards =
        viewer.zone === 'hand' ? cards : (piles.find((p) => p.key === viewer.zone)?.cards ?? []);
      if (this.contextCard) {
        this.contextCard = ready
          ? (visibleCards.find((card) => card.cardId === this.contextCard?.cardId) ?? null)
          : null;
      }
      return {
        inspectedLibraryCards,
        canArrange,
        cards: visibleCards,
        piles,
        playerId: player.playerId,
        count,
        hidden,
        isLocal,
        canCast,
        manualLibraryLookActive: game?.manualLibraryLookActive === true,
        canManualLibrary,
        title: `${ownerLabel} ${zoneLabel}`,
        zone: viewer.zone,
      };
    }),
  );

  constructor(private store: Store<AppState>) {}

  close(): void {
    this.libraryStatus = null;
    this.arrangement.cancel();
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
