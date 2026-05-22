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
  @ViewChild('guideEl') guideEl!: ElementRef<HTMLDivElement>;

  state: ScanState = 'idle';
  detectedName = '';
  matchedCard: CardDto | null = null;
  errorMessage = '';
  scanHint = '';

  private stream: MediaStream | null = null;
  private autoScanActive = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ocrWorker: any = null;

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
          this.tryEnableContinuousFocus();
          this.startScanLoop();
        });
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  private tryEnableContinuousFocus(): void {
    try {
      const track = this.stream?.getVideoTracks()[0];
      if (!track) return;
      const caps = track.getCapabilities() as Record<string, unknown>;
      if ('focusMode' in caps) {
        track
          .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
          .catch(() => {});
      }
    } catch {
      /* focus constraints not supported on this device */
    }
  }

  private async startScanLoop(): Promise<void> {
    this.autoScanActive = true;
    await delay(1200);

    while (this.autoScanActive && this.state === 'previewing') {
      const name = await this.runOcr();

      if (!this.autoScanActive || this.state !== 'previewing') break;

      if (name) {
        this.detectedName = name;
        const results = await firstValueFrom(this.gameApi.searchCards(name, 5)).catch(() => null);

        if (!this.autoScanActive || this.state !== 'previewing') break;

        if (results?.length) {
          this.matchedCard = results[0];
          this.state = 'result';
          this.cdr.markForCheck();
          break;
        } else {
          this.scanHint = `"${name}" — not found, retrying…`;
          this.cdr.markForCheck();
          await delay(1000);
          this.scanHint = '';
          this.detectedName = '';
          this.cdr.markForCheck();
        }
      } else {
        // Nothing readable yet — short pause then try again
        await delay(500);
      }
    }
  }

  private async runOcr(): Promise<string> {
    try {
      const video = this.videoEl.nativeElement;
      const canvas = this.canvasEl.nativeElement;
      const guide = this.guideEl.nativeElement;

      const vr = video.getBoundingClientRect();
      const gr = guide.getBoundingClientRect();
      const sx = video.videoWidth / vr.width;
      const sy = video.videoHeight / vr.height;
      const gx = (gr.left - vr.left) * sx;
      const gy = (gr.top - vr.top) * sy;
      const gw = gr.width * sx;
      const gh = gr.height * sy;

      // Scan only the top 14% of the card (name strip) — artwork below
      // that is pure noise to Tesseract. Scale up 4× so characters are large.
      const nameH = gh * 0.14;
      const scale = 4;
      canvas.width = gw * scale;
      canvas.height = nameH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, gx, gy, gw, nameH, 0, 0, canvas.width, canvas.height);

      // Grayscale + adaptive threshold at the image mean so text becomes
      // pure black/white regardless of card frame colour or lighting.
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imgData.data;
      const grays: number[] = [];
      for (let i = 0; i < px.length; i += 4) {
        grays.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
      }
      const mean = grays.reduce((a, b) => a + b, 0) / grays.length;
      for (let i = 0; i < px.length; i += 4) {
        const v = grays[i / 4] > mean ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);

      if (!this.ocrWorker) {
        const { createWorker } = await import('tesseract.js');
        this.ocrWorker = await createWorker('eng');
      }
      const { data } = await this.ocrWorker.recognize(canvas.toDataURL('image/png'));

      if (data.confidence < 25) return '';

      // From all OCR lines, pick the first one that looks like a card name
      return (
        data.text
          .split('\n')
          .map((l: string) => l.trim())
          .find((l: string) => this.isLikelyCardName(l)) ?? ''
      );
    } catch {
      return '';
    }
  }

  private isLikelyCardName(text: string): boolean {
    if (!text || text.length < 2 || text.length > 40) return false;
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    // Must be mostly letters; reject pure-symbol / pure-digit noise
    return letters >= 2 && letters / text.length >= 0.7;
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
    if (this.ocrWorker) {
      this.ocrWorker.terminate().catch(() => {});
      this.ocrWorker = null;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
