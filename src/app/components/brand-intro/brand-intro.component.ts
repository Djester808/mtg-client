import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';

/** The original Compleat intro, bounded so a decoder or autoplay failure cannot block entry. */
@Component({
  selector: 'app-brand-intro',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './brand-intro.component.html',
  styleUrls: ['./brand-intro.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandIntroComponent implements OnInit, OnDestroy {
  @Output() readonly completed = new EventEmitter<void>();
  private readonly document = inject(DOCUMENT);
  readonly reducedMotion =
    this.document.documentElement.classList.contains('reduce-motion') ||
    (this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  readonly failed = signal(false);
  readonly exiting = signal(false);
  private minimumElapsed = false;
  private passes = 0;
  private finished = false;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    this.timers.push(
      setTimeout(() => {
        this.minimumElapsed = true;
        if (this.reducedMotion || this.failed() || this.passes >= 2) this.finish();
      }, 5000),
      setTimeout(() => this.finish(), 10000),
    );
  }

  loop(video: HTMLVideoElement): void {
    this.passes++;
    if (this.minimumElapsed && this.passes >= 2) {
      this.finish();
      return;
    }
    video.currentTime = 0;
    void video.play().catch(() => this.videoFailed());
  }

  videoFailed(): void {
    this.failed.set(true);
    if (this.minimumElapsed) this.finish();
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.exiting.set(true);
    this.clearTimers();
    this.timers.push(setTimeout(() => this.completed.emit(), this.reducedMotion ? 120 : 320));
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.length = 0;
  }
}
