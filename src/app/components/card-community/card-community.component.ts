import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  inject,
  signal,
  OnChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CardCommunityService, CardCommunity } from '../../services/card-community.service';
@Component({
  selector: 'app-card-community',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './card-community.component.html',
  styleUrls: ['./card-community.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardCommunityComponent implements OnChanges {
  @Input({ required: true }) oracleId = '';
  @Input() commanderOracleId: string | null = null;
  private readonly service = inject(CardCommunityService);
  private readonly destroy = inject(DestroyRef);
  private readonly requests = new Subject<[string, string | null]>();
  readonly loading = signal(false);
  readonly data = signal<CardCommunity | null>(null);
  constructor() {
    this.requests
      .pipe(
        switchMap(([card, leader]) => this.service.load(card, leader)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((value) => {
        this.data.set(value);
        this.loading.set(false);
      });
  }
  ngOnChanges(): void {
    if (!this.oracleId) return;
    this.loading.set(true);
    this.data.set(null);
    this.requests.next([this.oracleId, this.commanderOracleId]);
  }
  retry(): void {
    this.service.invalidate(this.oracleId, this.commanderOracleId);
    this.ngOnChanges();
  }
}
