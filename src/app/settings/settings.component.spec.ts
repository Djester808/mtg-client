import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { SettingsComponent } from './settings.component';
import { BreakpointsService } from '../shared/breakpoints.service';
import { UI_PREFERENCES_KEY } from '../services/ui-preferences.service';

describe('Searchable settings', () => {
  const phone = signal(false);
  beforeEach(() => {
    phone.set(false);
    localStorage.removeItem(UI_PREFERENCES_KEY);
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideRouter([]), { provide: BreakpointsService, useValue: { isPhone: phone } }],
    });
  });
  afterEach(() => localStorage.removeItem(UI_PREFERENCES_KEY));
  it('searches across categories and supports phone category navigation', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.visible().some((s) => s.id === 'text')).toBeTrue();
    page.query.set('password');
    fixture.detectChanges();
    expect(page.visible().map((s) => s.id)).toEqual(['account']);
    page.query.set('no such preference');
    expect(page.visible()).toEqual([]);
    page.query.set('');
    phone.set(true);
    fixture.detectChanges();
    expect(page.showCategories()).toBeTrue();
    expect(page.visible()).toEqual([]);
    page.category.set('Navigation');
    fixture.detectChanges();
    expect(page.visible().map((s) => s.id)).toEqual(['startup', 'navigation']);
    page.setNavigation('expanded');
    expect(page.preferences.state().navigation).toBe('expanded');
    page.setNavigation('unknown');
    expect(page.preferences.state().navigation).toBe('expanded');
    page.preferences.update({ navigation: 'top' });
    fixture.destroy();
  });
});
