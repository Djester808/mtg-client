import { ExploreScrollDirective } from '../shared/explore-scroll.directive';
import { ExploreInsightsComponent } from './explore-insights/explore-insights.component';
import { CommanderDirectoryComponent } from './commander-directory/commander-directory.component';
import { ExploreHomeService } from '../services/explore-home.service';
import { ExploreVisitService } from '../services/explore-visit.service';
import { CollectionUndoComponent } from '../components/collection-undo/collection-undo.component';
import { ExploreQueryService, ExploreQuery } from '../services/explore-query.service';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of, Subject, debounceTime } from 'rxjs';
import { catchError, switchMap, tap, startWith, distinctUntilChanged } from 'rxjs/operators';
import { ExploreApiService, ExploreEntry, ExplorePage } from '../services/explore-api.service';
import { DeckApiService, DeckDto } from '../services/deck-api.service';
import { CardDto } from '../models/game.models';
import { selectIsLoggedIn } from '../store/auth/auth.selectors';
import { CardModalComponent } from '../components/card-modal/card-modal.component';
import { DialogFocusDirective } from '../shared/dialog-focus.directive';

export function sortExplore(entries: ExploreEntry[], sort: string): ExploreEntry[] {
  return [...entries].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : ((sort === 'price' ? b.card?.prices?.usd : b[sort as 'decks' | 'synergy' | 'inclusion']) ??
          -Infinity) -
          ((sort === 'price'
            ? a.card?.prices?.usd
            : a[sort as 'decks' | 'synergy' | 'inclusion']) ?? -Infinity) ||
        a.name.localeCompare(b.name),
  );
}

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [
    ExploreScrollDirective,
    ExploreInsightsComponent,
    CommanderDirectoryComponent,
    CollectionUndoComponent,
    CommonModule,
    FormsModule,
    RouterModule,
    CardModalComponent,
    DialogFocusDirective,
  ],
  templateUrl: './explore.component.html',
  styleUrls: ['./explore.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ExploreApiService);
  private readonly deckApi = inject(DeckApiService);
  private readonly destroy = inject(DestroyRef);
  readonly loggedIn = inject(Store).selectSignal(selectIsLoggedIn);
  readonly page = signal<ExplorePage | null>(null);
  readonly directory = signal<ExploreEntry[]>([]);
  readonly directoryTitle = signal('Top commanders · past 2 years');
  private readonly reload = new Subject<number>();
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly query = signal('');
  readonly section = signal('');
  readonly sort = signal('decks');
  readonly view = signal('rows');
  readonly advanced = signal<Omit<ExploreQuery, 'q' | 'section' | 'sort'>>({
    dir: 'desc',
    group: 'category',
    color: '',
    type: '',
    rarity: '',
    with: '',
    without: '',
    limit: 40,
  });
  private readonly queryRules = inject(ExploreQueryService);
  readonly viewedCard = signal<CardDto | null>(null);
  readonly pending = signal<ExploreEntry | null>(null);
  readonly decks = signal<DeckDto[]>([]);
  readonly saving = signal(false);
  readonly home = inject(ExploreHomeService);
  readonly daily = computed(() => this.home.pick(this.directory()));
  readonly suggestions = signal<ExploreEntry[]>([]);
  private readonly typedSearch = new Subject<string>();
  directoryOpen = false;
  searchText = '';
  searchKind = 'commander';
  readonly visit = inject(ExploreVisitService);
  destination = '';
  quantity = 1;
  readonly visibleSections = computed(() => {
    const page = this.page();
    const source = page?.sections ?? [
      { tag: 'directory', title: this.directoryTitle(), cards: this.directory() },
    ];
    return this.queryRules.run(source, {
      ...this.advanced(),
      q: this.query(),
      section: this.section(),
      sort: this.sort(),
    });
  });
  readonly totalCards = computed(
    () =>
      this.page()?.sections.reduce((n, s) => n + s.cards.reduce((q, c) => q + c.quantity, 0), 0) ??
      0,
  );

  constructor() {
    this.visit.restore();
    this.typedSearch
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim().length < 2
            ? of([])
            : this.api.search(q.trim(), this.searchKind).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((rows) => this.suggestions.set(rows.slice(0, 6)));
    const route = inject(ActivatedRoute);
    combineLatest([route.paramMap, route.queryParamMap, this.reload.pipe(startWith(0))])
      .pipe(
        tap(([, query]) => {
          this.sort.set(
            ['decks', 'synergy', 'inclusion', 'price', 'name', 'mv'].includes(
              query.get('sort') ?? '',
            )
              ? query.get('sort')!
              : 'decks',
          );
          this.advanced.set({
            dir: query.get('dir') === 'asc' ? 'asc' : 'desc',
            group: ['mv', 'rarity', 'price'].includes(query.get('group') ?? '')
              ? query.get('group')!
              : 'category',
            color: query.get('color') ?? '',
            type: query.get('type') ?? '',
            rarity: query.get('rarity') ?? '',
            with: query.get('with') ?? '',
            without: query.get('without') ?? '',
            limit: Math.max(1, Math.min(5000, Number(query.get('limit')) || 40)),
          });
          this.query.set(query.get('q') ?? '');
          this.section.set(query.get('section') ?? '');
          this.view.set(query.get('view') === 'grid' ? 'grid' : 'rows');
        }),
        distinctUntilChanged(
          ([oldParams, oldQuery, oldReload], [params, query, reload]) =>
            oldParams.get('id') === params.get('id') &&
            oldQuery.get('variant') === query.get('variant') &&
            oldReload === reload,
        ),
        tap(() => {
          this.loading.set(true);
          this.error.set('');
          this.page.set(null);
        }),
        switchMap(([params, query]) => {
          const id = params.get('id');
          return (
            id
              ? this.api.page(id, route.snapshot.data['kind'], query.get('variant') ?? '')
              : this.api.directory()
          ).pipe(
            catchError(() => {
              this.error.set('Community data is unavailable right now. Please try again.');
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((result) => {
        if (result && 'subject' in result) this.page.set(result as ExplorePage);
        else if (result) this.directory.set(result.commanders);
        this.loading.set(false);
      });
  }
  changeState(key: string, value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  retry(): void {
    this.reload.next(Date.now());
  }
  onSearchInput(value: string): void {
    this.searchText = value;
    this.typedSearch.next(value);
  }
  search(): void {
    if (!this.searchText.trim()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .search(this.searchText.trim(), this.searchKind)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (cards) => {
          this.home.remember(this.searchText, this.searchKind);
          this.suggestions.set([]);
          this.directoryTitle.set('Search results');
          this.directory.set(cards);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Card search could not be completed. Please retry.');
          this.loading.set(false);
        },
      });
  }
  copyAverage(): void {
    const page = this.page();
    if (!page || this.saving()) return;
    this.saving.set(true);
    this.notice.set('');
    this.api
      .copyAverage(page.subject.oracleId, page.variant)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (deck) => {
          this.saving.set(false);
          void this.router.navigate(['/deck', deck.id]);
        },
        error: () => {
          this.saving.set(false);
          this.notice.set(
            'The average deck could not be copied. No partial deck was saved. Please retry.',
          );
        },
      });
  }
  changeVariant(variant: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { variant } });
  }
  link(entry: ExploreEntry): string[] {
    return [
      '/explore',
      entry.kind === 'commander'
        ? 'commanders'
        : entry.kind === 'card' || this.page() || this.searchKind === 'card'
          ? 'cards'
          : 'commanders',
      entry.card?.oracleId ?? '',
    ];
  }
  openAdd(entry: ExploreEntry): void {
    this.pending.set(entry);
    this.quantity = entry.quantity;
    this.destination = this.visit.deck();
    this.notice.set('');
    this.deckApi
      .getDecks()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => this.decks.set(d),
        error: () => this.notice.set('Your decks could not be loaded. Please retry.'),
      });
  }
  add(): void {
    const entry = this.pending();
    if (
      !entry?.card ||
      !this.destination ||
      this.saving() ||
      !Number.isInteger(this.quantity) ||
      this.quantity < 1 ||
      this.quantity > 999
    )
      return;
    this.saving.set(true);
    this.deckApi
      .addCard(this.destination, {
        oracleId: entry.card.oracleId,
        quantity: this.quantity,
        quantityFoil: 0,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.visit.added(this.destination, entry.name, this.quantity);
          this.notice.set(`Added ${this.quantity} × ${entry.name}.`);
          this.pending.set(null);
          this.saving.set(false);
        },
        error: () => {
          this.notice.set('The card could not be added. Please retry.');
          this.saving.set(false);
        },
      });
  }
}
