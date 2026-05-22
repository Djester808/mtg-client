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

type ScanState = 'idle' | 'previewing' | 'processing' | 'result' | 'error';

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
  @ViewChild('guideEl') guideEl!: ElementRef<HTMLDivElement>;

  state: ScanState = 'idle';
  detectedName = '';
  matchedCard: CardDto | null = null;
  errorMessage = '';
  scanHint = '';

  private stream: MediaStream | null = null;
  private autoScanActive = false;

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
        this.videoEl.nativeElement.play().then(() => this.startScanLoop());
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  private async startScanLoop(): Promise<void> {
    this.autoScanActive = true;
    // Brief warm-up so camera exposure can settle
    await delay(1200);

    while (this.autoScanActive && this.state === 'previewing') {
      await this.capture();

      if (this.state === 'previewing') {
        // No match or transient error — show brief hint and retry
        if (this.detectedName) {
          this.scanHint = `"${this.detectedName}" — not a Magic card`;
        }
        this.cdr.markForCheck();
        await delay(1400);
        if (this.autoScanActive) {
          this.scanHint = '';
          this.detectedName = '';
          this.cdr.markForCheck();
          await delay(200);
        }
      }
      // state === 'result' → loop exits naturally
    }
  }

  private async capture(): Promise<void> {
    this.state = 'processing';
    this.cdr.markForCheck();

    try {
      const video = this.videoEl.nativeElement;
      const canvas = this.canvasEl.nativeElement;
      const guide = this.guideEl.nativeElement;

      const videoRect = video.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      const sx = video.videoWidth / videoRect.width;
      const sy = video.videoHeight / videoRect.height;

      const gx = (guideRect.left - videoRect.left) * sx;
      const gy = (guideRect.top - videoRect.top) * sy;
      const gw = guideRect.width * sx;
      const gh = guideRect.height * sy;

      const nameW = gw * 0.7;
      const nameH = gh * 0.13;

      const scale = 3;
      canvas.width = nameW * scale;
      canvas.height = nameH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(video, gx, gy, nameW, nameH, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/png');

      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(imageData);
      await worker.terminate();

      this.detectedName =
        data.text
          .split('\n')
          .map((l: string) => l.trim())
          .find((l: string) => l.length > 0) ?? '';

      if (!this.detectedName) {
        this.state = 'previewing';
        this.cdr.markForCheck();
        return;
      }

      const results = await firstValueFrom(this.gameApi.searchCards(this.detectedName, 5));
      if (results?.length) {
        this.matchedCard = results[0];
        this.state = 'result';
      } else {
        this.state = 'previewing';
      }
    } catch {
      // Transient OCR failure — stay in previewing so the loop retries
      this.state = 'previewing';
    }

    this.cdr.markForCheck();
  }

  confirm(): void {
    if (this.matchedCard) this.cardFound.emit(this.matchedCard);
  }

  retry(): void {
    this.matchedCard = null;
    this.detectedName = '';
    this.scanHint = '';
    this.state = 'previewing';
    this.cdr.markForCheck();
    this.startScanLoop();
  }

  close(): void {
    this.stopCamera();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private stopCamera(): void {
    this.autoScanActive = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
