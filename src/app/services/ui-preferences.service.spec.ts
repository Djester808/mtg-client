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
  it('recovers from corrupt saved settings', () => {
    localStorage.setItem(UI_PREFERENCES_KEY, '{broken');
    expect(TestBed.inject(UiPreferencesService).state().textSize).toBe(100);
  });
});
