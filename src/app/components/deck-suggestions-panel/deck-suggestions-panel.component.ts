import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CardDto, PrintingDto } from '../../models/game.models';
import { DeckDetailDto } from '../../services/deck-api.service';
import {
  DeckApiService, DeckSuggestionsDto, SuggestedCardDto,
} from '../../services/deck-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';
import { CardModalComponent } from '../card-modal/card-modal.component';

export interface SuggestionCategory {
  key: keyof DeckSuggestionsDto;
  label: string;
  icon: string;
  accent: string;
}

@Component({
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ManaCostComponent, CardModalComponent],
  templateUrl: './deck-suggestions-panel.component.html',
  styleUrls: ['./deck-suggestions-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckSuggestionsPanelComponent {
  @Input() deck: DeckDetailDto | null = null;
  @Input() commanderCard: CardDto | null = null;

  @Output() cardAdd    = new EventEmitter<{ oracleId: string; scryfallId: string }>();
  @Output() cardRemove = new EventEmitter<string>(); // emits oracleId
  @Output() panelClose = new EventEmitter<void>();

  suggestions: DeckSuggestionsDto | null = null;
  loading = false;
  error: string | null = null;

  // Suggestion fine-tuning tags
  suggestionTags: string[] = [];
  tagDraft = '';

  // Card detail modal
  selectedSuggestion: SuggestedCardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;

  readonly categories: SuggestionCategory[] = [
    { key: 'latestSet',       label: 'New from Latest Sets', icon: 'bi-stars',        accent: '#818cf8' },
    { key: 'topSynergy',      label: 'Top Synergy',          icon: 'bi-lightning',     accent: '#4ade80' },
    { key: 'gameChangers',    label: 'Game Changers',         icon: 'bi-trophy',        accent: '#fb923c' },
    { key: 'notableMentions', label: 'Notable Mentions',      icon: 'bi-bookmark-star', accent: 'var(--gold)' },
  ];

  private destroy$ = new Subject<void>();
  private printingsCache = new Map<string, PrintingDto[]>();
  private suggestionsCache = new Map<string, DeckSuggestionsDto>();

  constructor(
    private deckApi: DeckApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  addSuggestionTag(tag: string): void {
    const t = tag.trim().toLowerCase();
    if (!t || this.suggestionTags.includes(t)) return;
    this.suggestionTags = [...this.suggestionTags, t];
    this.tagDraft = '';
    this.cdr.markForCheck();
  }

  removeSuggestionTag(tag: string): void {
    this.suggestionTags = this.suggestionTags.filter(t => t !== tag);
    this.cdr.markForCheck();
  }

  commitTagInput(): void {
    if (this.tagDraft.trim()) this.addSuggestionTag(this.tagDraft);
  }

  private cacheKey(): string {
    if (!this.commanderCard || !this.deck) return '';
    const deckNames = (this.deck.cards ?? [])
      .filter(c => c.cardDetails?.oracleId !== this.commanderCard?.oracleId)
      .map(c => c.cardDetails?.name)
      .filter((n): n is string => !!n)
      .sort()
      .join(',');
    const tagsKey = [...(this.deck.tags ?? []), ...this.suggestionTags].sort().join(',');
    return `${this.commanderCard.oracleId}:${deckNames}:${tagsKey}`;
  }

  generate(): void {
    if (!this.commanderCard || !this.deck) return;

    const key = this.cacheKey();

    // Use cache only on first generate; regenerate (suggestions already shown) always fetches fresh
    if (!this.suggestions) {
      const cached = this.suggestionsCache.get(key);
      if (cached) {
        this.suggestions = cached;
        this.cdr.markForCheck();
        return;
      }
    }

    // Remove stale cache so the fresh result replaces it
    this.suggestionsCache.delete(key);
    this.loading = true;
    this.error   = null;
    this.suggestions = null;
    this.cdr.markForCheck();

    const deckCardNames = (this.deck.cards ?? [])
      .filter(c => c.cardDetails?.oracleId !== this.commanderCard?.oracleId)
      .map(c => c.cardDetails?.name)
      .filter((n): n is string => !!n);

    this.deckApi.getSuggestions({
      commanderOracleId: this.commanderCard.oracleId,
      commanderName:     this.commanderCard.name,
      commanderText:     this.commanderCard.oracleText,
      deckCardNames,
      deckTags:        this.deck.tags ?? [],
      suggestionTags:  this.suggestionTags,
    }).pipe(
      takeUntil(this.destroy$),
      catchError(() => {
        this.error = 'Failed to generate suggestions. Try again.';
        this.loading = false;
        this.cdr.markForCheck();
        return of(null);
      }),
    ).subscribe(result => {
      if (result) {
        this.suggestionsCache.set(key, result);
        this.suggestions = result;
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  openDetail(s: SuggestedCardDto, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedSuggestion = s;
    this.modalFlipped = false;

    const oracleId = s.card?.oracleId;
    if (!oracleId) {
      this.modalPrintings = [];
      this.modalViewScryfallId = s.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    const cached = this.printingsCache.get(oracleId);
    if (cached) {
      this.modalPrintings = cached;
      this.modalViewScryfallId = s.scryfallId ?? cached[0]?.scryfallId ?? null;
      this.cdr.markForCheck();
      return;
    }

    this.modalPrintings = [];
    this.modalViewScryfallId = s.scryfallId ?? null;
    this.cdr.markForCheck();

    this.deckApi.getPrintings(oracleId).pipe(
      takeUntil(this.destroy$),
    ).subscribe(printings => {
      this.printingsCache.set(oracleId, printings);
      if (this.selectedSuggestion?.card?.oracleId === oracleId) {
        this.modalPrintings = printings;
        if (!this.modalViewScryfallId && printings.length)
          this.modalViewScryfallId = printings[0].scryfallId;
        this.cdr.markForCheck();
      }
    });
  }

  closeDetail(): void {
    this.selectedSuggestion = null;
    this.cdr.markForCheck();
  }

  isInDeck(s: SuggestedCardDto): boolean {
    if (!s.card?.oracleId) return false;
    return (this.deck?.cards ?? []).some(c => c.cardDetails?.oracleId === s.card!.oracleId);
  }

  addCard(s: SuggestedCardDto): void {
    if (!s.card || !s.scryfallId) return;
    this.cardAdd.emit({ oracleId: s.card.oracleId, scryfallId: s.scryfallId });
  }

  removeCard(s: SuggestedCardDto): void {
    if (!s.card?.oracleId) return;
    this.cardRemove.emit(s.card.oracleId);
  }

  addAndClose(s: SuggestedCardDto): void {
    this.addCard(s);
    this.closeDetail();
  }

  removeAndClose(s: SuggestedCardDto): void {
    this.removeCard(s);
    this.closeDetail();
  }

  close(): void { this.panelClose.emit(); }

  cardsFor(key: keyof DeckSuggestionsDto): SuggestedCardDto[] {
    return this.suggestions?.[key] ?? [];
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
