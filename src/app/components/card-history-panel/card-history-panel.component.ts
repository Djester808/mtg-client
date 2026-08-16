import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CardHistoryEntryDto, CardHistoryEventType } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { absoluteTime, timeAgo } from '../../utils/time';

/** One entry plus everything the template needs, computed once instead of per binding. */
export interface HistoryRow {
  entry: CardHistoryEntryDto;
  /** What happened, as a sentence: "Added 2 copies", "Moved 1 to Commander". */
  headline: string;
  /** Where it happened, and how many were left afterwards. */
  detail: string;
  icon: string;
  /** Drives the accent colour: copies gained, lost, or neither. */
  tone: 'gain' | 'loss' | 'neutral';
  when: string;
  whenExact: string;
}

/**
 * The card modal's History tab: every change the signed-in user has made involving this
 * card, newest first.
 *
 * Split out of CardModalComponent for the same reason the prices panel was — that file is
 * at its style budget and already carries four tabs' worth of state. Fetching lives here,
 * so the request only fires once the tab is actually rendered.
 */
@Component({
  selector: 'app-card-history-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-history-panel.component.html',
  styleUrls: ['./card-history-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardHistoryPanelComponent implements OnInit, OnChanges, OnDestroy {
  /** The card whose history to show. History is per oracle id, not per printing. */
  @Input() oracleId: string | null = null;

  /**
   * Any value that changes when this card's stored copies do. The tab is open while the
   * modal's own +/- controls are usable, so without this a change made with History
   * showing was invisible until you left the tab and came back.
   */
  @Input() reloadKey: string | number | null = null;

  entries: CardHistoryEntryDto[] = [];
  loading = false;
  failed = false;

  /**
   * How long to wait after a change before refetching. The host's store updates
   * optimistically — the copy count changes the instant the button is clicked, before the
   * write reaches the server — so refetching immediately races the very event we want and
   * returns the list without it. The key changes again when the server value reconciles,
   * which is the backstop if a write takes longer than this.
   */
  private static readonly RELOAD_DELAY_MS = 500;

  private sub: Subscription | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private gameApi: GameApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A different card is a different question — answer it immediately.
    if (changes['oracleId'] && !changes['oracleId'].firstChange) {
      this.load();
      return;
    }
    // A change to this card is the same question with a newer answer; let the write land.
    if (changes['reloadKey'] && !changes['reloadKey'].firstChange) this.scheduleReload();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  /** Coalesces a burst of clicks into one refetch once the copy count stops moving. */
  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.load();
      this.cdr.markForCheck();
    }, CardHistoryPanelComponent.RELOAD_DELAY_MS);
  }

  // ---- Rows ------------------------------------------------------------

  private rowsMemo: { entries: CardHistoryEntryDto[]; value: HistoryRow[] } | null = null;

  /** Memoized on the entries identity — the template binds this every change detection pass. */
  get rows(): HistoryRow[] {
    const m = this.rowsMemo;
    if (m && m.entries === this.entries) return m.value;
    const value = this.entries.map((e) => CardHistoryPanelComponent.toRow(e));
    this.rowsMemo = { entries: this.entries, value };
    return value;
  }

  /** "2", "1 foil", or "2 + 1 foil" — never "0", which no event should carry. */
  static copies(qty: number, foil: number): string {
    const parts: string[] = [];
    if (qty) parts.push(`${qty}`);
    if (foil) parts.push(`${foil} foil`);
    return parts.join(' + ') || '0';
  }

  private static place(entry: CardHistoryEntryDto): string {
    return `${entry.collectionName}${entry.isDeck ? ' (deck)' : ''}`;
  }

  private static headlineFor(entry: CardHistoryEntryDto): string {
    const moved = CardHistoryPanelComponent.copies(
      Math.abs(entry.quantityDelta),
      Math.abs(entry.quantityFoilDelta),
    );
    const other = entry.counterpartCollectionName ?? 'another collection';

    switch (entry.eventType) {
      case 'Added':
        return `Added ${moved}`;
      case 'QuantityChanged':
        // The same event type covers both directions; the sign is the only thing that says which.
        return entry.quantityDelta + entry.quantityFoilDelta >= 0
          ? `Added ${moved} more`
          : `Removed ${moved}`;
      case 'PrintingChanged':
        return 'Changed printing';
      case 'Removed':
        return `Removed ${moved}`;
      case 'MovedOut':
        return `Moved ${moved} to ${other}`;
      case 'MovedIn':
        return `Moved ${moved} from ${other}`;
      default:
        return 'Changed';
    }
  }

  private static detailFor(entry: CardHistoryEntryDto): string {
    const parts = [CardHistoryPanelComponent.place(entry)];
    if (entry.board && entry.board !== 'main') parts.push(entry.board);

    const left = CardHistoryPanelComponent.copies(entry.quantityAfter, entry.quantityFoilAfter);
    // A removal's "0 left" is noise; the headline already said it went to zero.
    parts.push(entry.eventType === 'Removed' && left === '0' ? 'none left' : `${left} after`);
    return parts.join(' · ');
  }

  private static toneFor(entry: CardHistoryEventType, delta: number): HistoryRow['tone'] {
    if (entry === 'PrintingChanged') return 'neutral';
    if (delta > 0) return 'gain';
    if (delta < 0) return 'loss';
    return 'neutral';
  }

  private static readonly ICONS: Record<CardHistoryEventType, string> = {
    Added: '+',
    QuantityChanged: '±',
    PrintingChanged: '⇄',
    Removed: '−',
    MovedOut: '→',
    MovedIn: '←',
  };

  private static toRow(entry: CardHistoryEntryDto): HistoryRow {
    const delta = entry.quantityDelta + entry.quantityFoilDelta;
    return {
      entry,
      headline: CardHistoryPanelComponent.headlineFor(entry),
      detail: CardHistoryPanelComponent.detailFor(entry),
      icon: CardHistoryPanelComponent.ICONS[entry.eventType] ?? '•',
      tone: CardHistoryPanelComponent.toneFor(entry.eventType, delta),
      when: timeAgo(entry.createdAt),
      whenExact: absoluteTime(entry.createdAt),
    };
  }

  trackRow(_: number, row: HistoryRow): string {
    return row.entry.id;
  }

  // ---- Loading ---------------------------------------------------------

  retry(): void {
    this.load();
  }

  // Deliberately uncached. A per-oracle cache bought nothing — the panel is behind an
  // *ngIf and is destroyed every time the tab is left, so it started empty on each mount
  // anyway — while making a change made with the tab open show a stale list.
  private load(): void {
    const oracleId = this.oracleId;
    if (!oracleId) {
      this.entries = [];
      return;
    }

    // Supersede any in-flight request; the newest answer is the one that wins.
    this.sub?.unsubscribe();
    this.loading = true;
    this.failed = false;
    this.sub = this.gameApi.getCardHistory(oracleId).subscribe({
      next: (entries) => {
        this.entries = entries;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.entries = [];
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }
}
