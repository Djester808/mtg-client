import { Actions, ofType } from '@ngrx/effects';
import { MonoTypeOperatorFunction, repeat, takeUntil } from 'rxjs';
import { AuthActions } from './auth/auth.actions';

/** Retire in-flight requests and queued writes when the signed-in session changes.
 * Resubscribe so the long-lived effect can handle the next account's actions. */
export function restartOnSessionChange<T>(actions: Actions): MonoTypeOperatorFunction<T> {
  return (source) =>
    source.pipe(
      takeUntil(
        actions.pipe(
          ofType(AuthActions.logout, AuthActions.loginSuccess, AuthActions.registerSuccess),
        ),
      ),
      repeat(),
    );
}
