import { LibraryShortcutBindingPolicy as Policy } from './library-shortcut-bindings';
import { LibraryChoiceShortcuts } from './library-choice-shortcuts';
import { ChoiceDto } from '../../models/game.models';

describe('Library shortcut bindings', () => {
  it('normalizes saved values, preserves unbound actions and rejects collisions', () => {
    expect(Policy.normalize(null)).toEqual({ mulligan: '3', keep: '4' });
    expect(Policy.normalize({ mulligan: 'Control+Shift+m', keep: null })).toEqual({
      mulligan: 'Control+Shift+m',
      keep: null,
    });
    expect(Policy.normalize({ mulligan: 'wrong', keep: 42 })).toEqual({ mulligan: '3', keep: '4' });
    expect(Policy.normalize({ mulligan: 'k', keep: 'k' })).toEqual({ mulligan: '3', keep: '4' });
    expect(Policy.conflicts({ mulligan: 'm', keep: 'k' }, 'mulligan', 'k')).toBeTrue();
    expect(Policy.conflicts({ mulligan: 'm', keep: 'k' }, 'keep', null)).toBeFalse();
  });
  it('captures modifiers but leaves navigation, composition and repeat alone', () => {
    expect(
      Policy.capture(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true })),
    ).toBe('Control+Shift+m');
    expect(
      Policy.capture(new KeyboardEvent('keydown', { key: ' ', altKey: true, metaKey: true })),
    ).toBe('Alt+Meta+Space');
    for (const key of ['Tab', 'Shift', 'Unidentified'])
      expect(Policy.capture(new KeyboardEvent('keydown', { key }))).toBeNull();
    expect(Policy.capture(new KeyboardEvent('keydown', { key: 'm', repeat: true }))).toBeNull();
    expect(
      Policy.capture(new KeyboardEvent('keydown', { key: 'm', isComposing: true })),
    ).toBeNull();
  });
  it('uses current bindings only for offered actions and requires exact modifiers', () => {
    const bindings = { mulligan: 'Shift+m', keep: null };
    const shortcuts = new LibraryChoiceShortcuts(() => bindings);
    const choice = {
      kind: 'mulligan',
      options: [{ id: 'mulligan', label: 'Mulligan' }],
    } as ChoiceDto;
    expect(shortcuts.key(choice, 'mulligan')).toBe('Shift+m');
    expect(
      shortcuts.resolve(choice, false, new KeyboardEvent('keydown', { key: 'M', shiftKey: true })),
    ).toBe('mulligan');
    expect(shortcuts.resolve(choice, false, new KeyboardEvent('keydown', { key: 'm' }))).toBeNull();
    expect(shortcuts.resolve(choice, false, new KeyboardEvent('keydown', { key: '3' }))).toBeNull();
    bindings.mulligan = 'Alt+x';
    expect(shortcuts.key(choice, 'mulligan')).toBe('Alt+x');
  });
});
