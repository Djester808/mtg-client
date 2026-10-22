import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../store/auth/auth.actions';
import { selectAuthLoading, selectAuthError } from '../../store/auth/auth.selectors';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  readonly termsText =
    "# Compleat terms of use\n\nDraft for development. Replace before public release.\n\nLast updated: 2026-09-08\n\n## 1. The service\n\nCompleat is a companion app for Magic: The Gathering. It lets you track a card collection,\nbuild decks, read rules, talk with other players, and play. Compleat is not affiliated with\nWizards of the Coast. Card names, card text, set symbols and mana symbols are the property\nof Wizards of the Coast and are used to identify their products.\n\n## 2. Your account\n\n- You need an account to save data online. You can use the local tools without one.\n- Keep your password to yourself. You are responsible for what happens under your account.\n- One person, one account. Do not use another person's account.\n- You can delete your account at any time from Account settings. We remove your data within\n  30 days. Public posts are anonymised at once.\n\n## 3. Your content\n\n- Decks, posts, comments, profile text and avatars you upload stay yours.\n- By posting them publicly you allow Compleat to show them to other users.\n- Do not upload content you do not have the right to share, or content that is illegal,\n  hateful, harassing, or sexual.\n- We can remove content or suspend accounts that break these rules.\n\n## 4. Card data and prices\n\nCard data comes from public sources and may be out of date or wrong. Prices are estimates.\nDo not rely on them for a purchase or a sale.\n\n## 5. Privacy\n\n- We store your email address, a hash of your password, your profile, and the data you\n  save in the app.\n- We do not sell your data.\n- Your collection's value is never shown to other users.\n- We keep sign-in logs for security for 90 days.\n\n## 6. Changes\n\nWe may change these terms. We will show the new version in the app before it applies.\n\n## 7. Contact\n\nsupport@compleat.app (placeholder).\n";
  form = this.fb.nonNullable.group(
    {
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(32),
          Validators.pattern(/^[a-zA-Z0-9_]+$/),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      confirmPassword: ['', Validators.required],
      acceptedTerms: [false, Validators.requiredTrue],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    },
    {
      validators: (form: AbstractControl) =>
        form.get('password')?.value === form.get('confirmPassword')?.value
          ? null
          : { passwordMismatch: true },
    },
  );

  get passwordStrength(): string {
    const length = this.form.controls.password.value.length;
    return length < 8 ? 'Too short' : length < 10 ? 'Weak' : length < 14 ? 'Okay' : 'Strong';
  }

  loading$ = this.store.select(selectAuthLoading);
  error$ = this.store.select(selectAuthError);

  constructor(
    private fb: FormBuilder,
    private store: Store,
  ) {}

  submit(): void {
    if (this.form.invalid) return;
    const { username, email, password, acceptedTerms } = this.form.getRawValue();
    this.store.dispatch(AuthActions.register({ username, email, password, acceptedTerms }));
  }
}
