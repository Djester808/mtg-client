import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommandersApiService } from '../../services/commanders-api.service';
import { CommanderProfile, CommanderCardEntry, CommanderDeck } from '../../models/commander.models';
import { DeckSuggestionsDto, SuggestedCardDto } from '../../services/deck-api.service';
import { PrintingDto } from '../../models/collection.models';
import { CardDto, CardType } from '../../models/game.models';
import { CommanderChartsComponent } from '../commander-charts/commander-charts.component';
import { ManaCostPipe } from '../../pipes/mana-cost.pipe';
import { OracleSymbolsPipe } from '../../pipes/oracle-symbols.pipe';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { CollectionApiService } from '../../services/collection-api.service';

type TypeTab =
  | 'all'
  | 'top'
  | 'gamechangers'
  | 'creatures'
  | 'instants'
  | 'sorceries'
  | 'enchantments'
  | 'artifacts'
  | 'planeswalkers';

type SortMode = 'inclusion' | 'name' | 'mv';
type DeckSort = 'newest' | 'oldest' | 'bracket';
type BracketFilter = 0 | 1 | 2 | 3 | 4; // 0 = all

interface SuggestionSection {
  key: keyof DeckSuggestionsDto;
  label: string;
}

@Component({
  selector: 'app-commander-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CommanderChartsComponent,
    ManaCostPipe,
    OracleSymbolsPipe,
    CardModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commander-detail.component.html',
  styleUrls: ['./commander-detail.component.scss'],
})
export class CommanderDetailComponent implements OnInit, OnDestroy {
  profile: CommanderProfile | null = null;
  cards: CommanderCardEntry[] = [];
  decks: CommanderDeck[] = [];
  totalDecks = 0;
  suggestions: DeckSuggestionsDto | null = null;

  loading = true;
  cardsLoading = true;
  decksLoading = true;
  suggestionsLoading = false;
  error: string | null = null;

  activeTab: TypeTab = 'all';
  sortMode: SortMode = 'inclusion';
  cardZoom = 1.0;
  showSuggestions = false;

  // Deck filters
  deckSort: DeckSort = 'newest';
  deckBracket: BracketFilter = 0;
  deckSearch = '';
  deckTag = '';

  readonly typeTabs: { id: TypeTab; label: string }[] = [
    { id: 'all', label: 'All Cards' },
    { id: 'top', label: 'Top 10' },
    { id: 'gamechangers', label: 'Game Changers' },
    { id: 'creatures', label: 'Creatures' },
    { id: 'instants', label: 'Instants' },
    { id: 'sorceries', label: 'Sorceries' },
    { id: 'enchantments', label: 'Enchantments' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'planeswalkers', label: 'Planeswalkers' },
  ];

  readonly suggestionSections: SuggestionSection[] = [
    { key: 'topSynergy', label: 'High Synergy' },
    { key: 'gameChangers', label: 'Game Changers' },
    { key: 'latestSet', label: 'New Cards' },
    { key: 'notableMentions', label: 'Notable Mentions' },
  ];

  oracleId = '';

