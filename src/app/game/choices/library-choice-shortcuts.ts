import {
  DEFAULT_LIBRARY_SHORTCUTS,
  LibraryShortcutBindingPolicy,
  LibraryShortcutBindings,
} from './library-shortcut-bindings';
import { ChoiceDto } from '../../models/game.models';

/** MTGO's default Yes/No bindings, restricted to offered opening-hand actions. */
export class LibraryChoiceShortcuts {
  constructor(
    private readonly bindings: () => LibraryShortcutBindings = () => DEFAULT_LIBRARY_SHORTCUTS,
  ) {}
  key(choice: ChoiceDto, option: string): string | null {
    if (choice.kind !== 'mulligan') return null;
    return option === 'mulligan' || option === 'keep' ? this.bindings()[option] : null;
  }

  resolve(choice: ChoiceDto, pending: boolean, event: KeyboardEvent): string | null {
    if (pending || event.defaultPrevented || event.repeat || event.isComposing) return null;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], dialog',
      )
    )
      return null;
    const key = LibraryShortcutBindingPolicy.capture(event);
    return key
      ? (choice.options?.find((option) => this.key(choice, option.id) === key)?.id ?? null)
      : null;
  }
}
