import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UI_PREFERENCES_KEY, UiPreferencesService } from '../services/ui-preferences.service';
import { FloatingPanelDirective } from './floating-panel.directive';
@Component({
  standalone: true,
  imports: [FloatingPanelDirective],
  template:
    '<details open appFloatingPanel style="--floating-panel:1"><summary><button data-panel-handle>Move</button></summary><button class="card">Card</button></details>',
})
class HostComponent {}
describe('FloatingPanelDirective', () => {
  beforeEach(() => localStorage.removeItem(UI_PREFERENCES_KEY));
  afterEach(() => localStorage.removeItem(UI_PREFERENCES_KEY));
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element: HTMLDetailsElement = fixture.nativeElement.querySelector('details');
    const handle: HTMLButtonElement = element.querySelector('[data-panel-handle]')!;
    const directive = fixture.debugElement
      .query(By.directive(FloatingPanelDirective))
      .injector.get(FloatingPanelDirective);
    spyOn(element, 'getBoundingClientRect').and.callFake(
      () =>
        ({
          left: parseFloat(element.style.left) || 100,
          top: parseFloat(element.style.top) || 100,
          width: parseFloat(element.style.width) || 300,
          height: parseFloat(element.style.height) || 200,
        }) as DOMRect,
    );
    spyOn(element, 'setPointerCapture');
    spyOn(element, 'hasPointerCapture').and.returnValue(true);
    spyOn(element, 'releasePointerCapture');
    return { fixture, element, handle, directive };
  }
  it('restores opted-in geometry in a fresh inspection and clamps stale viewport positions', () => {
    TestBed.overrideComponent(HostComponent, {
      set: {
        template:
          '<details open appFloatingPanel rememberPanel="library" style="--floating-panel:1"><summary><button data-panel-handle>Move</button></summary></details>',
      },
    });
    const preferences = TestBed.inject(UiPreferencesService);
    preferences.update({ libraryPanel: { left: 99999, top: 99999, width: 300, height: 200 } });
    const first = setup();
    first.directive.constrain();
    expect(parseFloat(first.element.style.left)).toBe(window.innerWidth - 312);
    expect(parseFloat(first.element.style.top)).toBe(window.innerHeight - 212);
    const saved = first.element.style.cssText;
    first.fixture.destroy();
    const second = setup();
    second.directive.constrain();
    expect(second.element.style.cssText).toBe(saved);
    second.fixture.destroy();
  });
  it('restores and moves opponent geometry without overwriting own-library geometry', () => {
    const own = Object.freeze({ left: 20, top: 30, width: 300, height: 200 });
    localStorage.setItem(
      UI_PREFERENCES_KEY,
      JSON.stringify({
        libraryPanel: own,
        opponentLibraryPanel: { left: 60, top: 70, width: 320, height: 210 },
      }),
    );
    TestBed.overrideComponent(HostComponent, {
      set: {
        template:
          '<details open appFloatingPanel rememberPanel="opponent-library" style="--floating-panel:1"><summary><button data-panel-handle>Move</button></summary></details>',
      },
    });
    const { fixture, element, handle, directive } = setup();
    directive.constrain();
    expect(element.style.left).toBe('60px');
    expect(element.style.top).toBe('70px');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const stored = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)!);
    expect(stored.libraryPanel).toEqual(own);
    expect(stored.opponentLibraryPanel).toEqual({ left: 70, top: 70, width: 320, height: 210 });
    fixture.destroy();
  });
  it('activates a background press without dragging, cancelling it or changing geometry', () => {
    const { fixture, element } = setup();
    const style = element.style.cssText;
    const press = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    element.dispatchEvent(press);
    expect(document.activeElement).toBe(element);
    expect(element.tabIndex).toBe(-1);
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    expect(press.defaultPrevented).toBeFalse();
    expect(element.style.cssText).toBe(style);
    element.blur();
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 }));
    expect(document.activeElement).not.toBe(element);
    element.style.setProperty('--floating-panel', '0');
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.activeElement).not.toBe(element);
    fixture.destroy();
  });
  it('moves only from its handle and clamps dragging to the viewport', () => {
    const { fixture, element, handle } = setup();
    element.querySelector('.card')!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      }),
    );
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 900, clientY: 900 }),
    );
    expect(element.style.left).toBe('');
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 2,
        clientX: -500,
        clientY: -500,
      }),
    );
    expect(element.style.left).toBe('12px');
    expect(element.style.top).toBe('12px');
    element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
    expect(element.releasePointerCapture).toHaveBeenCalledWith(2);
    fixture.destroy();
  });
  it('supports keyboard movement and prevents the handle from collapsing the panel', () => {
    const { fixture, element, handle } = setup();
    handle.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(element.style.left).toBe('140px');
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    expect(element.style.top).toBe('90px');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    handle.dispatchEvent(click);
    expect(click.defaultPrevented).toBeTrue();
    expect(element.open).toBeTrue();
    fixture.destroy();
  });
  it('restores geometry after collapse and phone layout without retaining it in a new inspection', () => {
    const { fixture, element, directive } = setup();
    element.style.left = '180px';
    element.style.top = '150px';
    element.style.width = '360px';
    element.style.height = '240px';
    directive.constrain();
    const saved = element.style.cssText;
    element.open = false;
    directive.constrain();
    expect(element.style.width).toBe('');
    element.open = true;
    directive.constrain();
    expect(element.style.cssText).toBe(saved);
    element.style.setProperty('--floating-panel', '0');
    directive.constrain();
    element.style.setProperty('--floating-panel', '1');
    directive.constrain();
    expect(element.style.cssText).toBe(saved);
    fixture.destroy();
    const fresh = setup();
    fresh.directive.constrain();
    expect(fresh.element.style.left).toBe('100px');
    fresh.fixture.destroy();
  });
  it('constrains resize geometry and clears desktop positioning when the responsive style disables it', () => {
    const { fixture, element, handle, directive } = setup();
    element.style.width = innerWidth + 500 + 'px';
    element.style.height = innerHeight + 500 + 'px';
    directive.constrain();
    expect(parseFloat(element.style.width)).toBe(innerWidth - 24);
    expect(parseFloat(element.style.height)).toBe(innerHeight - 24);
    element.style.setProperty('--floating-panel', '0');
    directive.constrain();
    expect(element.style.width).toBe('');
    expect(element.style.left).toBe('');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(element.style.left).toBe('');
    fixture.destroy();
  });
});
