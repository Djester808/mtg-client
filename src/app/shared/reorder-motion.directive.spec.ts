import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { motionReduced, ReorderMotionDirective } from './reorder-motion.directive';
@Component({
  standalone: true,
  imports: [ReorderMotionDirective],
  template:
    '<div [appReorderMotion]="columns"><div class="free-card" data-card-id="one"></div></div>',
})
class MotionHostComponent {
  columns: unknown = [];
}
describe('Original board reordering motion', () => {
  afterEach(() => document.documentElement.classList.remove('reduce-motion'));
  it('honors both saved and system reduced motion', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    expect(motionReduced(document)).toBeFalse();
    document.documentElement.classList.add('reduce-motion');
    expect(motionReduced(document)).toBeTrue();
  });
  it('glides visible stable card ids and cancels outstanding animations on teardown', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const f = TestBed.createComponent(MotionHostComponent);
    f.detectChanges();
    const element = f.nativeElement.querySelector('.free-card') as HTMLElement;
    const bounds = spyOn(element, 'getBoundingClientRect').and.returnValue(
      new DOMRect(10, 10, 50, 70),
    );
    const cancel = jasmine.createSpy('cancel');
    const animate = spyOn(element, 'animate').and.returnValue({ cancel } as unknown as Animation);
    f.componentInstance.columns = [1];
    f.detectChanges();
    bounds.and.returnValue(new DOMRect(60, 30, 50, 70));
    tick(20);
    expect(animate).toHaveBeenCalledWith(
      [{ translate: '-50px -20px' }, { translate: '0px 0px' }],
      jasmine.objectContaining({ duration: 240 }),
    );
    f.destroy();
    expect(cancel).toHaveBeenCalled();
  }));
  it('skips motion for reduced preferences and offscreen cards', fakeAsync(() => {
    document.documentElement.classList.add('reduce-motion');
    const f = TestBed.createComponent(MotionHostComponent);
    f.detectChanges();
    const el = f.nativeElement.querySelector('.free-card') as HTMLElement;
    const animate = spyOn(el, 'animate');
    spyOn(el, 'getBoundingClientRect').and.returnValue(new DOMRect(-200, -200, 50, 70));
    f.componentInstance.columns = [2];
    f.detectChanges();
    tick(20);
    expect(animate).not.toHaveBeenCalled();
    f.destroy();
  }));
});
