import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map, Subject, takeUntil } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectLocalPlayer,
  selectCurrentPhase,
  selectCurrentStep,
  selectIsActivePlayer,
  selectHasPriority,
  selectUIMode,
  selectSelectedCardId,
} from '../../store/selectors';
import { CardDto, ManaPoolDto, Phase, Step, CardType } from '../../models/game.models';
import { CardComponent } from '../card/card.component';

interface HandCardVm {
  card: CardDto;
  isCastable: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-hand',
  standalone: true,
  imports: [CommonModule, CardComponent],
  templateUrl: './hand.component.html',
  styleUrls: ['./hand.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandComponent implements OnDestroy {
  @Input() handHeight = 160;

  get cardDims(): { w: number; h: number } {
    const h = Math.round(Math.min(Math.max(this.handHeight * 0.72, 80), 380));
    return { h, w: Math.round(h * (88 / 123)) };
  }

  private destroy$ = new Subject<void>();

  count = 0;
  orderedCards: HandCardVm[] = [];
  draggingId: string | null = null;
  private dragOverId: string | null = null;

  private mouseDownCardId: string | null = null;
  private mouseDownStartX = 0;
  private mouseDragging = false;
  private suppressNextCardClick = false;

  private cardOrder: string[] = [];
  private latestCards: HandCardVm[] = [];

  constructor(private store: Store<AppState>, private cdr: ChangeDetectorRef) {
    combineLatest([
      this.store.select(selectLocalPlayer),
      this.store.select(selectCurrentPhase),
      this.store.select(selectCurrentStep),
      this.store.select(selectIsActivePlayer),
      this.store.select(selectHasPriority),
      this.store.select(selectUIMode),
      this.store.select(selectSelectedCardId),
    ]).pipe(
      map(([player, phase, step, isActive, hasPriority, mode, selectedCardId]) => {
        const hand = player?.hand ?? [];
        const manaPool = player?.manaPool;
        const inMain = (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain)
          && step === Step.Main;
        const stackEmpty = true;

        const cards: HandCardVm[] = hand.map(card => {
          const isLandCard = card.cardTypes.includes(CardType.Land);
          const canCastSorcery = isActive && hasPriority && inMain && stackEmpty;
          const canCastInstant = hasPriority && mode === 'idle';

          let isCastable = false;
          if (isLandCard) {
            isCastable = canCastSorcery && !(player?.hasLandPlayedThisTurn ?? false);
          } else {
            const hasFlash = card.keywords.includes('Flash');
            const speedOk = hasFlash ? canCastInstant : canCastSorcery;
            isCastable = speedOk && this.canAfford(card.manaCost, manaPool);
          }

          return { card, isCastable, isSelected: card.cardId === selectedCardId };
        });

        return { cards, count: hand.length };
      }),
      takeUntil(this.destroy$),
    ).subscribe(vm => {
      this.count = vm.count;
      const idSet = new Set(vm.cards.map(c => c.card.cardId));
      this.cardOrder = this.cardOrder.filter(id => idSet.has(id));
      for (const c of vm.cards) {
        if (!this.cardOrder.includes(c.card.cardId)) {
          this.cardOrder.push(c.card.cardId);
        }
      }
      this.latestCards = vm.cards;
      this.rebuildOrderedCards();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private rebuildOrderedCards(): void {
    const cardMap = new Map(this.latestCards.map(c => [c.card.cardId, c]));
    this.orderedCards = this.cardOrder
      .filter(id => cardMap.has(id))
      .map(id => cardMap.get(id)!);
  }

  private canAfford(manaCost: string, pool: ManaPoolDto | undefined): boolean {
    if (!pool) return false;
    if (!manaCost || manaCost === '0') return true;
    const remaining: Record<string, number> = { ...(pool.amounts as Record<string, number>) };
    let generic = 0;
    let i = 0;
    while (i < manaCost.length) {
      if (manaCost[i] >= '0' && manaCost[i] <= '9') {
        let numStr = '';
        while (i < manaCost.length && manaCost[i] >= '0' && manaCost[i] <= '9') numStr += manaCost[i++];
        generic += parseInt(numStr, 10);
      } else {
        const color = manaCost[i].toUpperCase();
        const have = remaining[color] ?? 0;
        if (have <= 0) return false;
        remaining[color] = have - 1;
        i++;
      }
    }
    const leftover = Object.values(remaining).reduce((s, v) => s + (v > 0 ? v : 0), 0);
    return leftover >= generic;
  }

  isLand(hc: HandCardVm): boolean {
    return hc.card.cardTypes.includes(CardType.Land);
  }

  trackByCard(_: number, vm: HandCardVm): string {
    return vm.card.cardId;
  }

  // ---- Mouse drag (reorder in hand) ----------------------------------------
  // Pure mouse-based reorder so the browser's native DnD system never takes
  // OS-level cursor control (which overrides CSS cursor even with !important).

  onWrapperMouseDown(e: MouseEvent, cardId: string): void {
    if ((e.target as Element)?.closest('a')) return;
    e.preventDefault();
    this.mouseDownCardId = cardId;
    this.mouseDownStartX = e.clientX;
    this.mouseDragging = false;
    document.body.classList.add('is-dragging-card');
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(e: MouseEvent): void {
    if (!this.mouseDownCardId) return;
    if (!this.mouseDragging) {
      if (Math.abs(e.clientX - this.mouseDownStartX) < 5) return;
      this.mouseDragging = true;
      this.draggingId = this.mouseDownCardId;
      this.cdr.markForCheck();
    }
    this.updateDragPosition(e.clientX);
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.mouseDownCardId && !this.mouseDragging) return;
    document.body.classList.remove('is-dragging-card');
    if (this.mouseDragging) this.suppressNextCardClick = true;
    this.mouseDownCardId = null;
    this.mouseDragging = false;
    this.draggingId = null;
    this.dragOverId = null;
    this.cdr.markForCheck();
  }

  private updateDragPosition(clientX: number): void {
    const wrappers = Array.from(
      document.querySelectorAll('.hand-card-wrapper')
    ) as HTMLElement[];
    let targetId: string | null = null;
    let minDist = Infinity;
    wrappers.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - center);
      if (dist < minDist) {
        minDist = dist;
        targetId = this.orderedCards[i]?.card.cardId ?? null;
      }
    });
    if (!targetId || targetId === this.draggingId || targetId === this.dragOverId) return;
    this.dragOverId = targetId;
    const fromIdx = this.cardOrder.indexOf(this.draggingId!);
    const toIdx   = this.cardOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const order = [...this.cardOrder];
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, this.draggingId!);
    this.cardOrder = order;
    this.rebuildOrderedCards();
    this.cdr.markForCheck();
  }

  // ---- Click / double-click / hover ----------------------------------------

  onCardClick(card: CardDto): void {
    if (this.suppressNextCardClick) { this.suppressNextCardClick = false; return; }
    this.store.dispatch(UIActions.selectCard({ cardId: card.cardId }));
  }

  onCardDblClick(hc: HandCardVm): void {
    if (!hc.isCastable) return;
    if (this.isLand(hc)) {
      this.store.dispatch(GameActions.playLand({ cardId: hc.card.cardId }));
    } else {
      this.store.dispatch(GameActions.castSpell({ cardId: hc.card.cardId, targetIds: [] }));
    }
    this.store.dispatch(UIActions.deselectCard());
  }

  onCardHover(card: CardDto): void {
    if (this.mouseDragging) return;
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }
}
