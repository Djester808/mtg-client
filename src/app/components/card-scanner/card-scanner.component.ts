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
import { PrintingsService } from '../../services/printings.service';
import { CardDto, PrintingDto } from '../../models/game.models';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { buildTypeLine, normalizeCollectorNumber } from '../../utils/card.utils';
import { describeHttpError } from '../../utils/http-error.utils';

type ScanState = 'idle' | 'previewing' | 'result' | 'error';

interface CardRegion {
  x: number;
  y: number;
  w: number;
  h: number; // video-pixel coords
}

// Downsample resolution for edge detection
const DW = 160;
const DH = 90;
const EDGE_THRESH = 35; // Sobel magnitude threshold (0–360)
const PROJ_THRESH = 0.06; // fraction of pixels in a row/col that must be edges
const STABLE_FRAMES = 18; // ~0.6 s at 30 fps before auto-scan
const ALPHA = 0.25; // smoothing factor for bounding box

@Component({
  selector: 'app-card-scanner',
  standalone: true,
  imports: [CommonModule, ManaCostComponent, OracleSymbolsPipe],
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
  selectedPrinting: PrintingDto | null = null;
  printings: PrintingDto[] = [];
  printingsLoading = false;
  private detectedCollectorNumber: string | null = null;
  private detectedSetName: string | null = null;
  /** Exact printing resolved by the API, when it could determine one. */
  private detectedScryfallId: string | null = null;
  errorMessage = '';
  scanHint = '';
  analyzing = false;
  scanCount = 0;
  cardDetected = false; // true while a card outline is being tracked

  private stream: MediaStream | null = null;
  private active = false;

  // Detection loop
  private rafId: number | null = null;
  private detectCanvas: HTMLCanvasElement | null = null;
  private detectCtx: CanvasRenderingContext2D | null = null;
  private smoothed: CardRegion | null = null;
  private stableCount = 0;
  private scanInFlight = false;

  constructor(
    private gameApi: GameApiService,
    private printingsApi: PrintingsService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {}

  // ---- display helpers --------------------------------

  get displayImage(): string | null {
    return this.selectedPrinting?.imageUriNormal ?? this.matchedCard?.imageUriNormal ?? null;
  }

  get displaySetCode(): string | null {
    return this.selectedPrinting?.setCode ?? this.matchedCard?.setCode ?? null;
  }

  get displaySetName(): string | null {
    return this.selectedPrinting?.setName ?? null;
  }

  get typeLine(): string {
    return this.matchedCard ? buildTypeLine(this.matchedCard) : '';
  }

  get oracleText(): string {
    return this.selectedPrinting?.oracleText ?? this.matchedCard?.oracleText ?? '';
  }

  get ptLine(): string | null {
    const c = this.matchedCard;
    if (!c) return null;
    if (c.power != null && c.toughness != null) return `${c.power} / ${c.toughness}`;
    if (c.startingLoyalty != null) return `Loyalty: ${c.startingLoyalty}`;
    return null;
  }

  // ---- camera lifecycle --------------------------------

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
          this.initDetection();
          this.runDetectionLoop();
        });
      });
    } catch {
      this.state = 'error';
      this.errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      this.cdr.markForCheck();
    }
  }

  private initDetection(): void {
    this.detectCanvas = document.createElement('canvas');
    this.detectCanvas.width = DW;
    this.detectCanvas.height = DH;
    this.detectCtx = this.detectCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  private runDetectionLoop(): void {
    if (!this.active || this.state !== 'previewing') return;

    const video = this.videoEl.nativeElement;
    const overlay = this.overlayEl.nativeElement;
    const ctx = overlay.getContext('2d')!;

    overlay.width = video.videoWidth || overlay.clientWidth;
    overlay.height = video.videoHeight || overlay.clientHeight;

    const region = this.detectCard(video);
    this.updateTracking(region, overlay.width, overlay.height);
    this.drawOverlay(ctx, overlay.width, overlay.height);

    this.rafId = requestAnimationFrame(() => this.runDetectionLoop());
  }

  // ---- edge detection ----------------------------------

  private detectCard(video: HTMLVideoElement): CardRegion | null {
    if (!this.detectCtx || video.readyState < 2) return null;

    this.detectCtx.drawImage(video, 0, 0, DW, DH);
    const imgData = this.detectCtx.getImageData(0, 0, DW, DH);
    const gray = this.toGray(imgData.data);
    const edges = this.sobel(gray, DW, DH);

    const xProj = new Float32Array(DW);
    const yProj = new Float32Array(DH);
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        const e = edges[y * DW + x] > EDGE_THRESH ? 1 : 0;
        xProj[x] += e;
        yProj[y] += e;
      }

    for (let i = 0; i < DW; i++) xProj[i] /= DH;
    for (let i = 0; i < DH; i++) yProj[i] /= DW;

    const xBounds = this.findBounds(xProj, DW, PROJ_THRESH);
    const yBounds = this.findBounds(yProj, DH, PROJ_THRESH);
    if (!xBounds || !yBounds) return null;

    const [x0, x1] = xBounds;
    const [y0, y1] = yBounds;
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw < 6 || rh < 6) return null;

    // Accept any card-like region (portrait or landscape)
    const ratio = Math.max(rw, rh) / Math.min(rw, rh);
    if (ratio < 1.1 || ratio > 2.2) return null;

    // Require minimum size relative to frame
    if (rw / DW < 0.1 || rh / DH < 0.1) return null;

    return { x: x0 / DW, y: y0 / DH, w: rw / DW, h: rh / DH };
  }

  private toGray(data: Uint8ClampedArray): Float32Array {
    const gray = new Float32Array(DW * DH);
    for (let i = 0; i < DW * DH; i++)
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return gray;
  }

  private sobel(gray: Float32Array, w: number, h: number): Float32Array {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -gray[i - w - 1] +
          gray[i - w + 1] -
          2 * gray[i - 1] +
          2 * gray[i + 1] -
          gray[i + w - 1] +
          gray[i + w + 1];
        const gy =
          -gray[i - w - 1] -
          2 * gray[i - w] -
          gray[i - w + 1] +
          gray[i + w - 1] +
          2 * gray[i + w] +
          gray[i + w + 1];
        out[i] = Math.sqrt(gx * gx + gy * gy);
      }
    return out;
  }

  private findBounds(proj: Float32Array, len: number, thresh: number): [number, number] | null {
    let lo = -1,
      hi = -1;
    for (let i = 0; i < len; i++) {
      if (proj[i] >= thresh) {
        lo = i;
        break;
      }
    }
    for (let i = len - 1; i >= 0; i--) {
      if (proj[i] >= thresh) {
        hi = i;
        break;
      }
    }
    if (lo < 0 || hi <= lo) return null;
    return [lo, hi];
  }

  // ---- tracking & scan trigger -------------------------

  private updateTracking(region: CardRegion | null, vw: number, vh: number): void {
    if (!region) {
      this.stableCount = Math.max(0, this.stableCount - 2);
      if (this.stableCount === 0) {
        this.smoothed = null;
        if (this.cardDetected) {
          this.cardDetected = false;
          this.scanHint = '';
          this.cdr.markForCheck();
        }
      }
      return;
    }

    // Smooth the bounding box in video-pixel space
    const px = { x: region.x * vw, y: region.y * vh, w: region.w * vw, h: region.h * vh };
    if (!this.smoothed) {
      this.smoothed = px;
    } else {
      this.smoothed = {
        x: this.smoothed.x + ALPHA * (px.x - this.smoothed.x),
        y: this.smoothed.y + ALPHA * (px.y - this.smoothed.y),
        w: this.smoothed.w + ALPHA * (px.w - this.smoothed.w),
        h: this.smoothed.h + ALPHA * (px.h - this.smoothed.h),
      };
    }

    this.stableCount = Math.min(this.stableCount + 1, STABLE_FRAMES + 5);

    if (!this.cardDetected && this.stableCount >= 3) {
      this.cardDetected = true;
      this.cdr.markForCheck();
    }

    if (
      this.cardDetected &&
      this.stableCount >= STABLE_FRAMES &&
      !this.scanInFlight &&
      !this.analyzing
    ) {
      this.stableCount = 0;
      this.triggerScan();
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    if (!this.smoothed) return;

    const { x, y, w: bw, h: bh } = this.smoothed;
    const pad = 10; // padding around detected region
    const rx = Math.max(0, x - pad);
    const ry = Math.max(0, y - pad);
    const rw = Math.min(w - rx, bw + pad * 2);
    const rh = Math.min(h - ry, bh + pad * 2);

    const color = this.analyzing ? 'rgba(200,160,80,1)' : 'rgba(200,160,80,0.85)';
    const glow = this.analyzing ? 'rgba(200,160,80,0.4)' : 'rgba(200,160,80,0.2)';

    // Glow
    ctx.strokeStyle = glow;
    ctx.lineWidth = 8;
    ctx.strokeRect(rx, ry, rw, rh);

    // Main border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (this.analyzing) {
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = (-Date.now() / 40) % 16;
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Corner accents
    const cs = 18;
    ctx.strokeStyle = '#c8a050';
    ctx.lineWidth = 3;
    const corners: [number, number, number, number][] = [
      [rx, ry, cs, 0], // TL
      [rx + rw, ry, -cs, 0], // TR
      [rx, ry + rh, cs, 0], // BL
      [rx + rw, ry + rh, -cs, 0], // BR
    ];
    for (const [cx, cy, dx] of corners) {
      const dy = cy === ry ? cs : -cs;
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy);
      ctx.stroke();
    }
  }

  // ---- scan ------------------------------------------------

  private async triggerScan(): Promise<void> {
    if (!this.active || this.state !== 'previewing' || this.scanInFlight) return;

    this.scanInFlight = true;
    this.scanCount++;
    this.analyzing = true;
    this.scanHint = '';
    this.cdr.markForCheck();

    try {
      const imageBase64 = this.captureFrame();
      const result = await firstValueFrom(this.gameApi.identifyCard(imageBase64));

      if (!this.active || this.state !== 'previewing') return;

      if (result?.cardName) {
        // The API resolves the name against Scryfall and returns the oracleId, so the
        // card can be loaded directly instead of looking it up by name a second time.
        const card = result.oracleId
          ? await firstValueFrom(this.gameApi.loadCard(result.oracleId)).catch(() => null)
          : await firstValueFrom(this.gameApi.getCardByName(result.cardName)).catch(() => null);

        if (!this.active || this.state !== 'previewing') return;

        if (card) {
          this.detectedName = card.name;
          this.matchedCard = card;
          this.selectedPrinting = null;
          this.printings = [];
          this.detectedCollectorNumber = result.collectorNumber ?? null;
          // Null when the API could not pin down the printing. Previously this carried
          // the model's set guess, which was frequently wrong and mis-selected the
          // printing below; no value is better than a wrong one.
          this.detectedSetName = result.setName ?? null;
          this.detectedScryfallId = result.scryfallId ?? null;
          this.state = 'result';
          this.cdr.markForCheck();
          this.loadPrintings(card.oracleId);
          return;
        }
        this.scanHint = `"${result.cardName}" — not found`;
      } else if (result?.error) {
        this.scanHint = result.error;
        console.error('[CardScanner]', result.error);
      } else {
        this.scanHint = 'No card detected';
      }
    } catch (err) {
      // Provider failures now surface as HTTP errors carrying ProblemDetails rather
      // than a 200 with an `error` field, so read the reason off the response.
      this.scanHint = describeHttpError(err, 'Scan failed');
      console.error('[CardScanner] scan failed', err);
    } finally {
      this.analyzing = false;
      this.scanInFlight = false;
      this.stableCount = 0;
      this.cdr.markForCheck();
    }
  }

  scanNow(): void {
    if (!this.cardDetected || this.analyzing || this.scanInFlight) return;
    this.triggerScan();
  }

  private captureFrame(): string {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  // ---- printings ----------------------------------------

  private async loadPrintings(oracleId: string): Promise<void> {
    this.printingsLoading = true;
    this.cdr.markForCheck();
    try {
      const printings = await firstValueFrom(this.printingsApi.get(oracleId));
      this.printings = printings ?? [];

      // Auto-select the best matching printing
      if (this.printings.length > 0) {
        const col = normalizeCollectorNumber(this.detectedCollectorNumber);
        const setLower = this.detectedSetName?.toLowerCase();

        const nameMatch = (p: PrintingDto) => {
          if (!setLower || !p.setName) return false;
          const pn = p.setName.toLowerCase();
          return pn === setLower || pn.includes(setLower) || setLower.includes(pn);
        };

        // Best: the API already resolved the exact printing, so trust it outright.
        const byId = this.detectedScryfallId
          ? this.printings.find((p) => p.scryfallId === this.detectedScryfallId)
          : null;

        // Then: set name and collector number agree
        const exact =
          !byId && col && setLower
            ? this.printings.find(
                (p) => nameMatch(p) && normalizeCollectorNumber(p.collectorNumber) === col,
              )
            : null;

        // Fallback: set name alone
        const bySet = !byId && !exact && setLower ? this.printings.find((p) => nameMatch(p)) : null;

        // Fallback: collector number alone. Normalised on both sides -- the reading off
        // the card is often zero-padded ("0082") where Scryfall stores "82".
        const byNum =
          !byId && !exact && !bySet && col
            ? this.printings.find((p) => normalizeCollectorNumber(p.collectorNumber) === col)
            : null;

        // Use best match, fall back to first printing so something is always selected
        this.selectedPrinting = byId ?? exact ?? bySet ?? byNum ?? this.printings[0];
      }
    } catch {
      this.printings = [];
    } finally {
      this.printingsLoading = false;
      this.cdr.markForCheck();
      // Let Angular render the strip, then scroll the selected thumb into view
      setTimeout(() => {
        this.cdr.detectChanges();
        this.scrollSelectedIntoView();
      }, 50);
    }
  }

  selectPrinting(p: PrintingDto): void {
    this.selectedPrinting = p;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.cdr.detectChanges();
      this.scrollSelectedIntoView();
    }, 50);
  }

  private scrollSelectedIntoView(): void {
    const el = this.host.nativeElement.querySelector(
      '.printing-thumb.selected',
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // ---- confirm / retry / close -------------------------

  confirm(): void {
    if (!this.matchedCard) return;
    const card: CardDto = this.selectedPrinting
      ? {
          ...this.matchedCard,
          setCode: this.selectedPrinting.setCode,
          imageUriNormal: this.selectedPrinting.imageUriNormal ?? this.matchedCard.imageUriNormal,
          imageUriSmall: this.selectedPrinting.imageUriSmall ?? this.matchedCard.imageUriSmall,
          imageUriLarge: this.selectedPrinting.imageUriLarge ?? this.matchedCard.imageUriLarge,
          imageUriNormalBack:
            this.selectedPrinting.imageUriNormalBack ?? this.matchedCard.imageUriNormalBack,
        }
      : this.matchedCard;
    this.cardFound.emit(card);
  }

  retry(): void {
    this.matchedCard = null;
    this.selectedPrinting = null;
    this.printings = [];
    this.detectedCollectorNumber = null;
    this.detectedSetName = null;
    this.detectedScryfallId = null;
    this.detectedName = '';
    this.scanHint = '';
    this.analyzing = false;
    this.scanInFlight = false;
    this.stableCount = 0;
    this.smoothed = null;
    this.cardDetected = false;
    this.state = 'previewing';
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.stream && this.videoEl?.nativeElement) {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play().then(() => {
          this.active = true;
          this.initDetection();
          this.runDetectionLoop();
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
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
}
