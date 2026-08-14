import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  icon: string;
  durationMs: number;
}

let nextId = 1;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts$ = new BehaviorSubject<Toast[]>([]);
  toasts$ = this._toasts$.asObservable();

  show(message: string, kind: ToastKind = 'info', durationMs = 3000): void {
    const icon = this.iconFor(kind);
    const toast: Toast = { id: nextId++, kind, message, icon, durationMs };
    this._toasts$.next([...this._toasts$.value, toast]);
    // durationMs <= 0 means persistent — dismissed only by click.
    if (durationMs > 0) setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  dismiss(id: number): void {
    this._toasts$.next(this._toasts$.value.filter((t) => t.id !== id));
  }

  private iconFor(kind: ToastKind): string {
    return {
      info: '◆',
      success: '✦',
      warn: '⚠',
      error: '✖',
    }[kind];
  }
}
