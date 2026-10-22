import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  signal,
} from '@angular/core';
import { ToBodyDirective } from '../../shared/to-body.directive';
import { DialogFocusDirective } from '../../shared/dialog-focus.directive';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BulkEditAction,
  CollectionMetadataApiService,
} from '../../services/collection-metadata-api.service';
import { describeHttpError } from '../../utils/http-error.utils';

@Component({
  selector: 'app-collection-bulk-tools',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogFocusDirective],
  hostDirectives: [ToBodyDirective],
  templateUrl: './collection-bulk-tools.component.html',
  styleUrls: ['./collection-bulk-tools.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionBulkToolsComponent implements OnDestroy {
  @Input() open = false;
  @Input({ required: true }) collectionId = '';
  @Input() selectedIds: ReadonlySet<string> = new Set();
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly changed = new EventEmitter<void>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly undoToken = signal<string | null>(null);
  action: BulkEditAction = 'tag';
  tag = '';
  condition = 'NM';
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private api: CollectionMetadataApiService) {}
  apply() {
    if (this.busy() || !this.selectedIds.size) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .bulk(this.collectionId, [...this.selectedIds], this.action, this.tag, this.condition || null)
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.notice.set(`Updated ${result.affected} card rows.`);
          this.undoToken.set(result.undoToken);
          clearTimeout(this.timer);
          this.timer = setTimeout(
            () => this.undoToken.set(null),
            Math.max(0, Date.parse(result.expiresAt) - Date.now()),
          );
          this.changed.emit();
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(describeHttpError(e, 'The bulk edit could not be applied.'));
        },
      });
  }
  undo() {
    const token = this.undoToken();
    if (!token || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.undo(token).subscribe({
      next: () => {
        this.busy.set(false);
        this.undoToken.set(null);
        this.notice.set('Bulk edit undone.');
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.undoToken.set(null);
        this.error.set(describeHttpError(e, 'Undo could not be completed safely.'));
      },
    });
  }
  @HostListener('document:keydown.escape') escape() {
    if (this.open && !this.busy()) this.closed.emit();
  }
  ngOnDestroy() {
    clearTimeout(this.timer);
  }
}
