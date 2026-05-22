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
  // Reuse the same worker across attempts — init cost is ~1-2s
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
    await delay(1500); // camera warm-up

    while (this.autoScanActive && this.state === 'previewing') {
      // Only run OCR once the frame is stable (card held still)
      const stable = await this.waitForStableFrame();
      if (!stable || !this.autoScanActive || this.state !== 'previewing') continue;

      await this.capture();

      if (this.state === 'previewing') {
        if (this.detectedName) {
          this.scanHint = `"${this.detectedName}" — not a Magic card`;
          this.cdr.markForCheck();
        }
        await delay(1200);
        if (this.autoScanActive) {
          this.scanHint = '';
          this.detectedName = '';
          this.cdr.markForCheck();
          await delay(200);
        }
      }
    }
  }

  // Sample the name strip at 40×6 px twice, 350 ms apart.
  // Returns true only if the scene is still enough to read.
  private async waitForStableFrame(): Promise<boolean> {
    try {
      const s1 = this.sampleNameStrip();
      await delay(350);
      if (!this.autoScanActive || this.state !== 'previewing') return false;
      const s2 = this.sampleNameStrip();
      if (!s1 || !s2) return true; // can't compare — proceed anyway
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
      tmp.getContext('2d')!.drawImage(video, gx, gy, gw * 0.7, gh * 0.13, 0, 0, 40, 6);
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

  private async capture(): Promise<void> {
    this.state = 'processing';
    this.cdr.markForCheck();

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

      const nameW = gw * 0.7;
      const nameH = gh * 0.13;
      const scale = 3;
      canvas.width = nameW * scale;
      canvas.height = nameH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(video, gx, gy, nameW, nameH, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/png');

      // Reuse worker — only init once
      if (!this.ocrWorker) {
        const { createWorker } = await import('tesseract.js');
        this.ocrWorker = await createWorker('eng');
      }
      const { data } = await this.ocrWorker.recognize(imageData);

      // Require reasonable Tesseract confidence
      if (data.confidence < 55) {
        this.state = 'previewing';
        this.cdr.markForCheck();
        return;
      }

      this.detectedName =
        data.text
          .split('\n')
          .map((l: string) => l.trim())
          .find((l: string) => l.length > 0) ?? '';

      // Validate text looks like an MTG card name (mostly letters, 2-40 chars)
      if (!this.isLikelyCardName(this.detectedName)) {
        this.detectedName = '';
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
      this.state = 'previewing';
    }

    this.cdr.markForCheck();
  }

  // Card names: 2-40 chars, ≥65% letters, at least 2 letter chars, no pure-symbol strings
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
