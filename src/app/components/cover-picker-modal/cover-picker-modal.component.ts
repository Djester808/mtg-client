import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil } from 'rxjs/operators';
import { of } from 'rxjs';
import { CardDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';

@Component({
  selector: 'app-cover-picker-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cover-picker-modal.component.html',
  styleUrls: ['./cover-picker-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverPickerModalComponent implements OnDestroy {
  @Input() currentCoverUri: string | null = null;
  @Output() coverSelected = new EventEmitter<string | null>();
  @Output() closed = new EventEmitter<void>();

  searchText = '';
  results: CardDto[] = [];
  loading = false;
  searched = false;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private api: GameApiService, private cdr: ChangeDetectorRef) {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) {
          this.loading = false;
          this.searched = false;
          this.results = [];
          this.cdr.markForCheck();
          return of(null);
        }
        this.loading = true;
        this.searched = true;
        this.cdr.markForCheck();
        return this.api.searchCards(`name:"${q.trim()}"`, 40).pipe(
          catchError(() => of<CardDto[]>([])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(res => {
      if (res !== null) {
        this.results = res;
        this.loading = false;
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  onInput(): void { this.search$.next(this.searchText); }

  cardImageUri(card: CardDto): string | null {
    return card.imageUriNormal ?? card.imageUriSmall ?? null;
  }

  isSelected(card: CardDto): boolean {
    const artCrop = card.imageUriArtCrop;
    const normal = card.imageUriNormal;
    return this.currentCoverUri === artCrop || this.currentCoverUri === normal;
  }

  selectCard(card: CardDto): void {
    const uri = card.imageUriArtCrop ?? card.imageUriNormal ?? null;
    this.coverSelected.emit(uri);
  }

  close(): void { this.closed.emit(); }

  overlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cp-overlay')) this.closed.emit();
  }
}
