import { ElementRef } from '@angular/core';
import { ToBodyDirective } from './to-body.directive';

describe('ToBodyDirective', () => {
  it('keeps card details inside a native dialog top layer', () => {
    const dialog = document.createElement('dialog');
    const host = document.createElement('div');
    dialog.appendChild(host);
    document.body.appendChild(dialog);
    const directive = new ToBodyDirective(new ElementRef(host));
    directive.ngOnInit();
    expect(host.parentElement).toBe(dialog);
    directive.ngOnDestroy();
    expect(host.isConnected).toBeFalse();
    dialog.remove();
  });
  it('moves ordinary overlays to the body and removes them on destroy', () => {
    const parent = document.createElement('section');
    const host = document.createElement('div');
    parent.appendChild(host);
    const directive = new ToBodyDirective(new ElementRef(host));
    directive.ngOnInit();
    expect(host.parentElement).toBe(document.body);
    directive.ngOnDestroy();
    expect(host.isConnected).toBeFalse();
  });
});
