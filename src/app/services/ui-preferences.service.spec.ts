import { TestBed } from '@angular/core/testing';
import { UI_PREFERENCES_KEY, UiPreferencesService } from './ui-preferences.service';

describe('UiPreferencesService', () => {
  beforeEach(() => localStorage.removeItem(UI_PREFERENCES_KEY));
  afterEach(() => {
    const preferences = TestBed.inject(UiPreferencesService);
    preferences.update({
      textSize: 100,
      highContrast: false,
      reduceMotion: false,
      startup: '/',
      navigation: 'top',
    });
    localStorage.removeItem(UI_PREFERENCES_KEY);
  });
  it('persists accessibility and navigation, clamps text and rejects unknown startup routes', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    preferences.update({
      textSize: 999,
      highContrast: true,
      reduceMotion: true,
      startup: 'https://example.test',
      navigation: 'expanded',
    });
    expect(preferences.state().textSize).toBe(160);
    expect(preferences.state().startup).toBe('/');
    expect(document.documentElement.classList.contains('high-contrast')).toBeTrue();
    expect(document.documentElement.classList.contains('reduce-motion')).toBeTrue();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.6');
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)!).navigation).toBe('expanded');
  });
  it('resets only accessibility and supports undo', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    preferences.update({
      textSize: 125,
      highContrast: true,
      reduceMotion: true,
      startup: '/tools',
    });
    preferences.resetAccessibility();
    expect(preferences.state().textSize).toBe(100);
    expect(preferences.state().startup).toBe('/tools');
    expect(preferences.canUndo()).toBeTrue();
    preferences.undoReset();
    expect(preferences.state().textSize).toBe(125);
    expect(preferences.state().highContrast).toBeTrue();
    expect(preferences.canUndo()).toBeFalse();
  });
  it('persists library bindings, rejects collisions and resets independently', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    preferences.update({ textSize: 125, startup: '/tools' });
    expect(preferences.setLibraryShortcut('mulligan', 'Shift+m')).toBeTrue();
    expect(preferences.setLibraryShortcut('keep', 'Shift+m')).toBeFalse();
    expect(preferences.state().libraryShortcuts.keep).toBe('4');
    expect(preferences.setLibraryShortcut('keep', null)).toBeTrue();
    const saved = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)!);
    expect(saved.libraryShortcuts).toEqual({ mulligan: 'Shift+m', keep: null });
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(UiPreferencesService);
    expect(reloaded.state().libraryShortcuts).toEqual(saved.libraryShortcuts);
    reloaded.resetLibraryShortcuts();
    expect(reloaded.state().libraryShortcuts).toEqual({ mulligan: '3', keep: '4' });
    expect(reloaded.state().textSize).toBe(125);
    expect(reloaded.state().startup).toBe('/tools');
  });
  it('persists only valid panel geometry and strips unrelated stored data', () => {
    localStorage.setItem(
      UI_PREFERENCES_KEY,
      JSON.stringify({
        libraryPanel: { left: 180, top: 150, width: 360, height: 240, cards: ['private'] },
      }),
    );
    const preferences = TestBed.inject(UiPreferencesService);
    const geometry = { left: 180, top: 150, width: 360, height: 240 };
    expect(preferences.state().libraryPanel).toEqual(geometry);
    preferences.update({ libraryPanel: geometry });
    expect(localStorage.getItem(UI_PREFERENCES_KEY)).not.toContain('private');
    TestBed.resetTestingModule();
    const restored = TestBed.inject(UiPreferencesService);
    expect(restored.state().libraryPanel).toEqual(geometry);
    restored.update({ libraryPanel: { ...geometry, width: -1 } });
    expect(restored.state().libraryPanel).toBeNull();
    restored.update({ libraryPanel: { ...geometry, left: NaN } });
    expect(restored.state().libraryPanel).toBeNull();
  });
  it('exports only versioned library geometry and imports it without changing other preferences', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    const geometry = Object.freeze({ left: 180, top: 150, width: 360, height: 240 });
    preferences.update({ libraryPanel: geometry, textSize: 125 });
    const exported = preferences.exportLibraryLayout();
    expect(JSON.parse(exported)).toEqual({ version: 1, libraryPanel: geometry });
    preferences.update({ libraryPanel: null, textSize: 110 });
    expect(preferences.importLibraryLayout(exported)).toBeTrue();
    expect(preferences.state().libraryPanel).toEqual(geometry);
    expect(preferences.state().textSize).toBe(110);
    expect(preferences.importLibraryLayout('{"version":1,"libraryPanel":null}')).toBeTrue();
    expect(preferences.state().libraryPanel).toBeNull();
  });
  for (const invalid of [
    '{broken',
    'null',
    '[]',
    '{}',
    '{"version":2,"libraryPanel":null}',
    '{"version":1,"libraryPanel":{"left":0,"top":0,"width":0,"height":200}}',
    '{"version":1,"libraryPanel":{"left":"0","top":0,"width":300,"height":200}}',
    '{"version":1,"libraryPanel":{"left":0,"top":0,"width":300}}',
  ]) {
    it('rejects invalid layout without changing state or storage: ' + invalid, () => {
      const preferences = TestBed.inject(UiPreferencesService);
      preferences.update({ libraryPanel: { left: 20, top: 30, width: 400, height: 300 } });
      const before = preferences.state();
      const stored = localStorage.getItem(UI_PREFERENCES_KEY);
      expect(preferences.importLibraryLayout(invalid)).toBeFalse();
      expect(preferences.state()).toBe(before);
      expect(localStorage.getItem(UI_PREFERENCES_KEY)).toBe(stored);
    });
  }
  it('discards unrelated imported fields and never exports private payloads', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    expect(
      preferences.importLibraryLayout(
        JSON.stringify({
          version: 1,
          textSize: 160,
          cards: ['private-card'],
          libraryPanel: { left: 20, top: 30, width: 400, height: 300, cards: ['private-card'] },
        }),
      ),
    ).toBeTrue();
    expect(JSON.parse(preferences.exportLibraryLayout())).toEqual({
      version: 1,
      libraryPanel: { left: 20, top: 30, width: 400, height: 300 },
    });
    expect(preferences.state().textSize).toBe(100);
    expect(localStorage.getItem(UI_PREFERENCES_KEY)).not.toContain('private-card');
  });
  it('round trips opponent geometry while preserving it when importing an older own-only file', () => {
    const preferences = TestBed.inject(UiPreferencesService);
    const opponent = Object.freeze({ left: 60, top: 70, width: 320, height: 210 });
    preferences.update({ libraryPanel: null, opponentLibraryPanel: opponent });
    const exported = preferences.exportLibraryLayout();
    expect(JSON.parse(exported)).toEqual({
      version: 1,
      libraryPanel: null,
      opponentLibraryPanel: opponent,
    });
    preferences.update({ opponentLibraryPanel: null });
    expect(preferences.importLibraryLayout(exported)).toBeTrue();
    expect(preferences.state().opponentLibraryPanel).toEqual(opponent);
    expect(preferences.importLibraryLayout('{"version":1,"libraryPanel":null}')).toBeTrue();
    expect(preferences.state().opponentLibraryPanel).toEqual(opponent);
    const before = preferences.state();
    expect(
      preferences.importLibraryLayout(
        '{"version":1,"libraryPanel":null,"opponentLibraryPanel":{"width":-1}}',
      ),
    ).toBeFalse();
    expect(preferences.state()).toBe(before);
  });
  it('recovers from corrupt saved settings', () => {
    localStorage.setItem(UI_PREFERENCES_KEY, '{broken');
    expect(TestBed.inject(UiPreferencesService).state().textSize).toBe(100);
  });
});
