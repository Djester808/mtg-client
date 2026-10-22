import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogFocusDirective } from './dialog-focus.directive';
@Component({
  standalone: true,
  imports: [DialogFocusDirective],
  template: '<div appDialogFocus><button>First</button><button>Last</button></div>',
})
class DialogHostComponent {}
describe('DialogFocusDirective', () => {
  it('contains Tab focus and restores the opener when closed', () => {
    TestBed.configureTestingModule({ imports: [DialogHostComponent] });
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const fixture = TestBed.createComponent(DialogHostComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement.querySelector('div');
    const buttons = root.querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(buttons[0]);
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(buttons[1]);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.destroy();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
