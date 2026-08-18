import { TestBed } from '@angular/core/testing';
import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UserAvatarComponent] });
  });

  function render(inputs: Partial<UserAvatarComponent>) {
    const fixture = TestBed.createComponent(UserAvatarComponent);
    Object.assign(fixture.componentInstance, inputs);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the picture when there is one', () => {
    const fixture = render({ username: 'Nissa', avatarUrl: '/api/users/Nissa/avatar?v=1' });

    const img = fixture.nativeElement.querySelector('img.ua-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('alt')).toBe('Nissa avatar');
    expect(fixture.nativeElement.querySelector('.ua-initial')).toBeNull();
  });

  it('falls back to an initial when there is no picture', () => {
    const fixture = render({ username: 'nissa' });

    const initial = fixture.nativeElement.querySelector('.ua-initial') as HTMLElement;
    expect(initial.textContent?.trim()).toBe('n'); // upper-cased by CSS, not by the DOM
    expect(fixture.nativeElement.querySelector('img.ua-img')).toBeNull();
  });

  it('falls back to the initial when the picture fails to load', () => {
    // A deleted avatar whose URL is still on a cached page would otherwise leave a broken
    // image icon in the middle of the profile. Driven through a real error event rather
    // than by setting the flag: the template binding is what marks this OnPush view dirty,
    // and assigning the field from outside would pass while the screen never repainted.
    const fixture = render({ username: 'Nissa', avatarUrl: '/gone.png' });

    fixture.nativeElement.querySelector('img.ua-img').dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ua-initial')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('img.ua-img')).toBeNull();
  });

  it('prefers the display name for the letter and the alt text', () => {
    const fixture = render({ username: 'xX_bolt_Xx', displayName: 'Ravnica Rachel' });

    expect(fixture.componentInstance.letter).toBe('R');
    expect(fixture.componentInstance.label).toBe('Ravnica Rachel');
  });

  it('gives one username the same colour every time, and different names different ones', () => {
    // The point of hashing rather than randomising: the same person is the same tile in
    // the players list, on their profile, and after a reload.
    const first = render({ username: 'Nissa' }).componentInstance.tint;
    const again = render({ username: 'Nissa' }).componentInstance.tint;
    expect(first).toBe(again);

    const names = ['Nissa', 'Jace', 'Liliana', 'Chandra', 'Gideon', 'Ajani', 'Teferi'];
    const tints = new Set(names.map((n) => render({ username: n }).componentInstance.tint));
    expect(tints.size).toBeGreaterThan(1);
  });

  it('survives a user with an empty name rather than rendering nothing', () => {
    expect(render({ username: '' }).componentInstance.letter).toBe('?');
  });

  it('sizes itself from the size input', () => {
    const fixture = render({ username: 'Nissa', size: 88 });

    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--ua-size')).toBe('88px');
  });
});
