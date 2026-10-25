import {
  DEFAULT_LIBRARY_SHORTCUTS,
  LibraryShortcutBindingPolicy,
  LibraryShortcutBindings,
  LibraryShortcutAction,
} from '../game/choices/library-shortcut-bindings';
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export interface PanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UiPreferences {
  libraryPanel: PanelGeometry | null;
  opponentLibraryPanel: PanelGeometry | null;
  libraryShortcuts: LibraryShortcutBindings;
  hideCollectionValue: boolean;
  textSize: number;
  highContrast: boolean;
  reduceMotion: boolean;
  startup: string;
  navigation: 'top' | 'compact' | 'expanded';
}
export const UI_PREFERENCES_KEY = 'compleat.ui.preferences';
export const STARTUP_DESTINATIONS = [
  { path: '/', label: 'Home' },
  { path: '/collection', label: 'Collection' },
  { path: '/deck', label: 'Decks' },
  { path: '/community/commanders', label: 'Explore commanders' },
  { path: '/tools', label: 'Tools' },
  { path: '/play', label: 'Play' },
];

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = (() => {
    try {
      return this.document.defaultView?.localStorage;
    } catch {
      return undefined;
    }
  })();
  readonly state = signal<UiPreferences>(this.read());
  private readonly undo = signal<Pick<
    UiPreferences,
    'textSize' | 'highContrast' | 'reduceMotion'
  > | null>(null);
  readonly canUndo = computed(() => this.undo() !== null);
  readonly saved = signal(true);
  constructor() {
    this.apply();
  }
  update(patch: Partial<UiPreferences>) {
    this.state.set(this.normalize({ ...this.state(), ...patch }));
    this.apply();
    try {
      this.storage?.setItem(UI_PREFERENCES_KEY, JSON.stringify(this.state()));
      this.saved.set(true);
    } catch {
      this.saved.set(false);
    }
  }
  setLibraryShortcut(action: LibraryShortcutAction, key: string | null): boolean {
    if (LibraryShortcutBindingPolicy.conflicts(this.state().libraryShortcuts, action, key))
      return false;
    this.update({ libraryShortcuts: { ...this.state().libraryShortcuts, [action]: key } });
    return true;
  }
  exportLibraryLayout(): string {
    const opponent = this.panel(this.state().opponentLibraryPanel);
    return JSON.stringify({
      version: 1,
      libraryPanel: this.panel(this.state().libraryPanel),
      ...(opponent ? { opponentLibraryPanel: opponent } : {}),
    });
  }
  importLibraryLayout(text: string): boolean {
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const layout = value as {
        version?: unknown;
        libraryPanel?: PanelGeometry | null;
        opponentLibraryPanel?: PanelGeometry | null;
      };
      if (layout.version !== 1) return false;
      const geometry = this.panel(layout.libraryPanel);
      if (layout.libraryPanel !== null && !geometry) return false;
      const hasOpponent = Object.prototype.hasOwnProperty.call(layout, 'opponentLibraryPanel');
      const opponent = this.panel(layout.opponentLibraryPanel);
      if (hasOpponent && layout.opponentLibraryPanel !== null && !opponent) return false;
      this.update({
        libraryPanel: geometry,
        ...(hasOpponent ? { opponentLibraryPanel: opponent } : {}),
      });
      return true;
    } catch {
      return false;
    }
  }
  resetLibraryShortcuts(): void {
    this.update({ libraryShortcuts: { ...DEFAULT_LIBRARY_SHORTCUTS } });
  }
  resetAccessibility() {
    const { textSize, highContrast, reduceMotion } = this.state();
    this.undo.set({ textSize, highContrast, reduceMotion });
    this.update({ textSize: 100, highContrast: false, reduceMotion: false });
  }
  undoReset() {
    const previous = this.undo();
    if (previous) {
      this.update(previous);
      this.undo.set(null);
    }
  }
  private panel(value: PanelGeometry | null | undefined): PanelGeometry | null {
    if (
      !value ||
      ![value.left, value.top, value.width, value.height].every(Number.isFinite) ||
      value.width <= 0 ||
      value.height <= 0
    )
      return null;
    const { left, top, width, height } = value;
    return { left, top, width, height };
  }
  private read(): UiPreferences {
    try {
      return this.normalize(JSON.parse(this.storage?.getItem(UI_PREFERENCES_KEY) || '{}'));
    } catch {
      return this.normalize({});
    }
  }
  private normalize(value: Partial<UiPreferences>): UiPreferences {
    return {
      libraryPanel: this.panel(value.libraryPanel),
      opponentLibraryPanel: this.panel(value.opponentLibraryPanel),
      libraryShortcuts: LibraryShortcutBindingPolicy.normalize(value.libraryShortcuts),
      hideCollectionValue: value.hideCollectionValue === true,
      textSize:
        typeof value.textSize === 'number' && Number.isFinite(value.textSize)
          ? Math.min(160, Math.max(85, Math.round(value.textSize)))
          : 100,
      highContrast: value.highContrast === true,
      reduceMotion:
        typeof value.reduceMotion === 'boolean'
          ? value.reduceMotion
          : (this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
            false),
      startup: STARTUP_DESTINATIONS.some((d) => d.path === value.startup) ? value.startup! : '/',
      navigation:
        value.navigation === 'compact' || value.navigation === 'expanded'
          ? value.navigation
          : 'top',
    };
  }
  private apply() {
    const state = this.state();
    const root = this.document.documentElement;
    root.style.setProperty('--text-scale', String(state.textSize / 100));
    root.classList.toggle('high-contrast', state.highContrast);
    root.classList.toggle('reduce-motion', state.reduceMotion);
    root.setAttribute('data-navigation', state.navigation);
    root.toggleAttribute('data-large-text', state.textSize >= 125);
  }
}
