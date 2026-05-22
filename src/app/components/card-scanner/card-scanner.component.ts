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
    await delay(1500);

    while (this.autoScanActive && this.state === 'previewing') {
      const stable = await this.waitForStableFrame();
      if (!stable || !this.autoScanActive || this.state !== 'previewing') continue;

      // Run OCR silently — never change state to 'processing' so the overlay never flashes
      const name = await this.runOcr();

      if (!name) {
        await delay(600);
        continue;
      }

      if (!this.isLikelyCardName(name)) {
        await delay(600);
        continue;
      }

      this.detectedName = name;
      const results = await firstValueFrom(this.gameApi.searchCards(name, 5)).catch(() => null);

      if (!this.autoScanActive) break;

      if (results?.length) {
        this.matchedCard = results[0];
        this.state = 'result';
        this.cdr.markForCheck();
      } else {
        this.scanHint = `"${name}" — not found`;
        this.cdr.markForCheck();
        await delay(1200);
        if (this.autoScanActive) {
          this.scanHint = '';
          this.detectedName = '';
          this.cdr.markForCheck();
        }
      }
    }
  }

  // Returns the detected name string, or empty string on failure.
  // Never touches component state — completely silent.
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

      // Scan the full card area at 2× for OCR
      const scale = 2;
      canvas.width = gw * scale;
      canvas.height = gh * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, gx, gy, gw, gh, 0, 0, canvas.width, canvas.height);

      // Grayscale + contrast boost so Tesseract works better on blurry/dark frames
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const boosted = Math.max(0, Math.min(255, (gray / 255 - 0.5) * 2.0 * 255 + 128));
        px[i] = px[i + 1] = px[i + 2] = boosted;
      }
      ctx.putImageData(imgData, 0, 0);

      if (!this.ocrWorker) {
        const { createWorker } = await import('tesseract.js');
        this.ocrWorker = await createWorker('eng');
      }
      const { data } = await this.ocrWorker.recognize(canvas.toDataURL('image/png'));

      if (data.confidence < 40) return '';

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

  private async waitForStableFrame(): Promise<boolean> {
    try {
      const s1 = this.sampleNameStrip();
      await delay(350);
      if (!this.autoScanActive || this.state !== 'previewing') return false;
      const s2 = this.sampleNameStrip();
      if (!s1 || !s2) return true;
      return this.pixelSimilarity(s1, s2) >= 0.9;
    } catch {
      return true;
    }
  }

  private sampleNameStrip(): Uint8ClampedArray | null {
    try {
      const video = this.videoEl?.nativeElement;
      const guide = this.guideEl?.nativeElement;
      if (!video || !guide || !video.videoWidth) return null;
      const vr = video.getBoundingClientRect();
      const gr = guide.getBoundingClientRect();
      const sx = video.videoWidth / vr.width;
      const sy = video.videoHeight / vr.height;
      const gx = (gr.left - vr.left) * sx;
      const gy = (gr.top - vr.top) * sy;
      const gw = gr.width * sx;
      const gh = gr.height * sy;
      const tmp = document.createElement('canvas');
      tmp.width = 40;
      tmp.height = 6;
      tmp.getContext('2d')!.drawImage(video, gx, gy, gw, gh * 0.5, 0, 0, 40, 6);
      return tmp.getContext('2d')!.getImageData(0, 0, 40, 6).data;
    } catch {
      return null;
    }
  }

  private pixelSimilarity(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    if (a.length !== b.length) return 0;
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) {
      diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return 1 - diff / ((a.length / 4) * 3 * 255);
  }

  private isLikelyCardName(text: string): boolean {
    if (!text || text.length < 2 || text.length > 40) return false;
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    return letters >= 2 && letters / text.length >= 0.65;
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
