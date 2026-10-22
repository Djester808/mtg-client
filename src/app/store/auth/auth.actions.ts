import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    Login: props<{ username: string; password: string; rememberMe?: boolean }>(),
    'Login Success': props<{ token: string; username: string; rememberMe?: boolean }>(),
    'Login Failure': props<{ error: string }>(),

    Register: props<{
      username: string;
      email: string;
      password: string;
      acceptedTerms?: boolean;
    }>(),
    'Register Success': props<{ token: string; username: string }>(),
    'Register Failure': props<{ error: string }>(),

    Logout: emptyProps(),

    'Restore Session': emptyProps(),
  },
});
