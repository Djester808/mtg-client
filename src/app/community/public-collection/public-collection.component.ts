import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, Subscription } from 'rxjs';
import { Store } from '@ngrx/store';
import { selectUsername } from '../../store/auth/auth.selectors';
import {
  PublicCollectionApiService,
  PublicCollectionSummary,
} from '../../services/public-collection-api.service';

@Component({
  selector: 'app-public-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './public-collection.component.html',
  styleUrls: ['./public-collection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicCollectionComponent {
  private readonly api = inject(PublicCollectionApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readSubscription?: Subscription;
  readonly owner = this.route.snapshot.data['owner'] === true;
  readonly signedInUsername = inject(Store).selectSignal(selectUsername);
  readonly username = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly visible = signal(false);
  readonly saving = signal(false);
  readonly summary = signal<PublicCollectionSummary | null>(null);
  readonly groups: {
    key: 'byColor' | 'byType' | 'byRarity' | 'bySet' | 'byFinish' | 'curve';
    title: string;
  }[] = [
    { key: 'byColor', title: 'Color identity' },
    { key: 'byType', title: 'Card types' },
    { key: 'byRarity', title: 'Rarity' },
    { key: 'bySet', title: 'Sets' },
    { key: 'byFinish', title: 'Finish' },
    { key: 'curve', title: 'Mana value' },
  ];
  constructor() {
    this.load();
  }
  load(): void {
    this.readSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    if (this.owner) {
      this.api
        .visibility()
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (value) => {
            this.visible.set(value.public);
            this.loading.set(false);
          },
          error: () => {
            this.error.set('Your sharing setting could not be loaded. Please retry.');
            this.loading.set(false);
          },
        });
    } else {
      this.readSubscription = this.route.paramMap
        .pipe(
          switchMap((params) => {
            const username = params.get('username') ?? '';
            this.username.set(username);
            this.summary.set(null);
            this.error.set('');
            this.loading.set(true);
            return this.api.summary(username).pipe(
              catchError((error: HttpErrorResponse) => {
                this.error.set(
                  error.status === 404
                    ? 'This collection is private or unavailable.'
                    : 'Collection counts could not be loaded. Please retry.',
                );
                return of(null);
              }),
            );
          }),
          takeUntilDestroyed(this.destroy),
        )
        .subscribe((value) => {
          this.summary.set(value);
          this.loading.set(false);
        });
    }
  }
  save(visible: boolean): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .setVisibility(visible)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.visible.set(visible);
          this.notice.set(
            visible ? 'Collection summary is public.' : 'Collection summary is private.',
          );
          this.saving.set(false);
        },
        error: () => {
          this.error.set('Your sharing setting was not saved. Please retry.');
          this.saving.set(false);
        },
      });
  }
}
