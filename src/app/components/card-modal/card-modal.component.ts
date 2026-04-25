import {
  Component, Input, Output, EventEmitter, HostListener,
  ChangeDetectionStrategy, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardDto, CardType, PrintingDto } from '../../models/game.models';
import { buildTypeLine } from '../../utils/card.utils';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';

@Component({
  selector: 'app-card-modal',
  standalone: true,
  imports: [CommonModule, ManaCostComponent, OracleSymbolsPipe],
  templateUrl: './card-modal.component.html',
  styleUrls: ['./card-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class CardModalComponent implements OnInit {

  @Input() card: CardDto | null = null;
  @Input() printings: PrintingDto[] = [];

  /** Two-way: which printing is being viewed. */
  @Input() viewedScryfallId: string | null = null;
  @Output() viewedScryfallIdChange = new EventEmitter<string | null>();

  /** Two-way: whether the back face is showing. */
  @Input() flipped = false;
  @Output() flippedChange = new EventEmitter<boolean>();

  @Output() closed = new EventEmitter<void>();

  /** Optional: scryfallId of the card entry the user owns (shows gold "Owned" banner). */
  @Input() primaryScryfallId: string | null = null;
  /** Optional: scryfallIds of other printings the user also owns (shows blue "Owned" banner). */
  @Input() alsoOwnedIds: string[] = [];

  // Position / size — managed internally, centred on first render
  modalX = 0; modalY = 0;
  modalWidth = 860; modalHeight = 600;
  isDragging = false; isResizing = false;
  private dragOffsetX = 0; private dragOffsetY = 0;
  private resizeStartX = 0; private resizeStartY = 0;
  private resizeStartW = 0; private resizeStartH = 0;

  readonly CAROUSEL_PAGE = 5;
  carouselStart = 0;

  ngOnInit(): void {
    this.modalWidth  = Math.min(900, Math.floor(window.innerWidth  * 0.92));
    this.modalHeight = Math.max(560, Math.min(680, Math.floor(window.innerHeight * 0.85)));
    this.modalX = Math.max(0, (window.innerWidth  - this.modalWidth)  / 2);
    this.modalY = Math.max(0, (window.innerHeight - this.modalHeight) / 2);
  }

  // ---- Carousel -------------------------------------------------------

  get carouselSlice(): PrintingDto[] {
    return this.printings.slice(this.carouselStart, this.carouselStart + this.CAROUSEL_PAGE);
  }
  get carouselCanPrev(): boolean { return this.carouselStart > 0; }
  get carouselCanNext(): boolean {
    return this.carouselStart + this.CAROUSEL_PAGE < this.printings.length;
  }
  carouselPrev(): void { this.carouselStart = Math.max(0, this.carouselStart - this.CAROUSEL_PAGE); }
  carouselNext(): void {
    this.carouselStart = Math.min(
      Math.max(0, this.printings.length - this.CAROUSEL_PAGE),
      this.carouselStart + this.CAROUSEL_PAGE,
    );
  }

  // ---- Derived card data ----------------------------------------------

  get currentPrinting(): PrintingDto | undefined {
    return this.printings.find(p => p.scryfallId === this.viewedScryfallId);
  }

  /** Base card merged with printing-specific overrides. */
  get effectiveCard(): CardDto | null {
    if (!this.card) return null;
    const p = this.currentPrinting;
    if (!p) return this.card;
    return {
      ...this.card,
      oracleText: p.oracleText ?? this.card.oracleText,
      flavorText: p.flavorText ?? null,
      artist:     p.artist     ?? this.card.artist,
      manaCost:   p.manaCost   ?? this.card.manaCost,
      setCode:    p.setCode    ?? this.card.setCode,
    };
  }

  get hasBack(): boolean {
    const p = this.currentPrinting;
    return !!(p?.imageUriNormalBack ?? this.card?.imageUriNormalBack);
  }

  get modalImage(): string | null {
    const p = this.currentPrinting;
    const front = p?.imageUriNormal ?? this.card?.imageUriNormal ?? null;
    const back  = p?.imageUriNormalBack ?? this.card?.imageUriNormalBack ?? null;
    return this.flipped && back ? back : front;
  }

  /** Active face name — handles DFC "Front // Back" format. */
  get displayName(): string {
    const name = this.card?.name ?? '';
    if (!this.hasBack) return name;
    const parts = name.split(' // ');
    return this.flipped && parts.length > 1 ? parts[1] : parts[0];
  }

  /** Active face oracle text — handles DFC split. */
  get displayOracleText(): string | null {
    const text = this.effectiveCard?.oracleText ?? null;
    if (!text || !this.hasBack) return text;
    const parts = text.split('\n//\n');
    return this.flipped && parts.length > 1 ? parts[1] : parts[0];
  }

  get typeLine(): string {
    const c = this.effectiveCard;
    return c ? buildTypeLine(c) : '';
  }

  get isLand(): boolean {
    return this.effectiveCard?.cardTypes.includes(CardType.Land) ?? false;
  }

  readonly FORMAT_ORDER = [
    { key: 'standard',      label: 'Standard'   },
    { key: 'pioneer',       label: 'Pioneer'     },
    { key: 'modern',        label: 'Modern'      },
    { key: 'legacy',        label: 'Legacy'      },
    { key: 'vintage',       label: 'Vintage'     },
    { key: 'commander',     label: 'Commander'   },
    { key: 'oathbreaker',   label: 'Oathbreaker' },
    { key: 'pauper',        label: 'Pauper'      },
    { key: 'explorer',      label: 'Explorer'    },
    { key: 'historic',      label: 'Historic'    },
    { key: 'alchemy',       label: 'Alchemy'     },
    { key: 'brawl',         label: 'Brawl'       },
  ];

  get hasLegalities(): boolean {
    const leg = this.card?.legalities;
    return !!leg && Object.keys(leg).length > 0;
  }

  get legalFormats(): { label: string; status: string }[] {
    const leg = this.card?.legalities ?? {};
    return this.FORMAT_ORDER
      .map(f => ({ label: f.label, status: leg[f.key] ?? 'not_legal' }))
      .filter(f => f.status !== 'not_legal');
  }

  get illegalFormats(): { label: string; status: string }[] {
    const leg = this.card?.legalities ?? {};
    return this.FORMAT_ORDER
      .map(f => ({ label: f.label, status: leg[f.key] ?? 'not_legal' }))
      .filter(f => f.status === 'not_legal');
  }

  // ---- User actions ---------------------------------------------------

  close(): void { this.closed.emit(); }

  selectPrinting(p: PrintingDto): void {
    this.viewedScryfallId = p.scryfallId;
    this.viewedScryfallIdChange.emit(p.scryfallId);
    this.flipped = false;
    this.flippedChange.emit(false);
  }

  flipToPrintingBack(p: PrintingDto, e: MouseEvent): void {
    e.stopPropagation();
    if (this.viewedScryfallId === p.scryfallId) {
      this.flipped = !this.flipped;
      this.flippedChange.emit(this.flipped);
    } else {
      this.viewedScryfallId = p.scryfallId;
      this.viewedScryfallIdChange.emit(p.scryfallId);
      this.flipped = true;
      this.flippedChange.emit(true);
    }
  }

  toggleFlip(): void {
    this.flipped = !this.flipped;
    this.flippedChange.emit(this.flipped);
  }

  // ---- Drag / resize --------------------------------------------------

  onDragStart(e: MouseEvent): void {
    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.modalX;
    this.dragOffsetY = e.clientY - this.modalY;
    e.preventDefault();
  }

  onResizeStart(e: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = e.clientX; this.resizeStartY = e.clientY;
    this.resizeStartW = this.modalWidth; this.resizeStartH = this.modalHeight;
    e.preventDefault(); e.stopPropagation();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (this.isDragging) {
      this.modalX = Math.max(0, e.clientX - this.dragOffsetX);
      this.modalY = Math.max(0, e.clientY - this.dragOffsetY);
    }
    if (this.isResizing) {
      const d = ((e.clientX - this.resizeStartX) + (e.clientY - this.resizeStartY)) / 2;
      this.modalWidth  = Math.max(680, Math.min(Math.floor(window.innerWidth  * 0.96), this.resizeStartW + d));
      this.modalHeight = Math.max(520, Math.min(Math.floor(window.innerHeight * 0.94), this.resizeStartH + d));
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void { this.isDragging = false; this.isResizing = false; }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }
}
