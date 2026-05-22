import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardDto, ManaColor, CardType } from '../../models/game.models';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule, ManaCostComponent, OracleSymbolsPipe],
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
  @Input() card?: CardDto;
  @Input() isSelected = false;
  @Input() showBack = false;
  @Input() showInfo = false;

  @Output() clicked = new EventEmitter<void>();
  @Output() dblClicked = new EventEmitter<void>();
  @Output() hoverEnter = new EventEmitter<CardDto>();
  @Output() hoverLeave = new EventEmitter<void>();

  get cardData(): CardDto | null {
    return this.card ?? null;
  }

  get artCropUri(): string | null {
    const cd = this.cardData;
    if (!cd) return null;
    if (cd.imageUriArtCrop) return cd.imageUriArtCrop;
    return cd.imageUriNormal?.replace('/normal/', '/art_crop/') ?? null;
  }

  get artColorClass(): string {
    const cd = this.cardData;
    if (!cd) return 'artifact';
    if (cd.cardTypes.includes(CardType.Land)) return 'land';
    if (cd.colorIdentity.length === 0) return 'artifact';
    if (cd.colorIdentity.length > 1) return 'gold';
    return cd.colorIdentity[0];
  }

  get artEmoji(): string {
    const cd = this.cardData;
    if (!cd) return '🂠';
    const c = cd.colorIdentity[0];
    if (cd.cardTypes.includes(CardType.Land)) {
      const names: Record<string, string> = {
        Plains: '☀️',
        Island: '🌊',
        Swamp: '🌑',
        Mountain: '🌋',
        Forest: '🌿',
      };
      return names[cd.name] ?? '🌍';
    }
    const map: Record<string, string> = {
      W: '⚔️',
      U: '💧',
      B: '💀',
      R: '🔥',
      G: '🌿',
      C: '⚙️',
    };
    return map[c] ?? '✨';
  }

  get typeLineText(): string {
    const cd = this.cardData;
    return cd ? buildTypeLine(cd) : '';
  }

  get isCreature(): boolean {
    return this.cardData?.cardTypes.includes(CardType.Creature) ?? false;
  }

  get isLand(): boolean {
    return this.cardData?.cardTypes.includes(CardType.Land) ?? false;
  }

  get colorDots(): ManaColor[] {
    return this.cardData?.colorIdentity ?? [];
  }

  onMouseEnter(): void {
    if (this.cardData) this.hoverEnter.emit(this.cardData);
  }

  onMouseLeave(): void {
    this.hoverLeave.emit();
  }

  onClick(): void {
    this.clicked.emit();
  }

  onDblClick(): void {
    this.dblClicked.emit();
  }
}
