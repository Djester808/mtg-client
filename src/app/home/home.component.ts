import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  startWith,
  map,
  takeUntil,
  of,
  concatMap,
} from 'rxjs';
import { CardDto, PrintingDto, SetSummaryDto } from '../models/game.models';
import { GameApiService } from '../services/game-api.service';
import { PrintingsService } from '../services/printings.service';
import { ManaCostComponent } from '../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../components/card-modal/card-modal.component';
import { CardSearchBase } from '../components/card-search-base';
import { FilterFacetsComponent } from '../components/filter-facets/filter-facets.component';
import { COLOR_CHIPS, RARITY_CHIPS } from '../components/filter-chips/filter-chip-sets';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ManaCostComponent,
    CardModalComponent,
    FilterFacetsComponent,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  // OnPush is safe here: every mutation path already calls cdr.markForCheck().
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent extends CardSearchBase implements OnInit, OnDestroy {
  // Filter/query/paging state and toggles live in CardSearchBase.

  readonly PAGE_SIZE = 60;

  // ---- Card detail modal -------------------------------------

  selectedCard: CardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;

  // ---- Filter options ----------------------------------------

  readonly colorOptions = COLOR_CHIPS;

  readonly rarityOptions = RARITY_CHIPS;

  // ---- Internals ---------------------------------------------

  private destroy$ = new Subject<void>();

  constructor(
    private api: GameApiService,
    private printings: PrintingsService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {
    super();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (
      this.setDropOpen &&
      !this.elRef.nativeElement.querySelector('.set-dropdown-wrap')?.contains(e.target)
    )
      this.setDropOpen = false;
  }

  ngOnInit(): void {
    // Reload set list whenever non-set filters change
    combineLatest([this.searchText.valueChanges.pipe(startWith('')), this.filterChange$])
      .pipe(
        debounceTime(350),
        map(([text]) => this.buildNonSetQuery(text ?? '')),
        distinctUntilChanged(),
        switchMap((q) =>
          this.api.getSets(q || undefined).pipe(catchError(() => of<SetSummaryDto[]>([]))),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((sets) => {
        this.allSets = sets;
        this.cdr.markForCheck();
      });

    combineLatest([this.searchText.valueChanges.pipe(startWith('')), this.filterChange$])
      .pipe(
        debounceTime(350),
        map(([text]) => ({
          query: this.buildQuery(text ?? ''),
          sortBy: this.sortBy,
          sortDir: this.sortDir,
          matchCase: this.matchCase,
          matchWord: this.matchWord,
          useRegex: this.useRegex,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.query === b.query &&
            a.sortBy === b.sortBy &&
            a.sortDir === b.sortDir &&
            a.matchCase === b.matchCase &&
            a.matchWord === b.matchWord &&
            a.useRegex === b.useRegex,
        ),
        switchMap(({ query }) => {
          if (!query.trim()) {
            this.loading = false;
            this.searched = false;
            this.results = [];
            this.hasMore = false;
            this.currentOffset = 0;
            this.lastQuery = '';
            this.cdr.markForCheck();
            return of(null);
          }
          this.loading = true;
          this.searched = true;
          this.currentOffset = 0;
          this.lastQuery = query;
          this.cdr.markForCheck();
          return this.api
            .searchCards(
              query,
              this.PAGE_SIZE,
              0,
              this.sortBy,
              this.sortDir,
              this.matchCase,
              this.matchWord,
              this.useRegex,
            )
            .pipe(catchError(() => of<CardDto[]>([])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((res) => {
        if (res !== null) {
          this.results = res;
          this.hasMore = res.length === this.PAGE_SIZE;
          this.loading = false;
          this.flippedIds.clear();
        }
        this.cdr.markForCheck();
      });

    this.loadMore$
      .pipe(
        concatMap(() => {
          if (!this.lastQuery || this.loadingMore) return of<CardDto[]>([]);
          this.loadingMore = true;
          this.currentOffset += this.PAGE_SIZE;
          this.cdr.markForCheck();
          return this.api
            .searchCards(
              this.lastQuery,
              this.PAGE_SIZE,
              this.currentOffset,
              this.sortBy,
              this.sortDir,
              this.matchCase,
              this.matchWord,
              this.useRegex,
            )
            .pipe(catchError(() => of<CardDto[]>([])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((res) => {
        this.results = [...this.results, ...res];
        this.hasMore = res.length === this.PAGE_SIZE;
        this.loadingMore = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleFlip(card: CardDto, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedIds.has(card.cardId)) this.flippedIds.delete(card.cardId);
    else this.flippedIds.add(card.cardId);
    this.cdr.markForCheck();
  }

  cardImage(card: CardDto): string | null {
    if (this.flippedIds.has(card.cardId) && card.imageUriNormalBack) return card.imageUriNormalBack;
    return card.imageUriNormal;
  }

  /** "Load More" appends to `results`; without trackBy every append rebuilt the whole grid. */
  trackByCardId(_: number, card: CardDto): string {
    return card.cardId;
  }

  // ---- Card detail -------------------------------------------

  openCard(card: CardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printings.cached(card.oracleId);
    this.modalPrintings = cached ?? [];
    this.modalViewScryfallId = cached?.[0]?.scryfallId ?? null;
    if (!cached) {
      this.printings
        .get(card.oracleId)
        .pipe(takeUntil(this.destroy$))
        .subscribe((printings) => {
          if (this.selectedCard?.oracleId === card.oracleId) {
            this.modalPrintings = printings;
            if (!this.modalViewScryfallId && printings.length)
              this.modalViewScryfallId = printings[0].scryfallId;
          }
          this.cdr.markForCheck();
        });
    }
    this.cdr.markForCheck();
  }

  closeCard(): void {
    this.selectedCard = null;
    this.cdr.markForCheck();
  }

  // ---- Query builder -----------------------------------------

  private buildQuery(text: string): string {
    const base = this.buildNonSetQuery(text);
    const setToken = this.activeSet ? `s:${this.activeSet}` : '';
    return [base, setToken].filter(Boolean).join(' ');
  }
}
