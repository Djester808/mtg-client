import { TestBed } from '@angular/core/testing';
import { CardOptionsMenuComponent } from './card-options-menu.component';
describe('CardOptionsMenuComponent', () => {
  it('emits inspection once without bubbling the click to outside dismiss handlers', () => {
    const fixture = TestBed.createComponent(CardOptionsMenuComponent);
    fixture.detectChanges();
    const inspect = spyOn(fixture.componentInstance.inspect, 'emit'),
      outside = jasmine.createSpy('outside');
    document.addEventListener('click', outside);
    try {
      fixture.nativeElement.querySelector('button').click();
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(outside).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', outside);
      fixture.destroy();
    }
  });
  it('moves focus with arrows and dismisses only the menu on Escape', () => {
    const fixture = TestBed.createComponent(CardOptionsMenuComponent);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[0].focus();
    fixture.componentInstance.key(
      new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }),
    );
    expect(document.activeElement).toBe(buttons[1]);
    const dismiss = spyOn(fixture.componentInstance.dismiss, 'emit'),
      event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    fixture.componentInstance.key(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(dismiss).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('keeps the popup on screen near the bottom-right edge', () => {
    const fixture = TestBed.createComponent(CardOptionsMenuComponent);
    fixture.componentRef.setInput('x', innerWidth);
    fixture.componentRef.setInput('y', innerHeight);
    expect(fixture.componentInstance.left).toBeLessThan(innerWidth);
    expect(fixture.componentInstance.top).toBeLessThan(innerHeight);
    fixture.destroy();
  });

  it('restores focus to the original card when the menu closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const fixture = TestBed.createComponent(CardOptionsMenuComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').focus();
    fixture.destroy();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
