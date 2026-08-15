import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollectionDto } from '../../models/game.models';
import { ToBodyDirective } from '../../shared/to-body.directive';

/**
 * Picks a destination collection and confirms. Both transfers ask the same question —
 * "which collection?" — so merging (from the list) and moving a card (from a detail
 * page) share this dialog rather than each growing a copy of the markup and styles.
 *
 * Re-parented to <body> so the fixed overlay escapes the detail page's stacking
 * context, the same reason the card modal does it.
 */
@Component({
  selector: 'app-collection-picker-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collection-picker-dialog.component.html',
  styleUrls: ['./collection-picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [ToBodyDirective],
})
export class CollectionPickerDialogComponent {
  @Input() heading = 'Choose Collection';
  /** Sentence above the list explaining what will happen. */
  @Input() lead = '';
  @Input() targets: CollectionDto[] = [];
  @Input() confirmLabel = 'Confirm';
  /** When set, an opt-in checkbox is shown and its state rides on the confirm event. */
  @Input() checkboxLabel: string | null = null;
  @Input() emptyText = 'You need another collection first.';

  @Output() confirmed = new EventEmitter<{ targetId: string; checked: boolean }>();
  @Output() closed = new EventEmitter<void>();

  selectedId: string | null = null;
  checked = false;
  search = '';

  /** Rows rendered at once. Past this the list stops being scannable and the search earns its place. */
  private static readonly VISIBLE_LIMIT = 8;
  /** Below this the list fits on screen and a search box is just another thing to read. */
  private static readonly SEARCH_THRESHOLD = 6;

  constructor(private cdr: ChangeDetectorRef) {}

  get showSearch(): boolean {
    return this.targets.length > CollectionPickerDialogComponent.SEARCH_THRESHOLD;
  }

  private matchMemo: {
    targets: CollectionDto[];
    search: string;
    value: CollectionDto[];
  } | null = null;

  /** Every target matching the search — the count behind the "showing x of y" hint. */
  private get matches(): CollectionDto[] {
    const m = this.matchMemo;
    if (m && m.targets === this.targets && m.search === this.search) return m.value;
    const q = this.search.trim().toLowerCase();
    const value = q ? this.targets.filter((t) => t.name.toLowerCase().includes(q)) : this.targets;
    this.matchMemo = { targets: this.targets, search: this.search, value };
    return value;
  }

  /** The capped slice actually rendered. */
  get visibleTargets(): CollectionDto[] {
    return this.matches.slice(0, CollectionPickerDialogComponent.VISIBLE_LIMIT);
  }

  get hiddenCount(): number {
    return Math.max(0, this.matches.length - CollectionPickerDialogComponent.VISIBLE_LIMIT);
  }

  get noMatches(): boolean {
    return this.targets.length > 0 && this.matches.length === 0;
  }

  onSearch(value: string): void {
    this.search = value;
    this.cdr.markForCheck();
  }

  select(id: string): void {
    this.selectedId = id;
    this.cdr.markForCheck();
  }

  confirm(): void {
    if (!this.selectedId) return;
    this.confirmed.emit({ targetId: this.selectedId, checked: this.checked });
  }

  trackById = (_: number, col: CollectionDto): string => col.id;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
