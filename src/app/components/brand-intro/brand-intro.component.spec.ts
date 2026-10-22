import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BrandIntroComponent } from './brand-intro.component';

describe('Compleat intro', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BrandIntroComponent] });
  });

  function mount(reduced = false) {
    spyOn(window, 'matchMedia').and.returnValue({ matches: reduced } as MediaQueryList);
    const fixture = TestBed.createComponent(BrandIntroComponent);
    const complete = jasmine.createSpy('completed');
    fixture.componentInstance.completed.subscribe(complete);
    fixture.detectChanges();
    return { fixture, intro: fixture.componentInstance, complete };
  }

  it('uses the original assets and exits after two complete passes and the minimum time', fakeAsync(() => {
    const { fixture, intro, complete } = mount();
    const video: HTMLVideoElement = fixture.nativeElement.querySelector('video');
    expect(video.getAttribute('src')).toBe('assets/brand/intro.mp4');
    expect(video.muted).toBeTrue();
    spyOn(video, 'play').and.returnValue(Promise.resolve());
    intro.loop(video);
    intro.loop(video);
    tick(4999);
    expect(complete).not.toHaveBeenCalled();
    tick(321);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('keeps the poster when video fails and never holds the app indefinitely', fakeAsync(() => {
    const { fixture, intro, complete } = mount();
    intro.videoFailed();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'assets/brand/logo.png',
    );
    tick(5320);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('falls back when replay is rejected', fakeAsync(() => {
    const { fixture, intro, complete } = mount();
    const video = fixture.nativeElement.querySelector('video');
    spyOn(video, 'play').and.returnValue(Promise.reject(new Error('Autoplay refused')));
    intro.loop(video);
    tick();
    expect(intro.failed()).toBeTrue();
    tick(5320);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('uses a still for reduced motion', fakeAsync(() => {
    const { fixture, complete } = mount(true);
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    tick(5120);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('allows skipping and emits completion only once', fakeAsync(() => {
    const { fixture, intro, complete } = mount();
    fixture.nativeElement.querySelector('button').click();
    intro.finish();
    tick(320);
    expect(complete).toHaveBeenCalledTimes(1);
    tick(10000);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('has a deadline when video never reports completion', fakeAsync(() => {
    const { fixture, complete } = mount();
    tick(10320);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('finishes at a clip boundary when the minimum has already elapsed', fakeAsync(() => {
    const { fixture, intro, complete } = mount();
    const video = fixture.nativeElement.querySelector('video');
    spyOn(video, 'play').and.returnValue(Promise.resolve());
    tick(5000);
    intro.loop(video);
    intro.loop(video);
    tick(320);
    expect(complete).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('cleans up timers when destroyed', fakeAsync(() => {
    const { fixture, complete } = mount();
    fixture.destroy();
    tick(11000);
    expect(complete).not.toHaveBeenCalled();
  }));
});
