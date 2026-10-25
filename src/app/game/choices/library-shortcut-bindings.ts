export type LibraryShortcutAction = 'mulligan' | 'keep';
export interface LibraryShortcutBindings {
  mulligan: string | null;
  keep: string | null;
}
export const DEFAULT_LIBRARY_SHORTCUTS: LibraryShortcutBindings = { mulligan: '3', keep: '4' };

/** Pure key normalization and collision policy; preferences own persistence. */
export class LibraryShortcutBindingPolicy {
  static normalize(value: unknown): LibraryShortcutBindings {
    if (!value || typeof value !== 'object') return { ...DEFAULT_LIBRARY_SHORTCUTS };
    const input = value as Record<string, unknown>;
    const valid = (v: unknown): v is string | null =>
      v === null ||
      (typeof v === 'string' &&
        /^(Control\+)?(Alt\+)?(Shift\+)?(Meta\+)?([a-z0-9]|F[1-9]|F1[0-2]|Enter|Escape|Space)$/.test(
          v,
        ));
    const result = {
      mulligan: valid(input['mulligan']) ? input['mulligan'] : '3',
      keep: valid(input['keep']) ? input['keep'] : '4',
    };
    return result.mulligan !== null && result.mulligan === result.keep
      ? { ...DEFAULT_LIBRARY_SHORTCUTS }
      : result;
  }
  static capture(event: KeyboardEvent): string | null {
    if (event.repeat || event.isComposing) return null;
    const key =
      event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!/^([a-z0-9]|F[1-9]|F1[0-2]|Enter|Escape|Space)$/.test(key)) return null;
    return [
      event.ctrlKey ? 'Control' : '',
      event.altKey ? 'Alt' : '',
      event.shiftKey ? 'Shift' : '',
      event.metaKey ? 'Meta' : '',
      key,
    ]
      .filter(Boolean)
      .join('+');
  }
  static conflicts(
    bindings: LibraryShortcutBindings,
    action: LibraryShortcutAction,
    key: string | null,
  ): boolean {
    return key !== null && bindings[action === 'keep' ? 'mulligan' : 'keep'] === key;
  }
}
