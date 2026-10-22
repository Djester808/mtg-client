import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VirtualContentDirective } from './virtual-content.directive';
@Component({
  standalone: true,
  imports: [VirtualContentDirective],
  template: '<div class="slot"><span *appVirtualContent>Card content</span></div>',
})
class HostComponent {}
describe('Virtual card content', () => {
  it('releases offscreen views, keeps a sized slot, recreates on return and disconnects', () => {
    let callback: IntersectionObserverCallback = () => {};
    const disconnect = jasmine.createSpy();
    const observe = jasmine.createSpy();
    spyOn(window, 'IntersectionObserver').and.callFake(function (cb: IntersectionObserverCallback) {
      callback = cb;
      return {
        observe,
        disconnect,
        unobserve: () => {},
        takeRecords: () => [],
        root: null,
        rootMargin: '',
        thresholds: [],
      };
    } as never);
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    const slot = f.nativeElement.querySelector('.slot') as HTMLElement;
    spyOn(slot, 'getBoundingClientRect').and.returnValue({ width: 200, height: 300 } as DOMRect);
    expect(slot.querySelector('span')).not.toBeNull();
    callback(
      [{ isIntersecting: false }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(slot.querySelector('span')).toBeNull();
    expect(slot.style.minHeight).toBe('300px');
    callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(slot.querySelector('span')?.textContent).toBe('Card content');
    expect(slot.style.minHeight).toBe('');
    f.destroy();
    expect(disconnect).toHaveBeenCalled();
  });
});
