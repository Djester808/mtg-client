import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { AccountIdentityComponent } from './account-identity.component';
import { AuthActions } from '../../store/auth/auth.actions';
describe('Account identity and privacy', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountIdentityComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideMockStore()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function setup() {
    const f = TestBed.createComponent(AccountIdentityComponent);
    f.detectChanges();
    http.expectOne('/api/account/deck-privacy').flush({ hideProfileDecks: false });
    return f;
  }
  it('checks availability, handles stale responses and changes username before signing out', () => {
    const f = setup(),
      c = f.componentInstance,
      store = TestBed.inject(MockStore),
      dispatch = spyOn(store, 'dispatch');
    c.username = 'NewName';
    c.password = 'password';
    c.checkUsername();
    c.checkUsername();
    http.expectOne('/api/account/username-available?username=NewName').flush({ available: true });
    expect(c.available()).toBe('NewName');
    c.changeUsername();
    const change = http.expectOne('/api/account/username');
    expect(change.request.body).toEqual({ username: 'NewName', currentPassword: 'password' });
    change.flush(null);
    expect(dispatch).toHaveBeenCalledWith(AuthActions.logout());
    expect(c.password).toBe('');
    c.username = 'stale';
    c.checkUsername();
    c.username = 'different';
    http.expectOne('/api/account/username-available?username=stale').flush({ available: true });
    expect(c.available()).toBeNull();
    c.changeUsername();
    expect(dispatch).toHaveBeenCalledTimes(1);
    f.destroy();
  });
  it('keeps privacy unchanged after a failed save and supports retry', () => {
    const f = setup(),
      c = f.componentInstance;
    c.togglePrivacy();
    c.togglePrivacy();
    http.expectOne('/api/account/deck-privacy').flush({}, { status: 500, statusText: 'Failed' });
    expect(c.privacy()).toBeFalse();
    expect(c.busy()).toBeFalse();
    c.togglePrivacy();
    const save = http.expectOne('/api/account/deck-privacy');
    expect(save.request.body.hideProfileDecks).toBeTrue();
    save.flush({ hideProfileDecks: true });
    f.detectChanges();
    expect(f.nativeElement.querySelector('#deck-privacy').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(c.notice()).toContain('saved');
    f.destroy();
  });
  it('reports taken names and failed checks without allowing a change', () => {
    const f = setup(),
      c = f.componentInstance;
    c.username = 'Taken';
    c.checkUsername();
    http.expectOne('/api/account/username-available?username=Taken').flush({ available: false });
    expect(c.error()).toContain('taken');
    c.checkUsername();
    http
      .expectOne('/api/account/username-available?username=Taken')
      .flush({}, { status: 400, statusText: 'Bad' });
    expect(c.busy()).toBeFalse();
    c.available.set('Taken');
    c.password = 'wrong';
    c.changeUsername();
    http.expectOne('/api/account/username').flush({}, { status: 400, statusText: 'Bad' });
    expect(c.busy()).toBeFalse();
    expect(c.error()).toBeTruthy();
    f.destroy();
  });
  it('retries loading privacy and guards toggles before it is known', () => {
    const f = TestBed.createComponent(AccountIdentityComponent);
    f.detectChanges();
    f.componentInstance.togglePrivacy();
    http.expectOne('/api/account/deck-privacy').flush({}, { status: 500, statusText: 'Failed' });
    expect(f.componentInstance.privacy()).toBeNull();
    f.componentInstance.loadPrivacy();
    http.expectOne('/api/account/deck-privacy').flush({ hideProfileDecks: true });
    expect(f.componentInstance.privacy()).toBeTrue();
    f.destroy();
  });
});
