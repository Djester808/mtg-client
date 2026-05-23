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

// Chrome Shape Detection API — not in lib.dom.d.ts yet
interface DetectedText {
  rawValue: string;
  boundingBox: DOMRectReadOnly;
}
interface TextDetectorCtor {
  new (): { detect(src: ImageBitmapSource): Promise<DetectedText[]> };
}
declare const TextDetector: TextDetectorCtor | undefined;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detector: any = null;

  constructor(
    private gameApi: GameApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  async startCamera(): Promise<void> {
    if (typeof TextDetector === 'undefined') {
      this.state = 'error';
      this.errorMessage =
        'Text detection requires Chrome or Edge. Please open this page in Chrome.';
      this.cdr.markForCheck();
      return;
    }
    this.detector = new TextDetector();

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
    this.scanTimer = setTimeout(() => this.doScan(), 1800);
  }

  private async doScan(): Promise<void> {
    if (!this.active || this.state !== 'previewing') return;

    this.scanCount++;
    this.analyzing = true;
    this.scanHint = '';
    this.cdr.markForCheck();

    try {
      const name = await this.readCardName();

      if (!this.active || this.state !== 'previewing') return;

      if (name) {
        const cards = await firstValueFrom(this.gameApi.searchCards(name, 5)).catch(() => null);

        if (!this.active || this.state !== 'previewing') return;

        if (cards?.length) {
          this.detectedName = name;
          this.matchedCard = cards[0];
          this.state = 'result';
          this.cdr.markForCheck();
          return;
        }
        this.scanHint = `"${name}" — not found`;
      } else {
        this.scanHint = 'No card detected — center the card in the box';
      }
    } catch (err) {
      console.error('[CardScanner]', err);
      this.scanHint = '';
    } finally {
      this.analyzing = false;
      this.cdr.markForCheck();
    }

    if (this.active && this.state === 'previewing') {
      this.scheduleScan();
    }
  }

  private async readCardName(): Promise<string | null> {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;

    // Crop to the guide box (35% wide, 5:7 aspect, centered) — name strip is top 15%
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const guideW = vw * 0.35;
    const guideH = guideW * (7 / 5);
    const guideX = (vw - guideW) / 2;
    const guideY = Math.max(0, (vh - guideH) / 2);
    const stripH = guideH * 0.18; // top 18% = name line

    // Scale up 3× so text is big enough for the detector
    const scale = 3;
    canvas.width = Math.round(guideW * scale);
    canvas.height = Math.round(stripH * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, guideX, guideY, guideW, stripH, 0, 0, canvas.width, canvas.height);

    const bitmap = await createImageBitmap(canvas);
    const results: DetectedText[] = await this.detector.detect(bitmap);
    bitmap.close();

    // Pick the best candidate — longest text that passes the card-name filter
    const candidate = results
      .map((r) => r.rawValue.trim())
      .filter((t) => this.isLikelyCardName(t))
      .sort((a, b) => b.length - a.length)[0];

    return candidate ?? null;
  }

  private isLikelyCardName(text: string): boolean {
    if (!text || text.length < 2 || text.length > 50) return false;
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    return letters >= 2 && letters / text.length >= 0.65;
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
