import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, OnChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PermanentDto, CardDto, ManaColor, CardType } from '../../models/game.models';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent implements OnChanges {
  @Input() permanent?: PermanentDto;
  @Input() card?: CardDto;          // for hand cards
  @Input() isSelected = false;
  @Input() isAttacking = false;
  @Input() isBlocking  = false;
  @Input() isTargeted  = false;
  @Input() isPendingAttacker = false;
  @Input() isCastable = false;
  @Input() showBack = false;        // library / face-down

  @Output() clicked     = new EventEmitter<void>();
  @Output() hoverEnter  = new EventEmitter<CardDto>();
  @Output() hoverLeave  = new EventEmitter<void>();

  // Resolved card def (from permanent or direct card)
  get cardData(): CardDto | null {
    return this.permanent?.sourceCard ?? this.card ?? null;
  }

  get isTapped(): boolean {
    return this.permanent?.isTapped ?? false;
  }

  get effectivePower(): number | null {
    return this.permanent?.effectivePower ?? null;
  }

  get effectiveToughness(): number | null {
    return this.permanent?.effectiveToughness ?? null;
  }

  get damageMarked(): number {
    return this.permanent?.damageMarked ?? 0;
  }

  get counters(): { label: string; cls: string }[] {
    if (!this.permanent) return [];
    const result: { label: string; cls: string }[] = [];
    const c = this.permanent.counters;
    if (c['PlusOnePlusOne'] > 0) result.push({ label: '+1', cls: 'plus' });
    if (c['MinusOneMinusOne'] > 0) result.push({ label: '−1', cls: 'minus' });
    if (c['Loyalty'] > 0) result.push({ label: String(c['Loyalty']), cls: 'loyalty' });
    if (c['Charge'] > 0) result.push({ label: String(c['Charge']), cls: 'charge' });
    return result;
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
        Plains: '☀️', Island: '🌊', Swamp: '🌑', Mountain: '🌋', Forest: '🌿'
      };
      return names[cd.name] ?? '🌍';
    }
    const map: Record<string, string> = {
      W: '⚔️', U: '💧', B: '💀', R: '🔥', G: '🌿', C: '⚙️'
    };
    return map[c] ?? '✨';
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

  get hasSummoningSickness(): boolean {
    return this.permanent?.hasSummoningSickness ?? false;
  }

  ngOnChanges(): void {}

  onMouseEnter(): void {
    if (this.cardData) this.hoverEnter.emit(this.cardData);
  }

  onMouseLeave(): void {
    this.hoverLeave.emit();
  }

  onClick(): void {
    this.clicked.emit();
  }
}
