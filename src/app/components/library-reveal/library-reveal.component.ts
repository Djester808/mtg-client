import {
  Component,
  ChangeDetectionStrategy,
  inject,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { FloatingPanelDirective } from '../../shared/floating-panel.directive';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { map, tap } from 'rxjs';
import { selectGameState } from '../../store/selectors';
import { CardDto, CardType, ChoiceDto } from '../../models/game.models';
import { LibraryInspectionPresentation } from '../../game/choices/library-inspection-presentation';
import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';
import { CardModalComponent } from '../card-modal/card-modal.component';
import { DialogFocusDirective } from '../../shared/dialog-focus.directive';
import { CardCastingService } from '../../game/card-casting.service';

@Component({
  selector: 'app-library-reveal',
  standalone: true,
  imports: [
    FloatingPanelDirective,
    CommonModule,
    CardModalComponent,
    CardOptionsMenuComponent,
    DialogFocusDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<details
      *ngFor="let reveal of disclosures$ | async; trackBy: disclosureKey"
      class="library-reveal"
      [open]="reveal.active"
      appFloatingPanel
      [rememberPanel]="
        localPlayerId && reveal.ownerId
          ? reveal.ownerId === localPlayerId
            ? 'library'
            : 'opponent-library'
          : null
      "
      [attr.data-active-inspection]="reveal.active ? true : null"
      [attr.data-library-owner]="reveal.ownerId || null"
    >
      <summary>
        <button
          *ngIf="reveal.active"
          type="button"
          class="panel-move"
          data-panel-handle
          aria-label="Move library inspection"
          title="Drag to move. Use arrow keys to move; Shift moves farther."
        >
          Move
        </button>
        {{ reveal.title }} ({{ reveal.cards.length }})<span
          *ngIf="reveal.active"
          class="collapse-hint"
        >
          — collapse cards</span
        >
      </summary>
      <p>{{ reveal.description }}</p>
      <p *ngIf="reveal.active && !ready" role="status">Waiting for game connection…</p>
      <div *ngFor="let group of reveal.groups" class="inspection-cards">
        <p *ngIf="group.label && ready" class="inspection-group">{{ group.label }}</p>
        <button
          *ngFor="let card of group.cards"
          type="button"
          [class.is-picked]="reveal.active && isSearchPicked(card)"
          (click)="reveal.active ? openMenu($event, card, true) : openDetail(card, false)"
          (contextmenu)="openMenu($event, card, reveal.active)"
          (keydown)="openMenu($event, card, reveal.active)"
        >
          <img *ngIf="card.imageUriNormal" [src]="card.imageUriNormal" alt="" />
          <span *ngIf="reveal.active && topPosition(card)" class="selection-label"
            >Position {{ topPosition(card) }} from top</span
          >
          {{ card.name
          }}<span *ngIf="reveal.active && isSearchPicked(card)" class="selection-label"
            >Selected for search</span
          >
        </button>
      </div>
    </details>
    <app-card-options-menu
      *ngIf="context"
      [x]="context.x"
      [y]="context.y"
      [actionLabel]="
        searchOption
          ? currentChoice?.maxPicks === 1
            ? 'Select for search'
            : 'Toggle search selection'
          : playLabel
      "
      [actionDisabled]="pending || repositionBusy"
      [extraActions]="topOrderOption ? topOrderActions : canReposition ? repositionActions : []"
      (extraAction)="performExtraAction($event)"
      (action)="performAction()"
      (inspect)="openDetail(context.card, context.active)"
      (dismiss)="context = null"
    ></app-card-options-menu>
    <app-card-modal
      appDialogFocus
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="'Card details: ' + selected.name"
      *ngIf="selected"
      [gameplay]="true"
      [card]="selected"
      (closed)="selected = null"
    ></app-card-modal>`,
  styleUrls: ['./library-reveal.component.scss'],
})
export class LibraryRevealComponent {
  @Input() localPlayerId: string | null = null;
  @Input() repositionBusy = false;
  @Input() interactionIdle = true;
  @Input() ready = true;
  @Output() libraryReposition = new EventEmitter<{ cardId: string; position: number }>();
  private manualLookAllowed = false;
  private castableCards: readonly string[] = [];
  private playableLands: readonly string[] = [];
  private readonly casting = inject(CardCastingService);

  get playLabel(): string {
    const card = this.context?.card;
    if (
      !this.ready ||
      !this.interactionIdle ||
      this.currentChoice ||
      !this.context?.active ||
      !card
    )
      return '';
    if (!this.castableCards.includes(card.cardId) && !this.playableLands.includes(card.cardId))
      return '';
    if (card.cardTypes.includes(CardType.Land))
      return this.playableLands.includes(card.cardId) ? 'Play land' : '';
    return this.castableCards.includes(card.cardId) ? 'Cast' : '';
  }

  performAction(): void {
    if (this.searchOption) {
      this.pickSearch();
      return;
    }
    if (!this.playLabel || this.pending || this.repositionBusy) return;
    const card = this.context!.card;
    this.context = null;
    this.casting.start(card);
  }
  readonly repositionActions = [
    { id: 'top', label: 'Put on top of library' },
    { id: 'bottom', label: 'Put on bottom of library' },
  ];
  get canReposition(): boolean {
    return (
      this.ready &&
      this.interactionIdle &&
      this.manualLookAllowed &&
      !this.currentChoice &&
      !!this.context?.active &&
      !!this.localPlayerId &&
      this.context.card.ownerId === this.localPlayerId
    );
  }
  reposition(destination: string): void {
    if (
      !this.canReposition ||
      this.pending ||
      this.repositionBusy ||
      (destination !== 'top' && destination !== 'bottom')
    )
      return;
    this.libraryReposition.emit({
      cardId: this.context!.card.cardId,
      position: destination === 'top' ? 0 : -1,
    });
    this.context = null;
  }
  @Input() pending = false;
  @Input() picks: readonly string[] = [];
  @Output() choicePick = new EventEmitter<{ choice: ChoiceDto; optionId: string }>();
  @Output() choiceSkip = new EventEmitter<ChoiceDto>();
  @Output() topPlacement = new EventEmitter<{ choice: ChoiceDto; optionId: string }>();
  readonly topOrderActions = [{ id: 'order-top', label: 'Put on top of your library' }];
  get topOrderOption() {
    const choice = this.currentChoice;
    return choice?.kind === 'library-top-order' &&
      choice.isOrdering &&
      !choice.isDivision &&
      choice.minPicks === choice.options?.length &&
      choice.maxPicks === choice.options?.length
      ? this.choiceCardOption
      : null;
  }
  topPosition(card: CardDto): number {
    if (this.currentChoice?.kind !== 'library-top-order') return 0;
    const option = this.currentChoice.options?.find((item) => item.card?.cardId === card.cardId);
    return option ? this.picks.indexOf(option.id) + 1 : 0;
  }
  performExtraAction(action: string): void {
    if (action === 'order-top') {
      const option = this.topOrderOption;
      if (this.pending || this.repositionBusy || !option || !this.currentChoice) return;
      this.topPlacement.emit({ choice: this.currentChoice, optionId: option.id });
      this.context = null;
      return;
    }
    if (action === 'top' || action === 'bottom') {
      this.reposition(action);
      return;
    }
  }
  currentChoice: ChoiceDto | null = null;
  readonly disclosures$ = inject(Store)
    .select(selectGameState)
    .pipe(
      tap((state) => {
        this.manualLookAllowed =
          state?.manualLibraryActionsAllowed === true && state?.manualLibraryLookActive === true;
        this.currentChoice = state?.choice ?? null;
        this.castableCards = state?.castableCards ?? [];
        this.playableLands = state?.playableLands ?? [];
        if (this.context?.active && this.context.choiceId !== this.currentChoice?.id)
          this.context = null;
        if (this.context?.active) {
          const card = state?.inspectedLibraryCards?.find(
            (item) => item.cardId === this.context?.card.cardId,
          );
          this.context = card ? { ...this.context, card } : null;
        }
        if (this.selectedActive) {
          this.selected =
            state?.inspectedLibraryCards?.find((card) => card.cardId === this.selected?.cardId) ??
            null;
          if (!this.selected) this.selectedActive = false;
        }
      }),
      map((state) => [
        ...Array.from(
          (state?.inspectedLibraryCards ?? []).reduce((groups, card) => {
            const cards = groups.get(card.ownerId) ?? [];
            cards.push(card);
            groups.set(card.ownerId, cards);
            return groups;
          }, new Map<string, CardDto[]>()),
          ([ownerId, cards]) => ({
            key: 'inspection:' + ownerId,
            ownerId,
            cards,
            groups: LibraryInspectionPresentation.groups(
              cards,
              state?.choice,
              state?.castableCards,
              state?.playableLands,
            ),
            active: true,
            title:
              'Inspecting library — ' +
              (state?.players?.find((player) => player.playerId === ownerId)?.name ??
                'Unknown player'),
            description: state?.choice
              ? 'Cards you may currently inspect. Make your choices in the current prompt.'
              : state?.manualLibraryLookActive
                ? 'Honour-system look. Use Stop looking in your library controls to end this inspection.'
                : 'Cards you may currently inspect.',
          }),
        ),
        ...(state?.lastReveal
          ? [
              {
                ...state.lastReveal,
                key: 'last-reveal',
                groups: [{ label: null, cards: state.lastReveal.cards }],
                ownerId: null,
                active: false,
                title: 'Last reveal',
                description: 'Previously revealed cards',
              },
            ]
          : []),
        ...(state?.lastLook && !state.inspectedLibraryCards?.length
          ? [
              {
                ...state.lastLook,
                key: 'last-look',
                groups: [{ label: null, cards: state.lastLook.cards }],
                ownerId: null,
                active: false,
                title: 'Last look - only you',
                description: 'Previously viewed cards; this is not the current library order.',
              },
            ]
          : []),
      ]),
    );
  readonly disclosureKey = (_: number, disclosure: { key: string }): string => disclosure.key;
  context: { card: CardDto; active: boolean; choiceId?: string; x: number; y: number } | null =
    null;
  selected: CardDto | null = null;

  openMenu(event: MouseEvent | KeyboardEvent, card: CardDto, active: boolean): void {
    if (
      event instanceof KeyboardEvent &&
      event.key !== 'ContextMenu' &&
      !(event.shiftKey && event.key === 'F10')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const opener = event.currentTarget as HTMLElement;
    opener.focus();
    const bounds = opener.getBoundingClientRect();
    this.context = {
      card,
      active,
      choiceId: this.currentChoice?.id,
      x: event instanceof MouseEvent && event.clientX ? event.clientX : bounds.left,
      y: event instanceof MouseEvent && event.clientY ? event.clientY : bounds.bottom,
    };
  }
  private optionCache?: {
    choice: ChoiceDto;
    cardId: string;
    option: NonNullable<ChoiceDto['options']>[number] | null;
  };
  get searchOption() {
    return this.currentChoice?.kind === 'search' ? this.choiceCardOption : null;
  }
  private get choiceCardOption() {
    if (
      !this.ready ||
      !this.context?.active ||
      !this.currentChoice ||
      this.context.choiceId !== this.currentChoice.id
    )
      return null;
    if (
      this.optionCache?.choice === this.currentChoice &&
      this.optionCache.cardId === this.context.card.cardId
    )
      return this.optionCache.option;
    const options =
      this.currentChoice.options?.filter(
        (option) => option.card?.cardId === this.context?.card.cardId,
      ) ?? [];
    const option = options.length === 1 ? options[0] : null;
    this.optionCache = { choice: this.currentChoice, cardId: this.context.card.cardId, option };
    return option;
  }

  isSearchPicked(card: CardDto): boolean {
    return (
      this.currentChoice?.kind === 'search' &&
      !!this.currentChoice.options?.some(
        (option) => option.card?.cardId === card.cardId && this.picks.includes(option.id),
      )
    );
  }

  pickSearch(): void {
    const option = this.searchOption;
    if (this.pending || !option || !this.currentChoice) return;
    this.choicePick.emit({ choice: this.currentChoice, optionId: option.id });
    this.context = null;
  }
  private selectedActive = false;

  openDetail(card: CardDto, active: boolean): void {
    this.context = null;
    this.selected = card;
    this.selectedActive = active;
  }
}
