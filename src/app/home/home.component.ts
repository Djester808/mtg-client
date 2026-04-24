import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
  OnInit, OnDestroy, HostListener, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import {
  debounceTime, distinctUntilChanged, switchMap,
  catchError, startWith, map, takeUntil, mergeMap, of, concatMap,
} from 'rxjs';
import { CardDto, PrintingDto, SetSummaryDto } from '../models/game.models';
import { GameApiService } from '../services/game-api.service';
import { CollectionApiService } from '../services/collection-api.service';
import { ManaCostComponent } from '../components/mana-cost/mana-cost.component';
import { CardModalComponent } from '../components/card-modal/card-modal.component';

type RarityCode = 'common' | 'uncommon' | 'rare' | 'mythic';
type CmcOption  = '0' | '1' | '2' | '3' | '4' | '5' | '6+';
type SortBy     = 'name' | 'cmc';
type SortDir    = 'asc' | 'desc';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ManaCostComponent, CardModalComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class HomeComponent implements OnInit, OnDestroy {

  // ---- Search & filter state ---------------------------------

  searchText  = new FormControl('');

  selectedColors    = new Set<string>();
  selectedTypes     = new Set<string>();
  selectedRarities  = new Set<RarityCode>();
  selectedCmc: CmcOption | null = null;
  activeSet:   string | null = null;
  sortBy:  SortBy  = 'name';
  sortDir: SortDir = 'asc';

  // ---- Results state -----------------------------------------

  readonly PAGE_SIZE = 60;

  results:     CardDto[] = [];
  loading      = false;
  loadingMore  = false;
  searched     = false;
  hasMore      = false;
  private currentOffset = 0;
  private lastQuery     = '';

  // ---- Card detail modal -------------------------------------

  selectedCard: CardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  private printingsCache = new Map<string, PrintingDto[]>();

  // ---- Filter options ----------------------------------------

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

  readonly rarityOptions: { code: RarityCode; label: string }[] = [
    { code: 'common',   label: 'Common'   },
    { code: 'uncommon', label: 'Uncommon' },
    { code: 'rare',     label: 'Rare'     },
    { code: 'mythic',   label: 'Mythic'   },
  ];

  readonly cmcOptions: CmcOption[] = ['0','1','2','3','4','5','6+'];

  // ---- Set dropdown ------------------------------------------

  allSets: SetSummaryDto[] = [];
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

  // ---- Internals ---------------------------------------------

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
    this.api.getSets().pipe(
      catchError(() => of<SetSummaryDto[]>([])),
      takeUntil(this.destroy$),
    ).subscribe(sets => {
      this.allSets = sets;
      this.cdr.markForCheck();
    });

    combineLatest([
      this.searchText.valueChanges.pipe(startWith('')),
      this.filterChange$,
    ]).pipe(
      debounceTime(350),
      map(([text]) => this.buildQuery(text ?? '')),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          this.loading = false; this.searched = false; this.results = [];
          this.hasMore = false; this.currentOffset = 0; this.lastQuery = '';
          this.cdr.markForCheck();
          return of(null);
        }
        this.loading = true; this.searched = true;
        this.currentOffset = 0; this.lastQuery = query;
        this.cdr.markForCheck();
        return this.api.searchCards(query, this.PAGE_SIZE, 0, this.sortBy, this.sortDir).pipe(
          catchError(() => of<CardDto[]>([])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(res => {
      if (res !== null) {
        this.results = res;
        this.hasMore = res.length === this.PAGE_SIZE;
        this.loading = false;
      }
      this.cdr.markForCheck();
    });

    this.loadMore$.pipe(
      concatMap(() => {
        if (!this.lastQuery || this.loadingMore) return of<CardDto[]>([]);
        this.loadingMore = true;
        this.currentOffset += this.PAGE_SIZE;
        this.cdr.markForCheck();
        return this.api.searchCards(this.lastQuery, this.PAGE_SIZE, this.currentOffset, this.sortBy, this.sortDir).pipe(
          catchError(() => of<CardDto[]>([])),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(res => {
      this.results = [...this.results, ...res];
      this.hasMore = res.length === this.PAGE_SIZE;
      this.loadingMore = false;
      this.cdr.markForCheck();
    });

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
      if (this.selectedCard?.oracleId === oracleId) {
        this.modalPrintings = printings;
        if (!this.modalViewScryfallId && printings.length)
          this.modalViewScryfallId = printings[0].scryfallId;
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ---- Filter toggles ----------------------------------------

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

  selectSet(code: string): void {
    this.activeSet = this.activeSet === code ? null : code;
    this.filterChange$.next();
  }

  openSetDrop(): void {
    this.setQuery = '';
    this.setDropOpen = true;
  }

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

  setSortBy(field: SortBy): void {
    this.sortBy = field;
    this.filterChange$.next();
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.filterChange$.next();
  }

  clearFilters(): void {
    this.selectedColors.clear(); this.selectedTypes.clear();
    this.selectedRarities.clear(); this.selectedCmc = null;
    this.activeSet = null; this.setDropOpen = false;
    this.sortBy = 'name'; this.sortDir = 'asc';
    this.searchText.setValue('', { emitEvent: false });
    this.results = []; this.searched = false;
    this.filterChange$.next();
  }

  // ---- Card detail -------------------------------------------

  openCard(card: CardDto): void {
    this.selectedCard = card;
    this.modalFlipped = false;
    const cached = this.printingsCache.get(card.oracleId);
    this.modalPrintings = cached ?? [];
    this.modalViewScryfallId = cached?.[0]?.scryfallId ?? null;
    if (!cached) this.printingsLoad$.next(card.oracleId);
    this.cdr.markForCheck();
  }

  closeCard(): void { this.selectedCard = null; this.cdr.markForCheck(); }

  loadMore(): void { this.loadMore$.next(); }

  // ---- Query builder -----------------------------------------

  private buildQuery(text: string): string {
    const parts: string[] = [];
    if (text.trim().length >= 2) parts.push(`name:"${text.trim()}"`);

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

    if (this.selectedCmc !== null) {
      if (this.selectedCmc === '6+') parts.push('cmc>=6');
      else                           parts.push(`cmc=${this.selectedCmc}`);
    }

    if (this.activeSet) parts.push(`s:${this.activeSet}`);

    return parts.join(' ');
  }
}
