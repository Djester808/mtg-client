import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  OnDestroy,
  inject,
  HostListener,
} from '@angular/core';
import { ChoiceSubmission } from '../../game/choices/choice-selection.service';
import { UiPreferencesService } from '../../services/ui-preferences.service';
import { SearchInputComponent } from '../search-input/search-input.component';
import { CommonModule } from '@angular/common';
import { LibraryChoiceShortcuts } from '../../game/choices/library-choice-shortcuts';
import { ChoiceDto } from '../../models/game.models';
import { ChoiceSelectionService } from '../../game/choices/choice-selection.service';

/** Renders authorized choices; selection rules and network commands live outside this view. */
@Component({
  selector: 'app-choice-controls',
  standalone: true,
  imports: [CommonModule, SearchInputComponent],
  templateUrl: './choice-controls.component.html',
  styleUrls: ['./choice-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoiceControlsComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) choice!: ChoiceDto;
  @Input() pending = false;
  @Input() submission: ChoiceSubmission | null = null;
  get sendingLibraryAction(): boolean {
    return (
      this.pending &&
      this.submission?.control != null &&
      ['search', 'mulligan', 'mulligan-bottom'].includes(this.choice.kind)
    );
  }
  @Input() ready = true;
  @Input() showSelectedOrder = false;
  @Output() details = new EventEmitter<string>();
  @Output() pick = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() skip = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
  readonly selection = inject(ChoiceSelectionService);
  private readonly preferences = inject(UiPreferencesService);
  readonly shortcuts = new LibraryChoiceShortcuts(() => this.preferences.state().libraryShortcuts);
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    const option = this.shortcuts.resolve(this.choice, this.pending || !this.ready, event);
    if (!option) return;
    event.preventDefault();
    this.pick.emit(option);
  }
  private pointerStart: { x: number; y: number; time: number; option: string } | null = null;
  beginPick(event: PointerEvent, option: string): void {
    this.pointerStart = { x: event.clientX, y: event.clientY, time: event.timeStamp, option };
  }
  cancelPick(): void {
    this.pointerStart = null;
  }
  pickOption(event: MouseEvent, option: string): void {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (this.pending || !this.ready) return;
    // Keyboard activation has no pointer gesture. Search drags must not pick a card.
    if (
      this.choice.kind === 'search' &&
      event.detail > 0 &&
      (!start ||
        start.option !== option ||
        event.timeStamp - start.time > 500 ||
        (event.clientX - start.x) ** 2 + (event.clientY - start.y) ** 2 > 36)
    )
      return;
    this.pick.emit(option);
  }
  query = '';
  private boundChoiceId: string | null = null;
  private optionsCache?: {
    options: ChoiceDto['options'];
    picks: readonly string[];
    query: string;
    ordered: boolean;
    result: NonNullable<ChoiceDto['options']>;
  };
  get visibleOptions() {
    const query = this.query.trim().toLocaleLowerCase();
    const options = this.choice.options;
    if (this.sendingLibraryAction && this.submission?.control === 'option')
      return options?.filter((option) => this.submission!.picks.includes(option.id)) ?? [];
    const picks = this.selection.picks;
    const ordered = this.showSelectedOrder && this.choice.isOrdering;
    const cached = this.optionsCache;
    if (
      cached &&
      cached.options === options &&
      cached.picks === picks &&
      cached.query === query &&
      cached.ordered === ordered
    )
      return cached.result;
    const result =
      options?.filter((option) => option.label.toLocaleLowerCase().includes(query)) ?? [];
    if (ordered) {
      const positions = new Map(picks.map((id, index) => [id, index]));
      result.sort(
        (a, b) =>
          (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    this.optionsCache = { options, picks, query, ordered, result };
    return result;
  }
  ngOnChanges(): void {
    if (this.boundChoiceId !== this.choice.id) {
      this.pointerStart = null;
      this.boundChoiceId = this.choice.id;
      this.query = '';
    }
    this.selection.bind(this.choice);
  }
  ngOnDestroy(): void {
    this.selection.reset();
  }
  trackOption(_: number, option: { id: string }): string {
    return option.id;
  }
}
