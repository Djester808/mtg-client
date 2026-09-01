import {
  Component,
  Input,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map, Subject, takeUntil } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import { PlayLegalityService } from '../../game/play-legality.service';
import {
  selectLocalPlayer,
  selectCurrentPhase,
  selectCurrentStep,
  selectIsActivePlayer,
  selectHasPriority,
  selectUIMode,
  selectSelectedCardId,
  selectStackIsEmpty,
} from '../../store/selectors';
import { CardDto, Phase, Step, CardType } from '../../models/game.models';
import { CardComponent } from '../card/card.component';
import { ScrollEdgesDirective } from '../../directives/scroll-edges.directive';
import { BreakpointsService } from '../../shared/breakpoints.service';

interface HandCardVm {
  card: CardDto;
  isCastable: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-hand',
  standalone: true,
  imports: [CommonModule, CardComponent, ScrollEdgesDirective],
  templateUrl: './hand.component.html',
  styleUrls: ['./hand.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandComponent implements OnDestroy {
  @Input() handHeight = 160;

  get cardDims(): { w: number; h: number } {
    // A size in pixels computed in TypeScript is one of the few things a stylesheet cannot
    // reach, which is exactly what `BreakpointsService` is for (mtg-client/CLAUDE.md). Left
    // alone, the hand inherited a 400px height dragged on a desktop and drew 206px-wide cards
    // on a 375px screen — two cards, and no way to see the rest.
    const ceiling = this.breakpoints.isPhone() ? 112 : 380;
    const h = Math.round(Math.min(Math.max(this.handHeight * 0.72, 80), ceiling));
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

  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private legality: PlayLegalityService,
    private breakpoints: BreakpointsService,
  ) {
    combineLatest([
      this.store.select(selectLocalPlayer),
      this.store.select(selectCurrentPhase),
      this.store.select(selectCurrentStep),
      this.store.select(selectIsActivePlayer),
      this.store.select(selectHasPriority),
      this.store.select(selectUIMode),
      this.store.select(selectSelectedCardId),
      this.store.select(selectStackIsEmpty),
    ])
      .pipe(
        map(([player, phase, step, isActive, hasPriority, mode, selectedCardId, stackEmpty]) => {
          const hand = player?.hand ?? [];
          const manaPool = player?.manaPool;
          const inMain =
            (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain) && step === Step.Main;

          // When a cast is being judged (CR 117.1a). The rules themselves live in the service;
          // the component's job is to say what the board looks like right now.
          const window = {
            isActivePlayer: isActive,
            hasPriority,
            inMainPhase: inMain,
            stackIsEmpty: stackEmpty,
            hasPlayedLandThisTurn: player?.hasLandPlayedThisTurn ?? false,
            uiIsIdle: mode === 'idle',
          };

          const cards: HandCardVm[] = hand.map((card) => ({
            card,
            isCastable: this.legality.isCastable(card, window, manaPool),
            isSelected: card.cardId === selectedCardId,
          }));

          return { cards, count: hand.length };
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((vm) => {
        this.count = vm.count;
        const idSet = new Set(vm.cards.map((c) => c.card.cardId));
        this.cardOrder = this.cardOrder.filter((id) => idSet.has(id));
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
    const cardMap = new Map(this.latestCards.map((c) => [c.card.cardId, c]));
    this.orderedCards = this.cardOrder
      .filter((id) => cardMap.has(id))
      .map((id) => cardMap.get(id)!);
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
    const wrappers = Array.from(document.querySelectorAll('.hand-card-wrapper')) as HTMLElement[];
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
    const toIdx = this.cardOrder.indexOf(targetId);
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
    if (this.suppressNextCardClick) {
      this.suppressNextCardClick = false;
      return;
    }
    this.store.dispatch(UIActions.selectCard({ cardId: card.cardId }));
  }

  onCardDblClick(hc: HandCardVm): void {
    if (!hc.isCastable) return;
    if (this.isLand(hc)) {
      this.store.dispatch(GameActions.playLand({ cardId: hc.card.cardId }));
      return;
    }

    // A spell that targets stops to ask (CR 601.2c). The board has had the mode for this all
    // along — 'targeting', with a "Choose a target" message — and nothing ever entered it, so a
    // Lightning Bolt was cast with no target and refused every time.
    if (this.legality.targetsOnCast(hc.card)) {
      this.store.dispatch(
        UIActions.enterTargetMode({ sourceCardId: hc.card.cardId, targetCount: 1 }),
      );
      return;
    }

    this.store.dispatch(GameActions.castSpell({ cardId: hc.card.cardId, targetIds: [] }));
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
