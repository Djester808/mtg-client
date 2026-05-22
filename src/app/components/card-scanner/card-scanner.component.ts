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

type ScanState = 'idle' | 'previewing' | 'processing' | 'result' | 'no-match' | 'error';

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

  private stream: MediaStream | null = null;

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
      // Wait for next tick so *ngIf renders the video element
      setTimeout(() => {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play();
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  async capture(): Promise<void> {
    this.state = 'processing';
    this.cdr.markForCheck();

    try {
      const video = this.videoEl.nativeElement;
      const canvas = this.canvasEl.nativeElement;
      const guide = this.guideEl.nativeElement;

      // Map guide box from CSS pixels → video frame pixels
      const videoRect = video.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      const sx = video.videoWidth / videoRect.width;
      const sy = video.videoHeight / videoRect.height;

      const gx = (guideRect.left - videoRect.left) * sx;
      const gy = (guideRect.top - videoRect.top) * sy;
      const gw = guideRect.width * sx;
      const gh = guideRect.height * sy;

      // Crop to the card name strip: left 70%, top 13% of the guide
      const nameW = gw * 0.7;
      const nameH = gh * 0.13;

      // Draw cropped region upscaled 3× for better OCR accuracy
      const scale = 3;
      canvas.width = nameW * scale;
      canvas.height = nameH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(video, gx, gy, nameW, nameH, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/png');

      // Run OCR
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(imageData);
      await worker.terminate();

      // Card name is the first non-empty line
      this.detectedName =
        data.text
          .split('\n')
          .map((l: string) => l.trim())
          .find((l: string) => l.length > 0) ?? '';

      if (!this.detectedName) {
        this.state = 'no-match';
        this.cdr.markForCheck();
        return;
      }

      // Look up on Scryfall
      const results = await firstValueFrom(this.gameApi.searchCards(this.detectedName, 5));
      if (results?.length) {
        this.matchedCard = results[0];
        this.state = 'result';
      } else {
        this.state = 'no-match';
      }
    } catch {
      this.state = 'error';
      this.errorMessage = 'OCR failed. Please try again in better lighting.';
    }

    this.cdr.markForCheck();
  }

  confirm(): void {
    if (this.matchedCard) this.cardFound.emit(this.matchedCard);
  }

  retry(): void {
    this.state = 'previewing';
    this.matchedCard = null;
    this.detectedName = '';
    this.cdr.markForCheck();
  }

  close(): void {
    this.stopCamera();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
