import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { RegisterComponent } from './register.component';
describe('Registration policy', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), provideMockStore({ initialState: { auth: {} } })],
    }),
  );
  it('requires matching passwords and explicit terms acceptance', () => {
    const c = TestBed.createComponent(RegisterComponent).componentInstance;
    c.form.setValue({
      username: 'Valid_123',
      email: 'valid@example.test',
      password: 'ValidPassword123',
      confirmPassword: 'different',
      acceptedTerms: false,
    });
    expect(c.form.valid).toBeFalse();
    c.form.patchValue({ confirmPassword: 'ValidPassword123' });
    expect(c.form.valid).toBeFalse();
    c.form.patchValue({ acceptedTerms: true });
    expect(c.form.valid).toBeTrue();
    expect(c.passwordStrength).toBe('Strong');
  });
  it('enforces the server username alphabet and bounds', () => {
    const c = TestBed.createComponent(RegisterComponent).componentInstance;
    for (const value of ['bad name', 'a'.repeat(33), 'ab']) {
      c.form.controls.username.setValue(value);
      expect(c.form.controls.username.valid).withContext(value).toBeFalse();
    }
    c.form.controls.username.setValue('Valid_123');
    expect(c.form.controls.username.valid).toBeTrue();
  });
  it('requires passwords between eight and 128 characters', () => {
    const c = TestBed.createComponent(RegisterComponent).componentInstance;
    for (const value of ['1234567', 'a'.repeat(129)]) {
      c.form.controls.password.setValue(value);
      expect(c.form.controls.password.valid).toBeFalse();
    }
    c.form.controls.password.setValue('a'.repeat(8));
    expect(c.form.controls.password.valid).toBeTrue();
  });
});
