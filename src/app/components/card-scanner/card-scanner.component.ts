import {
  Component,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { GameApiService } from '../../services/game-api.service';
import { CardDto } from '../../models/game.models';

type ScanState = 'idle' | 'previewing' | 'result' | 'error';

@Component({
  selector: 'app-card-scanner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-scanner.component.html',
  styleUrls: ['./card-scanner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardScannerComponent implements OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() cardFound = new EventEmitter<CardDto>();

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;

  state: ScanState = 'idle';
  detectedName = '';
  matchedCard: CardDto | null = null;
  errorMessage = '';
  scanHint = '';
  analyzing = false;
  scanCount = 0;

  private stream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(
    private gameApi: GameApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  async startCamera(): Promise<void> {
    this.state = 'previewing';
    this.cdr.markForCheck();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setTimeout(() => {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play().then(() => {
          this.tryFocus();
          this.active = true;
          this.scheduleScan();
        });
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  private scheduleScan(): void {
    this.scanTimer = setTimeout(() => this.doScan(), 2500);
  }

  private async doScan(): Promise<void> {
    if (!this.active || this.state !== 'previewing') return;

    this.scanCount++;
    this.analyzing = true;
    this.scanHint = '';
    this.cdr.markForCheck();

    try {
      const imageBase64 = this.captureFrame();
      const result = await firstValueFrom(this.gameApi.identifyCard(imageBase64));

      if (!this.active || this.state !== 'previewing') return;

      if (result?.cardName) {
        const cards = await firstValueFrom(this.gameApi.searchCards(result.cardName, 5)).catch(
          () => null,
        );

        if (!this.active || this.state !== 'previewing') return;

        if (cards?.length) {
          this.detectedName = result.cardName;
          this.matchedCard = cards[0];
          this.state = 'result';
          this.cdr.markForCheck();
          return;
        }
        this.scanHint = `"${result.cardName}" — not in database`;
      } else {
        this.scanHint = 'No card detected';
      }
    } catch (err) {
      this.scanHint = 'Error — check console';
      console.error('[CardScanner] scan failed', err);
    } finally {
      this.analyzing = false;
      this.cdr.markForCheck();
    }

    if (this.active && this.state === 'previewing') {
      this.scheduleScan();
    }
  }

  private captureFrame(): string {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    // Send the full frame — Sonnet finds the card wherever it is in the image
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  private tryFocus(): void {
    try {
      const track = this.stream?.getVideoTracks()[0];
      if (!track) return;
      const caps = track.getCapabilities() as Record<string, unknown>;
      if ('focusMode' in caps)
        track
          .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
          .catch(() => {});
    } catch {
      /* not supported */
    }
  }

  confirm(): void {
    if (this.matchedCard) this.cardFound.emit(this.matchedCard);
  }

  retry(): void {
    this.matchedCard = null;
    this.detectedName = '';
    this.scanHint = '';
    this.analyzing = false;
    this.state = 'previewing';
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.stream && this.videoEl?.nativeElement) {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play().then(() => {
          this.active = true;
          this.scheduleScan();
        });
      }
    });
  }

  close(): void {
    this.stopCamera();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private stopCamera(): void {
    this.active = false;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
