import { CollectionInsightsComponent } from '../collection-insights/collection-insights.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { CollectionDetailDto } from '../../models/game.models';
import { CollectionApiService } from '../../services/collection-api.service';
import { UiPreferencesService } from '../../services/ui-preferences.service';
import { describeHttpError } from '../../utils/http-error.utils';
@Component({
  selector: 'app-collection-tools',
  standalone: true,
  imports: [CommonModule, CollectionInsightsComponent],
  templateUrl: './collection-tools.component.html',
  styleUrls: ['./collection-tools.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionToolsComponent {
  @Input({ required: true }) collection!: CollectionDetailDto;
  readonly showInsights = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private last?: CollectionDetailDto;
  private summary = { value: 0, priced: 0, copies: 0 };
  constructor(
    private api: CollectionApiService,
    public preferences: UiPreferencesService,
  ) {}
  get valuation() {
    if (this.collection.pageData) return this.collection.pageData.valuation;
    if (this.last !== this.collection) {
      this.last = this.collection;
      this.summary = { value: 0, priced: 0, copies: 0 };
      for (const card of this.collection.cards) {
        for (const [quantity, price] of [
          [card.quantity, card.cardDetails?.prices?.usd],
          [card.quantityFoil, card.cardDetails?.prices?.usdFoil],
          [card.quantityEtched ?? 0, card.cardDetails?.prices?.usdEtched],
        ]) {
          this.summary.copies += quantity ?? 0;
          if (price != null) {
            this.summary.value += (quantity ?? 0) * price;
            this.summary.priced += quantity ?? 0;
          }
        }
      }
    }
    return this.summary;
  }
  toggleValue() {
    this.preferences.update({ hideCollectionValue: !this.preferences.state().hideCollectionValue });
  }
  download(format: 'csv' | 'text') {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.exportCollection(this.collection.id, format).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = 'collection.' + (format === 'csv' ? 'csv' : 'txt');
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.busy.set(false);
        this.notice.set('Your full collection was exported.');
      },
      error: (error) => {
        this.busy.set(false);
        this.error.set(describeHttpError(error, 'Export failed. Please try again.'));
      },
    });
  }
}
