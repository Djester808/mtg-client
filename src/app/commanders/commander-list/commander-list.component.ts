import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommandersApiService } from '../../services/commanders-api.service';
import { CommanderSummary } from '../../models/commander.models';
import { ManaCostPipe } from '../../pipes/mana-cost.pipe';
import { SearchInputComponent } from '../../components/search-input/search-input.component';

@Component({
  selector: 'app-commander-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ManaCostPipe, SearchInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commander-list.component.html',
  styleUrls: ['./commander-list.component.scss'],
})
export class CommanderListComponent implements OnInit {
  commanders: CommanderSummary[] = [];
  loading = true;
  error: string | null = null;

  searchQuery = '';
  selectedColors = new Set<string>();
  dateMonths = 0;

  readonly colorOptions = ['W', 'U', 'B', 'R', 'G', 'C'];
  readonly datePresets: { label: string; months: number }[] = [
    { label: 'All', months: 0 },
    { label: '3M', months: 3 },
    { label: '6M', months: 6 },
    { label: '1Y', months: 12 },
    { label: '2Y', months: 24 },
  ];

  constructor(
    private api: CommandersApiService,
    readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCommanders();
  }

  loadCommanders(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    const q = this.searchQuery.trim();

    // With no query, show the community ranking. With one, search the whole card
    // corpus: the ranked list only holds commanders that already have a deck here,
    // so filtering it locally could never find most commanders.
    const source$ = q
      ? this.api.searchCommanders(q, 200)
      : this.api.getTopCommanders(200, this.dateMonths);

    source$.subscribe({
      next: (data) => {
        this.commanders = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Failed to load commanders.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Debouncing lives in the shared search box. */
  onSearchChanged(q: string): void {
    this.searchQuery = q;
    this.loadCommanders();
  }

  setDatePreset(months: number): void {
    if (this.dateMonths === months) return;
    this.dateMonths = months;
    this.loadCommanders();
  }

  get filteredCommanders(): CommanderSummary[] {
    // Name matching is done server-side now; only colour filtering stays local.
    return this.commanders.filter((cmd) => {
      if (this.selectedColors.size > 0) {
        const hasAll = [...this.selectedColors].every((c) => cmd.colorIdentity.includes(c));
        if (!hasAll) return false;
      }
      return true;
    });
  }

  get hasActiveFilters(): boolean {
    return !!this.searchQuery.trim() || this.selectedColors.size > 0 || this.dateMonths > 0;
  }

  toggleColor(c: string): void {
    this.selectedColors.has(c) ? this.selectedColors.delete(c) : this.selectedColors.add(c);
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    const hadQuery = !!this.searchQuery.trim();
    this.searchQuery = '';
    this.selectedColors.clear();
    // Clearing a search must reload: the results on screen came from the search
    // endpoint, not the ranked list, so dropping the query alone would leave them up.
    if (this.dateMonths !== 0 || hadQuery) {
      this.dateMonths = 0;
      this.loadCommanders();
    } else {
      this.cdr.markForCheck();
    }
  }

  manaClass(c: string): string {
    return `ms-${c.toLowerCase()}`;
  }
}
