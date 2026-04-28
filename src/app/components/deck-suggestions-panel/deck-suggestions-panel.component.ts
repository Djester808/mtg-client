import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CardDto } from '../../models/game.models';
import { DeckDetailDto } from '../../services/deck-api.service';
import {
  DeckApiService, DeckSuggestionsDto, SuggestedCardDto,
} from '../../services/deck-api.service';
import { ManaCostComponent } from '../mana-cost/mana-cost.component';

export interface SuggestionCategory {
  key: keyof DeckSuggestionsDto;
  label: string;
  icon: string;
  accent: string;
}

@Component({
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  imports: [CommonModule, ManaCostComponent],
  templateUrl: './deck-suggestions-panel.component.html',
  styleUrls: ['./deck-suggestions-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckSuggestionsPanelComponent {
  @Input() deck: DeckDetailDto | null = null;
  @Input() commanderCard: CardDto | null = null;

  @Output() cardAdd   = new EventEmitter<{ oracleId: string; scryfallId: string }>();
  @Output() panelClose = new EventEmitter<void>();

  suggestions: DeckSuggestionsDto | null = null;
  loading = false;
  error: string | null = null;

  readonly categories: SuggestionCategory[] = [
    { key: 'latestSet',       label: 'New from Latest Sets', icon: 'bi-stars',        accent: '#818cf8' },
    { key: 'topSynergy',      label: 'Top Synergy',          icon: 'bi-lightning',     accent: '#4ade80' },
    { key: 'gameChangers',    label: 'Game Changers',         icon: 'bi-trophy',        accent: '#fb923c' },
    { key: 'notableMentions', label: 'Notable Mentions',      icon: 'bi-bookmark-star', accent: 'var(--gold)' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private deckApi: DeckApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  generate(): void {
    if (!this.commanderCard || !this.deck) return;
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
        this.suggestions = result;
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  addCard(s: SuggestedCardDto): void {
    if (!s.card || !s.scryfallId) return;
    this.cardAdd.emit({ oracleId: s.card.oracleId, scryfallId: s.scryfallId });
  }

  close(): void { this.panelClose.emit(); }

  cardsFor(key: keyof DeckSuggestionsDto): SuggestedCardDto[] {
    return this.suggestions?.[key] ?? [];
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
