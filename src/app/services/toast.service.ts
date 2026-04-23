import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'info' | 'success' | 'warn' | 'damage' | 'death' | 'cast';

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
    setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  dismiss(id: number): void {
    this._toasts$.next(this._toasts$.value.filter(t => t.id !== id));
  }

  // ---- Convenience helpers --------------------------------
  cast(cardName: string, playerName: string): void {
    this.show(`${playerName} cast ${cardName}`, 'cast', 2500);
  }

  damage(target: string, amount: number): void {
    this.show(`${target} takes ${amount} damage`, 'damage', 2500);
  }

  died(cardName: string): void {
    this.show(`${cardName} died`, 'death', 3000);
  }

  gameOver(winner: string): void {
    this.show(`${winner} wins!`, 'success', 0); // persistent
  }

  private iconFor(kind: ToastKind): string {
    return {
      info:    '◆',
      success: '✦',
      warn:    '⚠',
      damage:  '⚔',
      death:   '☠',
      cast:    '✧',
    }[kind];
  }
}
