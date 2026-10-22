import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthActions } from '../../store/auth/auth.actions';
describe('Login persistence choice', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), provideMockStore({ initialState: { auth: {} } })],
    }),
  );
  it('sends the selected session-only preference and ignores an incomplete form', () => {
    const c = TestBed.createComponent(LoginComponent).componentInstance,
      dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    c.submit();
    expect(dispatch).not.toHaveBeenCalled();
    c.form.patchValue({ username: 'TestUser', password: 'TestPassword', rememberMe: false });
    c.submit();
    expect(dispatch).toHaveBeenCalledWith(
      AuthActions.login({ username: 'TestUser', password: 'TestPassword', rememberMe: false }),
    );
  });
});
