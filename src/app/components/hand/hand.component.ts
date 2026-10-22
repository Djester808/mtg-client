import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';
import { ToastService } from '../../services/toast.service';
import {
  Component,
  inject,
  Input,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map, Subject, takeUntil } from 'rxjs';
import { AppState, UIActions } from '../../store';
import { CardCastingService } from '../../game/card-casting.service';
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
  selectChoice,
} from '../../store/selectors';
import { CardDto, Phase, Step, CardType } from '../../models/game.models';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { ScrollEdgesDirective } from '../../directives/scroll-edges.directive';

interface HandCardVm {
  card: CardDto;
  isCastable: boolean;
  unavailableReason?: string | null;
  isSelected: boolean;
}

@Component({
  selector: 'app-hand',
  standalone: true,
  imports: [
    CommonModule,
    CardOptionsMenuComponent,
    ManaCostComponent,
    OracleSymbolsPipe,
    ScrollEdgesDirective,
  ],
  templateUrl: './hand.component.html',
  styleUrls: ['./hand.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandComponent implements OnDestroy {
  private casting = inject(CardCastingService);
  @Input() raised = false;
  contextCard: CardDto | null = null;
  contextX = 0;
  contextY = 0;
  cardOptions(event: MouseEvent, card: CardDto): void {
    event.preventDefault();
    this.contextCard = card;
    this.contextX = Math.min(event.clientX, innerWidth - 170);
    this.contextY = Math.min(event.clientY, innerHeight - 80);
    this.cdr.markForCheck();
  }
  inspectCard(): void {
    if (this.contextCard)
      this.store.dispatch(UIActions.selectCard({ cardId: this.contextCard.cardId }));
    this.contextCard = null;
    this.cdr.markForCheck();
  }
  @HostListener('document:keydown.escape') closeOptions(): void {
    this.contextCard = null;
  }
  reorderKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const card = this.orderedCards.find((c) => c.card.cardId === id)?.card;
      if (card) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        this.cardOptions(
          new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom }),
          card,
        );
      }
      return;
    }
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const from = this.cardOrder.indexOf(id),
      to = Math.max(
        0,
        Math.min(this.cardOrder.length - 1, from + (event.key === 'ArrowLeft' ? -1 : 1)),
      );
    this.cardOrder.splice(from, 1);
    this.cardOrder.splice(to, 0, id);
    this.rebuildOrderedCards();
    this.cdr.markForCheck();
  }

  private destroy$ = new Subject<void>();

  count = 0;
  orderedCards: HandCardVm[] = [];
  draggingId: string | null = null;
  private dragOverId: string | null = null;

  private mouseDownCardId: string | null = null;
  private activePointerId: number | null = null;
  private mouseDownStartX = 0;
  private mouseDragging = false;
  private suppressNextCardClick = false;

  private cardOrder: string[] = [];
  private latestCards: HandCardVm[] = [];

  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private legality: PlayLegalityService,
    private toasts: ToastService,
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
      this.store.select(selectChoice),
    ])
      .pipe(
        map(
          ([
            player,
            phase,
            step,
            isActive,
            hasPriority,
            mode,
            selectedCardId,
            stackEmpty,
            choice,
          ]) => {
            const hand = player?.hand ?? [];
            const manaPool = player?.manaPool;
            const inMain =
              (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain) &&
              step === Step.Main;

            // When a cast is being judged (CR 117.1a). The rules themselves live in the service;
            // the component's job is to say what the board looks like right now.
            const window = {
              isActivePlayer: isActive,
              hasPriority,
              inMainPhase: inMain,
              stackIsEmpty: stackEmpty,
              hasPlayedLandThisTurn: player?.hasLandPlayedThisTurn ?? false,
              uiIsIdle: mode === 'idle' && !choice,
            };

            const cards: HandCardVm[] = hand.map((card) => ({
              card,
              isCastable: this.legality.isCastable(card, window, manaPool),
              unavailableReason: this.legality.castingProblem(card, window, manaPool),
              isSelected: card.cardId === selectedCardId,
            }));

            return { cards, count: hand.length };
          },
        ),
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
    this.cancelHandDrag();
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

  // ---- Pointer drag (reorder in hand) -------------------------------------
  // Pointer-based reorder so the browser's native DnD system never takes
  // OS-level cursor control (which overrides CSS cursor even with !important).

  onWrapperMouseDown(e: MouseEvent, cardId: string): void {
    if (e.button !== 0 || (e.target as Element)?.closest('a')) return;
    e.preventDefault();
    this.activePointerId = (e as PointerEvent).pointerId ?? 0;
    this.mouseDownCardId = cardId;
    this.mouseDownStartX = e.clientX;
    this.mouseDragging = false;
    document.body.classList.add('is-dragging-card');
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentMouseMove(e: MouseEvent): void {
    if (!this.mouseDownCardId || ('pointerId' in e && e.pointerId !== this.activePointerId)) return;
    if (!this.mouseDragging) {
      if (Math.abs(e.clientX - this.mouseDownStartX) < 5) return;
      this.mouseDragging = true;
      this.draggingId = this.mouseDownCardId;
      this.cdr.markForCheck();
    }
    this.updateDragPosition(e.clientX);
  }

  @HostListener('document:pointerup', ['$event'])
  onDocumentMouseUp(event?: PointerEvent): void {
    if (event && this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    if (!this.mouseDownCardId && !this.mouseDragging) return;
    document.body.classList.remove('is-dragging-card');
    if (this.mouseDragging) this.suppressNextCardClick = true;
    this.activePointerId = null;
    this.mouseDownCardId = null;
    this.mouseDragging = false;
    this.draggingId = null;
    this.dragOverId = null;
    this.cdr.markForCheck();
  }

  @HostListener('document:pointercancel', ['$event'])
  cancelHandDrag(event?: PointerEvent): void {
    if (event && this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.mouseDownCardId = null;
    this.mouseDragging = false;
    this.draggingId = null;
    this.dragOverId = null;
    this.suppressNextCardClick = false;
    document.body.classList.remove('is-dragging-card');
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
    const hc = this.orderedCards.find((c) => c.card.cardId === card.cardId);
    if (hc?.isCastable) this.onCardDblClick(hc);
    else if (hc?.unavailableReason) this.toasts.show(hc.unavailableReason, 'warn', 3000);
  }

  onCardDblClick(hc: HandCardVm): void {
    if (hc.isCastable) this.casting.start(hc.card);
  }

  onCardHover(card: CardDto): void {
    if (this.mouseDragging) return;
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }
}
