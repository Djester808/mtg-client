import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';

import {
  Component,
  Input,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnChanges,
  AfterViewInit,
  ElementRef,
  OnDestroy,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map, tap } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectUIMode,
  selectHasPriority,
  selectChoice,
  selectPendingAttackers,
  selectSelectedPermId,
  selectCombatState,
  selectIsActivePlayer,
  selectSelectedBlocker,
  selectPendingBlockers,
  selectPendingAttackTargets,
  selectPlayers,
} from '../../store/selectors';
import {
  PermanentDto,
  PermanentAbilityDto,
  CardDto,
  CardType,
  CombatStateDto,
} from '../../models/game.models';

import { ToastService } from '../../services/toast.service';
import {
  BattlefieldArrangement,
  battlefieldArea,
  BattlefieldRole,
  BattlefieldRow,
  BattlefieldTile,
} from '../../board/battlefield-arrangement';
import { PlayLegalityService } from '../../game/play-legality.service';

@Component({
  selector: 'app-zones',
  standalone: true,
  imports: [CommonModule, CardOptionsMenuComponent],
  templateUrl: './zones.component.html',
  styleUrls: ['./zones.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZonesComponent implements OnChanges, OnDestroy, AfterViewInit {
  readonly arrangement = new BattlefieldArrangement();
  contextCard: PermanentDto | null = null;
  contextX = 0;
  contextY = 0;
  private observer: ResizeObserver | null = null;
  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => this.fitCards());
    this.observer.observe(this.host.nativeElement);
    this.fitCards();
  }

  @Input() compact = false;
  @Input() role: BattlefieldRole = 'local';
  rows: BattlefieldRow[] = [];
  listCards: PermanentDto[] = [];
  listTitle = '';
  @ViewChild('permanentList') private permanentList?: ElementRef<HTMLDialogElement>;
  private fitCards(): void {
    const box = this.host.nativeElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.rows = this.arrangement.rows(
      this.role,
      Math.floor(box.width),
      Math.floor(box.height),
      this.compact,
    );
    this.cdr.markForCheck();
  }
  trackRow(_: number, row: BattlefieldRow): string {
    return row.id;
  }
  trackTile(_: number, tile: BattlefieldTile): string {
    return tile.id;
  }
  showList(cards: PermanentDto[], title: string): void {
    this.listCards = cards;
    this.listTitle = title;
    this.permanentList?.nativeElement.showModal();
    this.cdr.markForCheck();
  }
  closeList(): void {
    this.permanentList?.nativeElement.close();
    this.listCards = [];
    this.cdr.markForCheck();
  }
  dismissOptions(): void {
    this.contextCard = null;
    this.cdr.markForCheck();
  }
  ngOnChanges(): void {
    this.arrangement.update(this.permanents);
    this.fitCards();
  }
  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
  @HostListener('document:keydown.escape') escape(): void {
    this.contextCard = null;
    this.cdr.markForCheck();
  }
  openOptions(event: MouseEvent, p: PermanentDto): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextCard = p;
    this.contextX = Math.min(event.clientX, innerWidth - 170);
    this.contextY = Math.min(event.clientY, innerHeight - 80);
    this.cdr.markForCheck();
  }
  inspectContext(): void {
    if (this.contextCard)
      this.store.dispatch(UIActions.selectCard({ permanentId: this.contextCard.permanentId }));
    this.contextCard = null;
    this.cdr.markForCheck();
  }
  arrangeKey(event: KeyboardEvent, p: PermanentDto): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.openOptions(
        new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom }),
        p,
      );
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const all = this.permanents.filter((c) => battlefieldArea(c) === battlefieldArea(p));
      const i = all.findIndex((c) => c.permanentId === p.permanentId);
      this.arrangement.drop(
        p.permanentId,
        all[i + (event.key === 'ArrowLeft' ? -1 : 1)]?.permanentId ?? null,
        event.key === 'ArrowLeft',
        false,
      );
      this.fitCards();
      this.cdr.markForCheck();
    }
  }
  @Input() permanents: PermanentDto[] = [];
  @Input() isOpponent = false;
  @Input() label = '';

  ui$ = combineLatest([
    this.store.select(selectUIMode),
    this.store.select(selectPendingAttackers),
    this.store.select(selectSelectedPermId),
    this.store.select(selectCombatState),
    this.store.select(selectIsActivePlayer),
    this.store.select(selectSelectedBlocker),
    this.store.select(selectPendingBlockers),
    this.store.select(selectPendingAttackTargets),
    this.store.select(selectPlayers),
    this.store.select(selectHasPriority),
    this.store.select(selectChoice),
  ]).pipe(
    map(
      ([
        mode,
        pendingAttackers,
        selectedPermId,
        combat,
        isActive,
        blocker,
        blocks,
        attackerTargets,
        players,
        hasPriority,
        choice,
      ]) => ({
        canAct: !!hasPriority && !choice,
        blocker,
        blocks,
        attackerTargets,
        players,
        mode,
        pendingAttackers,
        selectedPermId,
        combat,
        isActive,
      }),
    ),
    tap((ui) => {
      this.arrangement.update(this.permanents, ui.combat ?? null);
      this.fitCards();
    }),
  );

  dropActive = false;

  constructor(
    private store: Store<AppState>,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private toasts: ToastService,
    private legality: PlayLegalityService,
  ) {}

  /** Delegates to the rules service; the component only draws (see CLAUDE.md). */
  canAttack(p: PermanentDto): boolean {
    return this.legality.canAttack(p);
  }

  readyAbility(permanent: PermanentDto): PermanentAbilityDto | null {
    return this.legality.readyAbility(permanent);
  }

  /**
   * The abilities this permanent could be asked for, when there is a choice to make.
   *
   * More than one is the case a tap cannot express, and until the menu existed it was the case
   * the board answered by doing nothing: `readyAbility` returns null rather than guess between
   * them, and the click fell through to selecting the card.
   */
  usableAbilities(permanent: PermanentDto): PermanentAbilityDto[] {
    return this.legality.usableAbilities(permanent);
  }

  /**
   * Hands the ability on and lets the effect decide what it needs first (CR 602.2).
   *
   * A number for an {X} cost, then targets, then the activation — the order is the rules', not
   * this component's, and it is answered in one place because the menu reaches the same code.
   */
  private activate(permanent: PermanentDto, ability: PermanentAbilityDto): void {
    this.store.dispatch(
      UIActions.chooseAbility({ permanentId: permanent.permanentId, abilityId: ability.id }),
    );
  }

  get creatures(): PermanentDto[] {
    return this.permanents.filter((p) => p.sourceCard.cardTypes.includes(CardType.Creature));
  }

  get nonCreatureNonLand(): PermanentDto[] {
    return this.permanents.filter(
      (p) =>
        !p.sourceCard.cardTypes.includes(CardType.Creature) &&
        !p.sourceCard.cardTypes.includes(CardType.Land),
    );
  }

  get lands(): PermanentDto[] {
    return this.permanents.filter(
      (p) =>
        p.sourceCard.cardTypes.includes(CardType.Land) &&
        !p.sourceCard.cardTypes.includes(CardType.Creature),
    );
  }

  isAttacking(permanentId: string, combat: CombatStateDto | null): boolean {
    return combat?.attackers?.includes(permanentId) ?? false;
  }

  isBlocking(permanentId: string, combat: CombatStateDto | null): boolean {
    const blockers = Object.values(combat?.attackersToBlockers ?? {}) as string[][];
    return blockers.some((list) => list.includes(permanentId));
  }

  isPendingAttacker(permanentId: string, pendingAttackers: string[]): boolean {
    return pendingAttackers.includes(permanentId);
  }

  onCardClick(
    permanent: PermanentDto,
    mode: string,
    isActive: boolean,
    _pendingAttackers: string[],
    selectedBlocker: string | null = null,
    canAct = true,
  ): void {
    this.contextCard = null;
    this.cdr.markForCheck();
    if (!canAct && mode !== 'declaring-attackers' && mode !== 'declaring-blockers') {
      this.toasts.show(
        'Wait until you have priority and the current decision is finished.',
        'warn',
        3000,
      );
      return;
    }
    // Picking a target for a spell that is waiting on one (CR 601.2c). Either side's
    // permanents: what is a legal target is the engine's to judge, not the board's.
    if (mode === 'targeting') {
      this.store.dispatch(UIActions.addTarget({ targetId: permanent.permanentId }));
      return;
    }

    if (mode === 'declaring-blockers') {
      if (
        !this.isOpponent &&
        permanent.sourceCard.cardTypes.includes(CardType.Creature) &&
        !permanent.isTapped
      ) {
        this.store.dispatch(
          UIActions.selectBlocker({
            permanentId: permanent.permanentId === selectedBlocker ? null : permanent.permanentId,
          }),
        );
      } else if (this.isOpponent && selectedBlocker) {
        this.store.dispatch(
          UIActions.assignBlocker({
            blockerId: selectedBlocker,
            attackerId: permanent.permanentId,
          }),
        );
      }
      return;
    }
    if (mode === 'declaring-attackers' && !this.isOpponent && isActive) {
      if (!this.canAttack(permanent)) {
        this.toasts.show(this.legality.whyNotAttacking(permanent), 'warn', 4000);
        return;
      }
      this.store.dispatch(UIActions.toggleAttacker({ permanentId: permanent.permanentId }));
    } else if (mode === 'declaring-blockers' && this.isOpponent) {
      // clicking an opponent creature while declaring blockers — handled by board
    } else if (!this.isOpponent && this.readyAbility(permanent)) {
      this.activate(permanent, this.readyAbility(permanent)!);
    } else if (!this.isOpponent && this.usableAbilities(permanent).length > 1) {
      // More than one, so the tap is not an answer. The list goes up in the status bar, where
      // every other question the board asks is already asked, with the engine's own text on
      // each button — which is the only place `AbilityView.Text` reaches a screen.
      this.store.dispatch(UIActions.openAbilityMenu({ permanentId: permanent.permanentId }));
    }
  }

  defenderLabel(id: string, players: { playerId: string; name: string }[]): string {
    return players.find((p) => p.playerId === id)?.name ?? '';
  }
  onCardHover(card: CardDto): void {
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }

  onBattlefieldClick(): void {
    this.store.dispatch(UIActions.deselectCard());
  }

  onZoneDragOver(event: DragEvent): void {
    if (this.isOpponent) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    if (!this.dropActive) {
      this.dropActive = true;
      this.cdr.markForCheck();
    }
  }

  onZoneDragLeave(): void {
    this.dropActive = false;
    this.cdr.markForCheck();
  }

  onZoneDrop(event: DragEvent): void {
    if (this.isOpponent) return;
    event.preventDefault();
    this.dropActive = false;
    // OnPush: the drop highlight is component state, so clearing it has to be announced. On the
    // path below where there is no card id, nothing else marks the view and the glow stayed lit.
    this.cdr.markForCheck();

    const cardId = event.dataTransfer?.getData('cardId');
    const isLand = event.dataTransfer?.getData('isLand') === '1';
    if (!cardId) return;
    if (isLand) {
      this.store.dispatch(GameActions.playLand({ cardId }));
    } else {
      this.store.dispatch(GameActions.castSpell({ cardId, targetIds: [] }));
    }
    this.cdr.markForCheck();
  }

  trackByPermanent(_: number, p: PermanentDto): string {
    return p.permanentId;
  }
}
