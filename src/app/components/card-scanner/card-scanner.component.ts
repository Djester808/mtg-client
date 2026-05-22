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
interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  @ViewChild('overlayEl') overlayEl!: ElementRef<HTMLCanvasElement>;

  state: ScanState = 'idle';
  detectedName = '';
  matchedCard: CardDto | null = null;
  errorMessage = '';
  scanHint = '';

  private stream: MediaStream | null = null;
  private active = false;
  private rafId = 0;
  private stableFrames = 0;
  private scanPending = false;
  // Reusable low-res canvas for edge detection (never touches the DOM)
  private readonly detectCanvas = document.createElement('canvas');
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
          this.tryFocus();
          this.startLoop();
        });
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  // ── Detection + drawing loop (runs every rAF frame) ────────────────────────

  private startLoop(): void {
    this.active = true;
    const tick = () => {
      if (!this.active) return;
      this.tickFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private tickFrame(): void {
    const video = this.videoEl?.nativeElement;
    const overlay = this.overlayEl?.nativeElement;
    if (!video?.videoWidth || !overlay || this.state !== 'previewing') return;

    // Keep overlay canvas in sync with displayed video size
    if (overlay.width !== video.clientWidth) overlay.width = video.clientWidth;
    if (overlay.height !== video.clientHeight) overlay.height = video.clientHeight;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const rect = this.findCardRect(video);

    if (rect) {
      this.stableFrames++;
      this.drawOutline(ctx, rect);
      // After ~10 stable frames (~160 ms) fire OCR on the detected region
      if (this.stableFrames >= 10 && !this.scanPending) {
        this.scanPending = true;
        this.ocrRect(rect, video);
      }
    } else {
      this.stableFrames = Math.max(0, this.stableFrames - 3);
    }
  }

  // ── Card detection via edge-projection ────────────────────────────────────

  private findCardRect(video: HTMLVideoElement): CardRect | null {
    const W = 160,
      H = 90;
    this.detectCanvas.width = W;
    this.detectCanvas.height = H;
    const dc = this.detectCanvas.getContext('2d')!;
    dc.drawImage(video, 0, 0, W, H);
    const px = dc.getImageData(0, 0, W, H).data;

    const luma = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    };

    // Horizontal and vertical edge maps (Sobel-like)
    const ex = new Float32Array(W * H); // responds to vertical lines
    const ey = new Float32Array(W * H); // responds to horizontal lines
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        ex[y * W + x] = Math.abs(luma(x + 1, y) - luma(x - 1, y));
        ey[y * W + x] = Math.abs(luma(x, y + 1) - luma(x, y - 1));
      }
    }

    // Project onto each axis (vertical edges → X-axis, horizontal → Y-axis)
    const xProj = new Float32Array(W);
    const yProj = new Float32Array(H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        xProj[x] += ex[y * W + x];
        yProj[y] += ey[y * W + x];
      }

    const xp = this.peakPair(xProj, Math.floor(W * 0.12));
    const yp = this.peakPair(yProj, Math.floor(H * 0.12));
    if (!xp || !yp) return null;

    const bw = xp[1] - xp[0];
    const bh = yp[1] - yp[0];
    const aspect = bh / bw;
    // Accept any aspect from roughly square to 1:2 (handles perspective tilt)
    if (bw < W * 0.12 || bh < H * 0.12 || aspect < 0.7 || aspect > 2.5) return null;

    // Verify actual edges exist along the four detected boundary lines
    const avgBoundaryEdge =
      (this.projSlice(ex, 'col', xp[0], yp[0], yp[1], W) +
        this.projSlice(ex, 'col', xp[1], yp[0], yp[1], W) +
        this.projSlice(ey, 'row', yp[0], xp[0], xp[1], W) +
        this.projSlice(ey, 'row', yp[1], xp[0], xp[1], W)) /
      4;
    if (avgBoundaryEdge < 12) return null;

    const sx = video.clientWidth / W;
    const sy = video.clientHeight / H;
    return { x: xp[0] * sx, y: yp[0] * sy, w: bw * sx, h: bh * sy };
  }

  // Find the two strongest non-adjacent peaks in a 1-D projection array
  private peakPair(proj: Float32Array, minDist: number): [number, number] | null {
    const N = proj.length;
    let p1 = 0,
      v1 = 0;
    for (let i = 1; i < N - 1; i++) {
      if (proj[i] > v1 && proj[i] >= proj[i - 1] && proj[i] >= proj[i + 1]) {
        v1 = proj[i];
        p1 = i;
      }
    }
    if (v1 < 200) return null; // not enough signal

    let p2 = -1,
      v2 = 0;
    for (let i = 1; i < N - 1; i++) {
      if (Math.abs(i - p1) < minDist) continue;
      if (proj[i] > v2 && proj[i] >= proj[i - 1] && proj[i] >= proj[i + 1]) {
        v2 = proj[i];
        p2 = i;
      }
    }
    if (p2 < 0 || v2 < 100) return null;

    return p1 < p2 ? [p1, p2] : [p2, p1];
  }

  // Average edge value along one row or column of an edge map
  private projSlice(
    map: Float32Array,
    axis: 'row' | 'col',
    pos: number,
    from: number,
    to: number,
    W: number,
  ): number {
    let sum = 0;
    const n = to - from;
    if (n <= 0) return 0;
    for (let i = from; i < to; i++) {
      sum += axis === 'row' ? map[pos * W + i] : map[i * W + pos];
    }
    return sum / n;
  }

  // ── Overlay drawing ───────────────────────────────────────────────────────

  private drawOutline(ctx: CanvasRenderingContext2D, r: CardRect): void {
    const cs = Math.min(r.w, r.h) * 0.1;
    const t = Date.now();

    ctx.save();
    // Subtle marching dashes
    ctx.strokeStyle = 'rgba(201,168,76,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -(t / 40) % 16;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // Bold corner brackets
    ctx.setLineDash([]);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + cs);
    ctx.lineTo(r.x, r.y);
    ctx.lineTo(r.x + cs, r.y);
    ctx.moveTo(r.x + r.w - cs, r.y);
    ctx.lineTo(r.x + r.w, r.y);
    ctx.lineTo(r.x + r.w, r.y + cs);
    ctx.moveTo(r.x, r.y + r.h - cs);
    ctx.lineTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + cs, r.y + r.h);
    ctx.moveTo(r.x + r.w - cs, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h - cs);
    ctx.stroke();
    ctx.restore();
  }

  // ── OCR on detected rectangle ─────────────────────────────────────────────

  private async ocrRect(rect: CardRect, video: HTMLVideoElement): Promise<void> {
    try {
      const canvas = this.canvasEl.nativeElement;
      const vr = video.getBoundingClientRect();
      const sx = video.videoWidth / vr.width;
      const sy = video.videoHeight / vr.height;

      const fx = rect.x * sx,
        fy = rect.y * sy;
      const fw = rect.w * sx,
        fh = rect.h * sy;
      const nameH = fh * 0.14;
      const scale = 4;

      canvas.width = fw * scale;
      canvas.height = nameH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, fx, fy, fw, nameH, 0, 0, canvas.width, canvas.height);

      // Adaptive mean-threshold → clean black/white for Tesseract
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = id.data;
      const grays = new Float32Array(d.length / 4);
      for (let i = 0; i < d.length; i += 4)
        grays[i >> 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const mean = grays.reduce((a, b) => a + b, 0) / grays.length;
      for (let i = 0; i < d.length; i += 4) {
        const v = grays[i >> 2] > mean ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(id, 0, 0);

      if (!this.ocrWorker) {
        const { createWorker } = await import('tesseract.js');
        this.ocrWorker = await createWorker('eng');
      }
      const { data } = await this.ocrWorker.recognize(canvas.toDataURL('image/png'));
      if (data.confidence < 25 || !this.active) {
        this.resetScan();
        return;
      }

      const name =
        data.text
          .split('\n')
          .map((l: string) => l.trim())
          .find((l: string) => this.isLikelyCardName(l)) ?? '';

      if (!name || !this.active) {
        this.resetScan();
        return;
      }

      const results = await firstValueFrom(this.gameApi.searchCards(name, 5)).catch(() => null);

      if (!this.active) return;

      if (results?.length) {
        this.detectedName = name;
        this.matchedCard = results[0];
        this.state = 'result';
        this.cdr.markForCheck();
      } else {
        this.scanHint = `"${name}" — not found`;
        this.cdr.markForCheck();
        await delay(1200);
        if (this.active) {
          this.scanHint = '';
          this.cdr.markForCheck();
        }
        this.resetScan();
      }
    } catch {
      this.resetScan();
    }
  }

  private resetScan(): void {
    this.stableFrames = 0;
    this.scanPending = false;
  }

  private isLikelyCardName(text: string): boolean {
    if (!text || text.length < 2 || text.length > 40) return false;
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    return letters >= 2 && letters / text.length >= 0.7;
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
    this.stableFrames = 0;
    this.scanPending = false;
    this.state = 'previewing';
    this.cdr.markForCheck();
    // *ngIf recreates the video element — reattach stream then restart loop
    setTimeout(() => {
      if (this.stream && this.videoEl?.nativeElement) {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play().then(() => this.startLoop());
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
    cancelAnimationFrame(this.rafId);
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
