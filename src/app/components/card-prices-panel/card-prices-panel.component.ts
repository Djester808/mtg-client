import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CardDto, CardPricesDto, PricePointDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { cardhoarderUrl, cardmarketUrl, tcgplayerUrl } from '../../utils/market-links';
import { PriceHistoryChartComponent } from '../price-history-chart/price-history-chart.component';
import { SetIconComponent } from '../set-icon/set-icon.component';

/**
 * The card modal's Prices tab: today's prices for the viewed printing (each linked to
 * the marketplace it came from), the daily history chart, and every priced printing
 * cheapest-first.
 *
 * Split out of CardModalComponent, which had grown past its style budget and was
 * carrying four tabs' worth of state. History is fetched here, so it is requested only
 * once this panel is actually rendered — a reader who never opens Prices never pays.
 */
@Component({
  selector: 'app-card-prices-panel',
  standalone: true,
  imports: [CommonModule, PriceHistoryChartComponent, SetIconComponent],
  templateUrl: './card-prices-panel.component.html',
  styleUrls: ['./card-prices-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardPricesPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() card: CardDto | null = null;
  @Input() printings: PrintingDto[] = [];
  @Input() viewedScryfallId: string | null = null;

  /** Selecting a printing here drives the modal's viewed printing. */
  @Output() printingSelect = new EventEmitter<PrintingDto>();

  readonly PRICE_RANGES = [
    { days: 7, label: '7D' },
    { days: 30, label: '30D' },
    { days: 90, label: '90D' },
    { days: 365, label: '1Y' },
    { days: 1825, label: 'All' },
  ];

  rangeDays = 90;
  history: PricePointDto[] = [];
  historyLoading = false;
  view: 'chart' | 'table' = 'chart';

  /** Keyed by `${scryfallId}:${days}` — returning to a loaded range is instant. */
  private cache = new Map<string, PricePointDto[]>();
  private sub: Subscription | null = null;

  constructor(
    private gameApi: GameApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadHistory();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // History is per printing, so switching printings invalidates what is on screen.
    if (changes['viewedScryfallId'] && !changes['viewedScryfallId'].firstChange) {
      this.loadHistory();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ---- Current prices --------------------------------------------------

  private get currentPrinting(): PrintingDto | undefined {
    return this.printings.find((p) => p.scryfallId === this.viewedScryfallId);
  }

  /** Prices for the printing being viewed; falls back to the base card's printing. */
  get currentPrices(): CardPricesDto | null {
    return this.currentPrinting?.prices ?? this.card?.prices ?? null;
  }

  get viewedSetLabel(): string | null {
    const p = this.currentPrinting;
    if (!p) return null;
    return p.collectorNumber
      ? `${p.setCode.toUpperCase()} #${p.collectorNumber}`
      : p.setCode.toUpperCase();
  }

  // Each price links to the marketplace it came from: USD → TCGplayer, EUR →
  // Cardmarket, tix → Cardhoarder.
  get tcgplayerLink(): string {
    return tcgplayerUrl(this.currentPrices, this.card?.name ?? '');
  }
  get cardmarketLink(): string {
    return cardmarketUrl(this.card?.name ?? '');
  }
  get cardhoarderLink(): string {
    return cardhoarderUrl(this.currentPrices, this.card?.name ?? '');
  }
  /** Per-row link in the all-printings list — that printing's own TCGplayer page. */
  printingMarketLink(p: PrintingDto): string {
    return tcgplayerUrl(p.prices, this.card?.name ?? '');
  }

  // ---- All printings ---------------------------------------------------

  /** Sort key: cheapest available finish, non-foil preferred; unpriced sorts last. */
  private static effectiveUsd(p: PrintingDto): number {
    return p.prices?.usd ?? p.prices?.usdFoil ?? p.prices?.usdEtched ?? Number.POSITIVE_INFINITY;
  }

  private pricedMemo: { printings: PrintingDto[]; value: PrintingDto[] } | null = null;

  /** Printings that carry any price data, cheapest first. */
  get pricedPrintings(): PrintingDto[] {
    const m = this.pricedMemo;
    if (m && m.printings === this.printings) return m.value;
    const value = this.printings
      .filter((p) => p.prices)
      .sort(
        (a, b) =>
          CardPricesPanelComponent.effectiveUsd(a) - CardPricesPanelComponent.effectiveUsd(b),
      );
    this.pricedMemo = { printings: this.printings, value };
    return value;
  }

  // ---- History ---------------------------------------------------------

  selectRange(days: number): void {
    if (days === this.rangeDays) return;
    this.rangeDays = days;
    this.loadHistory();
  }

  toggleView(): void {
    this.view = this.view === 'chart' ? 'table' : 'chart';
  }

  select(p: PrintingDto): void {
    this.printingSelect.emit(p);
  }

  private loadHistory(): void {
    const scryfallId = this.viewedScryfallId ?? this.printings[0]?.scryfallId ?? null;
    if (!scryfallId) {
      this.history = [];
      return;
    }

    const key = `${scryfallId}:${this.rangeDays}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.history = cached;
      this.historyLoading = false;
      return;
    }

    // Supersede any in-flight request; the last range clicked is the one that wins.
    this.sub?.unsubscribe();
    this.historyLoading = true;
    this.sub = this.gameApi.getPriceHistory(scryfallId, this.rangeDays).subscribe({
      next: (points) => {
        this.cache.set(key, points);
        this.history = points;
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.history = [];
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
