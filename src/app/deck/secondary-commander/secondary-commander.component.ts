import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeckDetailDto } from '../../services/deck-api.service';
import { CollectionCardDto } from '../../models/game.models';
import {
  SelectMenuComponent,
  SelectMenuOption,
} from '../../components/select-menu/select-menu.component';
import { DeckCommanders } from '../deck-commanders';

@Component({
  selector: 'app-secondary-commander',
  standalone: true,
  imports: [CommonModule, SelectMenuComponent],
  template: `
    <div class="label">Second commander</div>
    <app-select-menu
      [options]="options"
      [value]="deck.secondaryCommanderOracleId ?? ''"
      (valueChange)="selected.emit($event || null)"
      placeholder="None"
    />
    <p>
      Choose a legendary card already in this deck. Pair compatibility is checked when joining a
      game.
    </p>
    <button *ngIf="card as selectedCard" type="button" (click)="details.emit(selectedCard)">
      View card details
    </button>
  `,
  styleUrls: ['./secondary-commander.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecondaryCommanderComponent {
  @Input({ required: true }) deck!: DeckDetailDto;
  @Output() selected = new EventEmitter<string | null>();
  @Output() details = new EventEmitter<CollectionCardDto>();
  get options(): SelectMenuOption[] {
    return [
      { value: '', label: 'None' },
      ...DeckCommanders.candidates(this.deck).map((card) => ({
        value: card.oracleId,
        label: card.cardDetails?.name ?? card.oracleId,
      })),
    ];
  }
  get card(): CollectionCardDto | undefined {
    return this.deck.cards.find((card) => card.oracleId === this.deck.secondaryCommanderOracleId);
  }
}
