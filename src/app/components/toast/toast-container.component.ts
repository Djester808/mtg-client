import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { animate, style, transition, trigger } from '@angular/animations';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack">
      <div
        *ngFor="let t of (toastService.toasts$ | async); trackBy: trackById"
        class="toast"
        [ngClass]="t.kind"
        [@toastAnim]
        (click)="toastService.dismiss(t.id)">
        <span class="toast-icon">{{ t.icon }}</span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./toast-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('toastAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(32px)' }),
        animate('180ms cubic-bezier(0.34,1.2,0.64,1)',
          style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('150ms ease',
          style({ opacity: 0, transform: 'translateX(32px)' })),
      ]),
    ]),
  ],
})
export class ToastContainerComponent {
  constructor(public toastService: ToastService) {}
  trackById(_: number, t: Toast): number { return t.id; }
}
