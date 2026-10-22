import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CollectionMetadata,
  CollectionMetadataApiService,
} from '../../services/collection-metadata-api.service';
import { CollectionCardDto } from '../../models/collection.models';
import { describeHttpError } from '../../utils/http-error.utils';

@Component({
  selector: 'app-collection-metadata',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collection-metadata.component.html',
  styleUrls: ['./collection-metadata.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionMetadataComponent implements OnChanges {
  @Input({ required: true }) collectionId = '';
  @Input({ required: true }) rowId = '';
  @Input() quantities: CollectionCardDto | null = null;
  @Output() readonly languageChanged = new EventEmitter<string>();
  finish = 'nonfoil';
  notes = '';
  private finishMemo: { row: CollectionCardDto | null; value: string[] } | null = null;
  get finishes(): string[] {
    if (this.finishMemo?.row === this.quantities) return this.finishMemo.value;
    const row = this.quantities;
    const value = row
      ? ['nonfoil', 'foil', 'etched'].filter(
          (f) =>
            (f === 'nonfoil'
              ? row.quantity
              : f === 'foil'
                ? row.quantityFoil
                : (row.quantityEtched ?? 0)) > 0,
        )
      : ['nonfoil', 'foil', 'etched'];
    this.finishMemo = { row, value };
    return value;
  }
  @Output() readonly saved = new EventEmitter<void>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly loaded = signal(false);
  language = 'en';
  condition = '';
  purchasePrice: number | null = null;
  currency = 'USD';
  tags = '';
  private generation = 0;
  constructor(private api: CollectionMetadataApiService) {}
  ngOnChanges() {
    if (!this.finishes.includes(this.finish)) this.finish = this.finishes[0] ?? 'nonfoil';
    this.load();
  }
  load() {
    if (!this.collectionId || !this.rowId) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.error.set('');
    this.loaded.set(false);
    this.api.get(this.collectionId, this.rowId, this.finish).subscribe({
      next: (value) => {
        if (generation !== this.generation) return;
        this.notes = value.notes ?? '';
        this.language = value.language;
        this.condition = value.condition ?? '';
        this.purchasePrice = value.purchasePrice;
        this.currency = value.currency ?? 'USD';
        this.tags = value.tags.join(', ');
        this.loaded.set(true);
        this.busy.set(false);
      },
      error: (e) => {
        if (generation !== this.generation) return;
        this.error.set(describeHttpError(e, 'Card details could not load.'));
        this.busy.set(false);
      },
    });
  }
  save() {
    if (this.busy() || !this.loaded()) return;
    const metadata: CollectionMetadata = {
      finish: this.finish,
      notes: this.notes || null,
      language: this.language,
      condition: this.condition || null,
      purchasePrice: this.purchasePrice,
      currency: this.purchasePrice === null ? null : this.currency,
      tags: this.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.update(this.collectionId, this.rowId, metadata).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set('Card details saved.');
        this.languageChanged.emit(this.language);
        this.saved.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(describeHttpError(e, 'Card details could not be saved.'));
      },
    });
  }
}
