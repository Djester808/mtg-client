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
  it('imports a layout file, reports rejection and allows the same file to be retried', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const page = fixture.componentInstance;
    page.query.set('library layout');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#library-layout-file');
    expect(input).not.toBeNull();
    const geometry = Object.freeze({ left: 20, top: 30, width: 400, height: 300 });
    const upload = async (text: string) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'layout.json', { type: 'application/json' }));
      input.files = transfer.files;
      await page.importLayout(input);
      fixture.detectChanges();
      expect(input.value).toBe('');
      expect(page.layoutBusy()).toBeFalse();
    };
    await upload(JSON.stringify({ version: 1, libraryPanel: geometry }));
    expect(page.preferences.state().libraryPanel).toEqual(geometry);
    expect(page.layoutStatus()).toContain('restored');
    const before = page.preferences.state();
    await upload('{broken');
    expect(page.preferences.state()).toBe(before);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'not changed',
    );
    fixture.destroy();
  });
  it('exports the fixed library-only payload as a downloadable file', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:layout');
    spyOn(HTMLAnchorElement.prototype, 'click');
    fixture.componentInstance.exportLayout();
    expect(create).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    fixture.destroy();
  });
  it('edits bindings with collision feedback, unbind and reset', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const page = fixture.componentInstance;
    page.query.set('shortcuts');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#shortcut-keep')).not.toBeNull();
    page.captureShortcut('keep', new KeyboardEvent('keydown', { key: '3', cancelable: true }));
    expect(page.shortcutError()).toContain('already assigned');
    page.captureShortcut(
      'keep',
      new KeyboardEvent('keydown', { key: 'K', shiftKey: true, cancelable: true }),
    );
    expect(page.preferences.state().libraryShortcuts.keep).toBe('Shift+k');
    expect(page.shortcutError()).toBe('');
    page.captureShortcut('keep', new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(page.preferences.state().libraryShortcuts.keep).toBe('Shift+k');
    page.clearShortcut('keep');
    expect(page.preferences.state().libraryShortcuts.keep).toBeNull();
    page.resetShortcuts();
    expect(page.preferences.state().libraryShortcuts.keep).toBe('4');
    fixture.destroy();
  });
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