  // Card detail modal
  modalCard: CardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalScryfallId: string | null = null;
  modalFlipped = false;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private api: CommandersApiService,
    private collectionApi: CollectionApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('oracleId') ?? '';
      if (id && id !== this.oracleId) {
        this.oracleId = id;
        this.reset();
        this.load();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private reset(): void {
    this.profile = null;
    this.cards = [];
    this.decks = [];
    this.totalDecks = 0;
    this.suggestions = null;
    this.loading = true;
    this.cardsLoading = true;
    this.decksLoading = true;
    this.suggestionsLoading = false;
    this.showSuggestions = false;
    this.error = null;
    this.activeTab = 'all';
    this.sortMode = 'inclusion';
    this.deckSort = 'newest';
    this.deckBracket = 0;
    this.deckSearch = '';
  }

  private load(): void {
    this.api.getCommanderProfile(this.oracleId).subscribe({
      next: (p) => {
        this.profile = p;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Commander not found.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    this.api.getCommanderCards(this.oracleId).subscribe({
      next: (c) => {
        this.cards = c.cards;
        this.totalDecks = c.totalDecks;
        this.cardsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cardsLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.api.getCommanderDecks(this.oracleId).subscribe({
      next: (d) => {
        this.decks = d;
        this.decksLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.decksLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadSuggestions(): void {
    if (this.suggestions || this.suggestionsLoading) return;
    this.showSuggestions = true;
    this.suggestionsLoading = true;
    this.cdr.markForCheck();

    this.api.getCommanderSuggestions(this.oracleId).subscribe({
      next: (s) => {
        this.suggestions = s;
        this.suggestionsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.suggestionsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setTab(tab: TypeTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }
  setSortMode(mode: SortMode): void {
    this.sortMode = mode;
    this.cdr.markForCheck();
  }

  cardZoomIn(): void {
    this.cardZoom = Math.min(2.0, +(this.cardZoom + 0.25).toFixed(2));
    this.cdr.markForCheck();
  }
  cardZoomOut(): void {
    this.cardZoom = Math.max(0.5, +(this.cardZoom - 0.25).toFixed(2));
    this.cdr.markForCheck();
  }
  get cardZoomLabel(): string {
    return Math.round(this.cardZoom * 100) + '%';
  }

  get filteredCards(): CommanderCardEntry[] {
    let list = this.cards;
    switch (this.activeTab) {
      case 'top':
        list = list.slice(0, 10);
        break;
      case 'gamechangers':
        list = list.filter((e) => e.isGameChanger);
        break;
      case 'creatures':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Creature));
        break;
      case 'instants':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Instant));
        break;
      case 'sorceries':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Sorcery));
        break;
      case 'enchantments':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Enchantment));
        break;
      case 'artifacts':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Artifact));
        break;
      case 'planeswalkers':
        list = list.filter((e) => e.card.cardTypes.includes(CardType.Planeswalker));
        break;
    }
    return [...list].sort((a, b) => {
      if (this.sortMode === 'name') return a.card.name.localeCompare(b.card.name);
      if (this.sortMode === 'mv') return a.card.manaValue - b.card.manaValue;
      return b.inclusionPercent - a.inclusionPercent;
    });
  }

  colorClass(c: string): string {
    const map: Record<string, string> = {
      W: 'pip-w',
      U: 'pip-u',
      B: 'pip-b',
      R: 'pip-r',
      G: 'pip-g',
      C: 'pip-c',
    };
    return map[c] ?? 'pip-c';
  }

  inclusionBarWidth(pct: number): string {
    return `${Math.min(pct, 100)}%`;
  }

  suggestionCards(key: keyof DeckSuggestionsDto): SuggestedCardDto[] {
    return (this.suggestions?.[key] as SuggestedCardDto[]) ?? [];
  }

  setDeckSort(s: DeckSort): void {
    this.deckSort = s;
    this.cdr.markForCheck();
  }
  setDeckBracket(b: BracketFilter): void {
    this.deckBracket = b;
    this.cdr.markForCheck();
  }
  setDeckSearch(q: string): void {
    this.deckSearch = q;
    this.cdr.markForCheck();
  }
  setDeckTag(t: string): void {
    this.deckTag = t === this.deckTag ? '' : t;
    this.cdr.markForCheck();
  }

  get availableTags(): string[] {
    const counts = new Map<string, number>();
    for (const deck of this.decks) {
      for (const tag of deck.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }

  get filteredDecks(): typeof this.decks {
    let list = this.decks;

    if (this.deckBracket !== 0) list = list.filter((d) => d.bracket === this.deckBracket);

    if (this.deckTag) list = list.filter((d) => d.tags.includes(this.deckTag));

    if (this.deckSearch.trim()) {
      const q = this.deckSearch.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          d.authorUsername.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (this.deckSort === 'oldest')
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      if (this.deckSort === 'bracket') return a.bracket - b.bracket;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(); // newest
    });
  }

  openCommanderCard(event: Event): void {
    if (!this.profile) return;
    const card: CardDto = {
      cardId: this.profile.oracleId,
      oracleId: this.profile.oracleId,
      name: this.profile.name,
      manaCost: this.profile.manaCost ?? '',
      manaValue: 0,
      cardTypes: [CardType.Creature],
      subtypes: [],
      supertypes: ['Legendary'],
      oracleText: this.profile.oracleText ?? '',
      power: null,
      toughness: null,
      startingLoyalty: null,
      keywords: [],
      imageUriNormal: this.profile.imageUri,
      imageUriNormalBack: null,
      imageUriSmall: this.profile.imageUri,
      imageUriArtCrop: this.profile.imageUriArtCrop,
      colorIdentity: this.profile.colorIdentity as any[],
      ownerId: '',
      flavorText: null,
      artist: null,
      setCode: null,
      rarity: null,
      legalities: {},
      gameChanger: false,
    };
    this.openCardModal(card, event);
  }

  openCardModal(card: CardDto, event: Event): void {
    event.preventDefault();
    this.modalCard = card;
    this.modalScryfallId = null;
    this.modalPrintings = [];
    this.modalFlipped = false;
    this.cdr.markForCheck();
    this.collectionApi.getPrintings(card.oracleId).subscribe({
      next: (p) => {
        this.modalPrintings = p;
        this.modalScryfallId = p[0]?.scryfallId ?? null;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  closeCardModal(): void {
    this.modalCard = null;
    this.modalPrintings = [];
    this.cdr.markForCheck();
  }

  scryfallUrl(name: string): string {
    return `https://scryfall.com/search?q=%21%22${encodeURIComponent(name)}%22`;
  }

  bracketLabel(b: number): string {
    return ['', 'Exhibition', 'Core', 'Advanced', 'Optimized'][b] ?? '';
  }

  bracketClass(b: number): string {
    return ['', 'bracket-1', 'bracket-2', 'bracket-3', 'bracket-4'][b] ?? '';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
