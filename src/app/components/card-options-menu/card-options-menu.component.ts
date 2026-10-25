import { NgIf, NgFor } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
@Component({
  selector: 'app-card-options-menu',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `<div
    class="card-options"
    role="menu"
    [style.left.px]="left"
    [style.top.px]="top"
    (pointerdown)="$event.stopPropagation()"
    (click)="$event.stopPropagation()"
    (keydown)="key($event)"
  >
    <button role="menuitem" (click)="$event.stopPropagation(); inspect.emit()">Card details</button>
    <button
      *ngIf="actionLabel"
      role="menuitem"
      [disabled]="actionDisabled"
      (click)="$event.stopPropagation(); action.emit()"
    >
      {{ actionLabel }}
    </button>
    <button
      *ngFor="let item of extraActions"
      role="menuitem"
      [disabled]="actionDisabled"
      (click)="$event.stopPropagation(); extraAction.emit(item.id)"
    >
      {{ item.label }}
    </button>
    <button role="menuitem" (click)="$event.stopPropagation(); dismiss.emit()">Close</button>
  </div>`,
  styleUrls: ['./card-options-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardOptionsMenuComponent implements AfterViewInit, OnDestroy {
  @Input() extraActions: readonly { id: string; label: string }[] = [];
  @Output() extraAction = new EventEmitter<string>();
  @Input() actionLabel = '';
  @Input() actionDisabled = false;
  @Output() action = new EventEmitter<void>();
  @Input() x = 0;
  @Input() y = 0;
  @Output() inspect = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();
  private frame: number | null = null;
  private opener: HTMLElement | null = null;
  constructor(
    private host: ElementRef<HTMLElement>,
    private changes: ChangeDetectorRef,
  ) {}
  @HostListener('window:resize') onResize(): void {
    this.changes.markForCheck();
  }
  get left(): number {
    return Math.max(4, Math.min(this.x, innerWidth - 190));
  }
  get top(): number {
    return Math.max(
      4,
      Math.min(
        this.y,
        innerHeight - ((this.actionLabel ? 148 : 104) + this.extraActions.length * 44),
      ),
    );
  }
  ngAfterViewInit(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.frame = requestAnimationFrame(() => this.buttons()[0]?.focus());
  }
  ngOnDestroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.host.nativeElement.contains(document.activeElement) && this.opener?.isConnected)
      this.opener.focus();
  }
  private buttons(): HTMLButtonElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismiss.emit();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = this.buttons(),
      index = buttons.findIndex((b) => b === document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.dismiss.emit();
  }
}
