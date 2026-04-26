import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
  OnInit, OnDestroy, Input, Output, EventEmitter,
  HostBinding, HostListener, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import {
  debounceTime, distinctUntilChanged, switchMap, catchError,
  startWith, map, takeUntil, mergeMap, of, concatMap,
} from 'rxjs';
import { CardDto, CollectionCardDto, PrintingDto, SetSummaryDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';

type RarityCode = 'common' | 'uncommon' | 'rare' | 'mythic';
type CmcOption  = '0' | '1' | '2' | '3' | '4' | '5' | '6+';
type SortBy     = 'name' | 'cmc';
type SortDir    = 'asc' | 'desc';

@Component({
  selector: 'app-card-search-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ManaCostComponent, CardModalComponent],
  templateUrl: './card-search-panel.component.html',
  styleUrls: ['./card-search-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchPanelComponent implements OnInit, OnDestroy {
  @Input() ownedCards: CollectionCardDto[] = [];

  private _commanderFilter = false;
  get commanderFilter(): boolean { return this._commanderFilter; }
  @Input() set commanderFilter(v: boolean) {
    this._commanderFilter = v;
    this.filterChange$.next();
  }

  @Input()
  set isOpen(value: boolean) {
    this._isOpen = value;
    if (!value) this.resetPanel();
  }
  get isOpen(): boolean { return this._isOpen; }
  private _isOpen = false;

  @HostBinding('class.is-open') get openClass() { return this._isOpen; }

  @Output() cardAdd   = new EventEmitter<{ oracleId: string; scryfallId: string }>();
  @Output() panelClose = new EventEmitter<void>();

  // ---- Search & filter state ----------------------------------------

  searchText = new FormControl('');

  selectedColors   = new Set<string>();
  selectedTypes    = new Set<string>();
  selectedRarities = new Set<RarityCode>();
  selectedCmc: CmcOption | null = null;
  activeSet:   string | null   = null;
  sortBy:  SortBy  = 'name';
  sortDir: SortDir = 'asc';
  matchCase = false;
  matchWord = false;
  useRegex  = false;

  // ---- Results state ------------------------------------------------

  readonly PAGE_SIZE = 20;

  results:     CardDto[] = [];
  loading      = false;
  loadingMore  = false;
  searched     = false;
  hasMore      = false;
  flippedIds   = new Set<string>();
  private currentOffset = 0;
  private lastQuery     = '';

  // ---- Set dropdown -------------------------------------------------

  allSets:    SetSummaryDto[] = [];
  setQuery    = '';
  setDropOpen = false;

  get filteredSets(): SetSummaryDto[] {
    const q = this.setQuery.trim().toLowerCase();
    if (!q) return this.allSets;
    return this.allSets.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }

  get activeSetName(): string {
    return this.allSets.find(s => s.code.toLowerCase() === this.activeSet?.toLowerCase())?.name ?? '';
  }

  get hasFilters(): boolean {
    return this.selectedColors.size > 0 || this.selectedTypes.size > 0 ||
           this.selectedRarities.size > 0 || this.selectedCmc !== null ||
           this.activeSet !== null || this.sortBy !== 'name' || this.sortDir !== 'asc';
  }

  // ---- Filter option lists ------------------------------------------

  readonly colorOptions = [
    { code: 'W', label: 'W', title: 'White'     },
    { code: 'U', label: 'U', title: 'Blue'      },
    { code: 'B', label: 'B', title: 'Black'     },
    { code: 'R', label: 'R', title: 'Red'       },
    { code: 'G', label: 'G', title: 'Green'     },
    { code: 'C', label: 'C', title: 'Colorless' },
    { code: 'M', label: 'M', title: 'Multicolor'},
  ];

  readonly typeOptions = ['Creature','Instant','Sorcery','Enchantment','Artifact','Land','Planeswalker','Token','Other'];

  readonly rarityOptions: { code: RarityCode; label: string; title: string }[] = [
    { code: 'common',   label: 'C', title: 'Common'   },
    { code: 'uncommon', label: 'U', title: 'Uncommon' },
    { code: 'rare',     label: 'R', title: 'Rare'     },
    { code: 'mythic',   label: 'M', title: 'Mythic'   },
  ];

  readonly cmcOptions: CmcOption[] = ['0','1','2','3','4','5','6+'];

  // ---- Per-result state ---------------------------------------------

  searchSelectedScryfallId = new Map<string, string>();
  addErrors                = new Set<string>();

  // ---- Preview modal ------------------------------------------------

  previewCard:       CardDto | null    = null;
  previewPrintings:  PrintingDto[]     = [];
  previewScryfallId: string | null     = null;
  previewFlipped     = false;

  // ---- Internal -----------------------------------------------------

  printingsCache = new Map<string, PrintingDto[]>();

  private filterChange$  = new BehaviorSubject<void>(undefined);
  private loadMore$      = new Subject<void>();
  private printingsLoad$ = new Subject<string>();
  private destroy$       = new Subject<void>();

  constructor(
    private api: GameApiService,
    private collectionApi: CollectionApiService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.setDropOpen && !this.elRef.nativeElement.querySelector('.set-dropdown-wrap')?.contains(e.target))
      this.setDropOpen = false;
  }

  ngOnInit(): void {
    // Load sets (filtered by current non-set query)
    combineLatest([
      this.searchText.valueChanges.pipe(startWith('')),
      this.filterChange$,
    ]).pipe(
      debounceTime(350),
      map(([text]) => this.buildNonSetQuery(text ?? '')),
      distinctUntilChanged(),
      switchMap(q => this.api.getSets(q || undefined).pipe(catchError(() => of<SetSummaryDto[]>([])))),
      takeUntil(this.destroy$),
    ).subscribe(sets => { this.allSets = sets; this.cdr.markForCheck(); });

    // Main search pipeline
    combineLatest([
      this.searchText.valueChanges.pipe(startWith('')),
      this.filterChange$,
    ]).pipe(
      debounceTime(350),
      map(([text]) => ({
        query:     this.buildQuery(text ?? ''),
        sortBy:    this.sortBy,
        sortDir:   this.sortDir,
        matchCase: this.matchCase,
        matchWord: this.matchWord,
        useRegex:  this.useRegex,
      })),
      distinctUntilChanged((a, b) =>
        a.query === b.query && a.sortBy === b.sortBy && a.sortDir === b.sortDir &&
        a.matchCase === b.matchCase && a.matchWord === b.matchWord && a.useRegex === b.useRegex),
      switchMap(({ query, sortBy, sortDir, matchCase, matchWord, useRegex }) => {
        if (!query.trim()) {
          this.loading = false; this.searched = false; this.results = [];
          this.hasMore = false; this.currentOffset = 0; this.lastQuery = '';
          this.cdr.markForCheck();
          return of(null);
        }
        this.loading = true; this.searched = true;
        this.currentOffset = 0; this.lastQuery = query;
        this.cdr.markForCheck();
        return this.api.searchCards(query, this.PAGE_SIZE, 0, sortBy, sortDir, matchCase, matchWord, useRegex).pipe(
          catchError(() => of<CardDto[]>([])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(res => {
      if (res !== null) {
        this.results = res;
        this.hasMore = res.length === this.PAGE_SIZE;
        this.loading = false;
        this.flippedIds.clear();
        this.searchSelectedScryfallId.clear();
        this.addErrors.clear();
        res.forEach(c => {
          if (!this.printingsCache.has(c.oracleId)) this.printingsLoad$.next(c.oracleId);
        });
      }
      this.cdr.markForCheck();
    });

    // Load more
    this.loadMore$.pipe(
      concatMap(() => {
        if (!this.lastQuery || this.loadingMore) return of<CardDto[]>([]);
        this.loadingMore = true;
        this.currentOffset += this.PAGE_SIZE;
        this.cdr.markForCheck();
        return this.api.searchCards(
          this.lastQuery, this.PAGE_SIZE, this.currentOffset,
          this.sortBy, this.sortDir, this.matchCase, this.matchWord, this.useRegex,
        ).pipe(catchError(() => of<CardDto[]>([])));
      }),
      takeUntil(this.destroy$),
    ).subscribe(res => {
      this.results = [...this.results, ...res];
      this.hasMore = res.length === this.PAGE_SIZE;
      this.loadingMore = false;
      res.forEach(c => {
        if (!this.printingsCache.has(c.oracleId)) this.printingsLoad$.next(c.oracleId);
      });
      this.cdr.markForCheck();
    });

    // Printings loader (mergeMap = parallel rows)
    this.printingsLoad$.pipe(
      mergeMap(oracleId => {
        if (this.printingsCache.has(oracleId))
          return of({ oracleId, printings: this.printingsCache.get(oracleId)! });
        return this.collectionApi.getPrintings(oracleId).pipe(
          map(printings => ({ oracleId, printings })),
          catchError(() => of({ oracleId, printings: [] as PrintingDto[] })),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(({ oracleId, printings }) => {
      this.printingsCache.set(oracleId, printings);
      if (this.previewCard?.oracleId === oracleId) {
        this.previewPrintings = printings;
        if (!this.previewScryfallId && printings.length)
          this.previewScryfallId = printings[0].scryfallId;
      }
      if (printings.length === 1 && !this.searchSelectedScryfallId.has(oracleId))
        this.searchSelectedScryfallId.set(oracleId, printings[0].scryfallId);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ---- Filter toggles -----------------------------------------------

  toggleColor(code: string): void {
    this.selectedColors.has(code) ? this.selectedColors.delete(code) : this.selectedColors.add(code);
    this.filterChange$.next();
  }

  toggleType(type: string): void {
    this.selectedTypes.has(type) ? this.selectedTypes.delete(type) : this.selectedTypes.add(type);
    this.filterChange$.next();
  }

  toggleRarity(code: RarityCode): void {
    this.selectedRarities.has(code) ? this.selectedRarities.delete(code) : this.selectedRarities.add(code);
    this.filterChange$.next();
  }

  toggleCmc(opt: CmcOption): void {
    this.selectedCmc = this.selectedCmc === opt ? null : opt;
    this.filterChange$.next();
  }

  openSetDrop(): void { this.setQuery = ''; this.setDropOpen = true; }

  selectSetFromDrop(code: string): void {
    this.activeSet = this.activeSet === code ? null : code;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  clearSet(): void {
    this.activeSet = null;
    this.setDropOpen = false;
    this.filterChange$.next();
  }

  setSortBy(field: SortBy): void { this.sortBy = field; this.filterChange$.next(); }
  toggleSortDir(): void { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; this.filterChange$.next(); }

  toggleMatchCase(): void { this.matchCase = !this.matchCase; this.filterChange$.next(); }
  toggleMatchWord(): void { this.matchWord = !this.matchWord; this.filterChange$.next(); }
  toggleUseRegex():  void { this.useRegex  = !this.useRegex;  this.filterChange$.next(); }

  clearFilters(): void {
    this.selectedColors.clear(); this.selectedTypes.clear();
    this.selectedRarities.clear(); this.selectedCmc = null;
    this.activeSet = null; this.setDropOpen = false;
    this.sortBy = 'name'; this.sortDir = 'asc';
    this.matchCase = false; this.matchWord = false; this.useRegex = false;
    this.searchText.setValue('', { emitEvent: false });
    this.results = []; this.searched = false; this.flippedIds.clear();
    this.filterChange$.next();
  }

  // ---- Result helpers -----------------------------------------------

  loadMore(): void { this.loadMore$.next(); }

  toggleFlip(oracleId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.flippedIds.has(oracleId)) this.flippedIds.delete(oracleId);
    else this.flippedIds.add(oracleId);
    this.cdr.markForCheck();
  }

  cardImage(card: CardDto): string | null {
    if (this.flippedIds.has(card.oracleId) && card.imageUriNormalBack)
      return card.imageUriNormalBack;
    return card.imageUriSmall;
  }

  onSelectFocus(oracleId: string): void {
    if (!this.printingsCache.has(oracleId)) this.printingsLoad$.next(oracleId);
  }

  onSetChange(oracleId: string, scryfallId: string): void {
    this.searchSelectedScryfallId.set(oracleId, scryfallId);
    this.addErrors.delete(oracleId);
  }

  setTooltip(oracleId: string): string {
    const scryfallId = this.searchSelectedScryfallId.get(oracleId);
    const p = this.printingsCache.get(oracleId)?.find(x => x.scryfallId === scryfallId);
    return p ? `${p.setName}${p.collectorNumber ? ' #' + p.collectorNumber : ''}` : 'Select a printing';
  }

  ownedEntry(oracleId: string): CollectionCardDto | undefined {
    return this.ownedCards.find(c => c.oracleId === oracleId);
  }

  addCard(card: CardDto): void {
    let scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) {
      const printings = this.printingsCache.get(card.oracleId);
      if (printings?.length === 1) scryfallId = printings[0].scryfallId;
    }
    if (!scryfallId) { this.addErrors.add(card.oracleId); this.cdr.markForCheck(); return; }
    this.addErrors.delete(card.oracleId);
    this.cardAdd.emit({ oracleId: card.oracleId, scryfallId });
  }

  onDragStart(card: CardDto, event: DragEvent): void {
    let scryfallId = this.searchSelectedScryfallId.get(card.oracleId);
    if (!scryfallId) {
      const printings = this.printingsCache.get(card.oracleId);
      if (printings?.length === 1) scryfallId = printings[0].scryfallId;
    }
    if (!scryfallId) {
      this.addErrors.add(card.oracleId);
      this.cdr.markForCheck();
      event.preventDefault();
      return;
    }
    this.addErrors.delete(card.oracleId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-search-card', JSON.stringify({ oracleId: card.oracleId, scryfallId }));
      const artEl = (event.target as HTMLElement).closest('.result-row')?.querySelector('.result-art') as HTMLElement | null;
      if (artEl) event.dataTransfer.setDragImage(artEl, artEl.offsetWidth / 2, artEl.offsetHeight / 2);
    }
  }

  highlightParts(text: string): { text: string; match: boolean }[] {
    const q = (this.searchText.value ?? '').trim();
    if (!q) return [{ text, match: false }];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    const testRe = new RegExp(`^${escaped}$`, 'i');
    return parts.filter(p => p.length > 0).map(p => ({ text: p, match: testRe.test(p) }));
  }

  // ---- Preview modal ------------------------------------------------

  openPreview(card: CardDto): void {
    this.previewCard = card;
    this.previewFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.previewPrintings = cached ?? [];
    this.previewScryfallId = cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  closePreview(): void { this.previewCard = null; this.cdr.markForCheck(); }

  close(): void { this.panelClose.emit(); }

  // ---- Internals ----------------------------------------------------

  private resetPanel(): void {
    this.searchText.setValue('', { emitEvent: false });
    this.results = []; this.searched = false; this.loading = false;
    this.flippedIds.clear();
    this.searchSelectedScryfallId.clear();
    this.addErrors.clear();
    this.previewCard = null;
  }

  private buildNonSetQuery(text: string): string {
    const parts: string[] = [];
    if (text.trim().length >= 2) parts.push(`(name:"${text.trim()}" or o:"${text.trim()}")`);

    if (this.selectedColors.size > 0) {
      const codes = [...this.selectedColors];
      if (codes.includes('M'))      parts.push('c:m');
      else if (codes.includes('C')) parts.push('c:c');
      else                          parts.push(`c:${codes.join('').toLowerCase()}`);
    }
    if (this.selectedTypes.size > 0) {
      const t = [...this.selectedTypes].map(x => x.toLowerCase());
      parts.push(t.length === 1 ? `t:${t[0]}` : `(${t.map(x => `t:${x}`).join(' or ')})`);
    }
    if (this.selectedRarities.size > 0) {
      const r = [...this.selectedRarities];
      parts.push(r.length === 1 ? `r:${r[0]}` : `(${r.map(x => `r:${x}`).join(' or ')})`);
    }
    if (this.selectedCmc !== null)
      parts.push(this.selectedCmc === '6+' ? 'cmc>=6' : `cmc=${this.selectedCmc}`);

    return parts.join(' ');
  }

  private buildQuery(text: string): string {
    const base      = this.buildNonSetQuery(text);
    const setToken  = this.activeSet ? `s:${this.activeSet}` : '';
    const cmdrToken = this.commanderFilter
      ? 't:legendary (t:creature OR t:planeswalker)'
      : '';
    return [base, setToken, cmdrToken].filter(Boolean).join(' ');
  }
}
