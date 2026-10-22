import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnChanges,
} from '@angular/core';
import { BoardZonesService, ZonePile } from './board-zones.service';
import { BreakpointsService } from '../shared/breakpoints.service';
import { inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { AppState, UIActions } from '../store';
import { PlayerStateDto, PermanentDto } from '../models/game.models';
import { ZonesComponent } from '../components/zones/zones.component';
import { ManualControlsService } from './manual-controls.service';
import { ToastService } from '../services/toast.service';
@Component({
  selector: 'app-table-seat',
  standalone: true,
  imports: [CommonModule, ZonesComponent],
  templateUrl: './table-seat.component.html',
  styleUrls: ['./table-seat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSeatComponent implements OnChanges {
  @Input({ required: true }) player!: PlayerStateDto;
  @Input() permanents: PermanentDto[] = [];
  @Input() seat = 0;
  @Input() isLocal = false;
  @Input() isActive = false;
  @Input() hasPriority = false;
  @Input() collapsed = false;
  @Input() targeting = false;
  @Input() tableMode = false;
  @Input() showHeader = true;
  @Output() collapseSeat = new EventEmitter<void>();
  @Output() focusSeat = new EventEmitter<void>();
  @Output() targetPlayer = new EventEmitter<string>();
  readonly breakpoints = inject(BreakpointsService);
  private readonly zoneViews = inject(BoardZonesService);
  zonePiles: ZonePile[] = [];
  trackZone(_: number, pile: ZonePile): string {
    return pile.key;
  }
  detailsOpen = false;
  lifePending = false;
  mana: { color: string; count: number }[] = [];
  damage: { name: string; count: number }[] = [];
  @ViewChild('details') private details?: ElementRef<HTMLDialogElement>;
  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private manual: ManualControlsService,
    private toasts: ToastService,
  ) {}
  ngOnChanges(): void {
    this.zonePiles = this.zoneViews.piles(this.player);
    this.mana = Object.entries(this.player.manaPool.amounts)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([color, count]) => ({ color, count: count ?? 0 }));
    this.damage = Object.entries(this.player.commanderDamage ?? {}).map(([name, count]) => ({
      name,
      count,
    }));
    this.cdr.markForCheck();
  }
  trackName(_: number, item: { name: string }): string {
    return item.name;
  }
  trackMana(_: number, item: { color: string }): string {
    return item.color;
  }
  closeDetails(): void {
    this.detailsOpen = false;
    this.details?.nativeElement.close();
    this.cdr.markForCheck();
  }
  nameClick(): void {
    if (this.targeting) this.targetPlayer.emit(this.player.playerId);
    else if (this.tableMode) this.focusSeat.emit();
    else {
      this.detailsOpen = true;
      this.details?.nativeElement.showModal();
    }
    this.cdr.markForCheck();
  }
  async life(delta: number): Promise<void> {
    this.lifePending = true;
    this.cdr.markForCheck();
    try {
      await this.manual.life(this.player, delta);
    } catch {
      this.toasts.show('Life could not be changed. Try again.', 'warn', 3000);
    } finally {
      this.lifePending = false;
      this.cdr.markForCheck();
    }
  }
  zone(zone: 'graveyard' | 'exile' | 'command' | 'library' | 'hand'): void {
    this.store.dispatch(UIActions.openZoneViewer({ playerId: this.player.playerId, zone }));
    this.cdr.markForCheck();
  }
}
