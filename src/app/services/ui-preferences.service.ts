import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export interface UiPreferences {
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
  private read(): UiPreferences {
    try {
      return this.normalize(JSON.parse(this.storage?.getItem(UI_PREFERENCES_KEY) || '{}'));
    } catch {
      return this.normalize({});
    }
  }
  private normalize(value: Partial<UiPreferences>): UiPreferences {
    return {
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
