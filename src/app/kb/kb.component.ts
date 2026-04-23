import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';

export interface KbKeyword {
  name: string;
  status: 'implemented' | 'partial' | 'stub';
  description: string;
  rulesRef: string;
}

export interface KbStep {
  name: string;
  description: string;
}

export interface KbMechanic {
  name: string;
  description: string;
  steps?: KbStep[];
}

export interface KbSba {
  rulesRef: string;
  description: string;
  status: 'implemented' | 'stub';
}

export interface KbDto {
  keywords: KbKeyword[];
  mechanics: KbMechanic[];
  stateBasedActions: KbSba[];
}

export type KbEntry =
  | { kind: 'keyword';  data: KbKeyword }
  | { kind: 'mechanic'; data: KbMechanic }
  | { kind: 'sba';      data: KbSba };

function entryLabel(e: KbEntry): string {
  return e.kind === 'sba' ? e.data.rulesRef : e.data.name;
}

function entryMatchesQuery(e: KbEntry, q: string): boolean {
  const lower = q.toLowerCase();
  if (e.kind === 'keyword') {
    return e.data.name.toLowerCase().includes(lower)
      || e.data.description.toLowerCase().includes(lower)
      || e.data.rulesRef.toLowerCase().includes(lower);
  }
  if (e.kind === 'mechanic') {
    if (e.data.name.toLowerCase().includes(lower) || e.data.description.toLowerCase().includes(lower)) return true;
    return !!e.data.steps?.some(s => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower));
  }
  return e.data.rulesRef.toLowerCase().includes(lower) || e.data.description.toLowerCase().includes(lower);
}

@Component({
  selector: 'app-kb',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kb.component.html',
  styleUrls: ['./kb.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KbComponent implements OnInit {
  kb: KbDto | null = null;
  searchQuery = '';
  selected: KbEntry | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const kwParam = this.route.snapshot.queryParamMap.get('kw');
    this.http.get<KbDto>('/api/rules').subscribe({
      next: data => {
        this.kb = data;
        if (kwParam) {
          const match = data.keywords.find(k => k.name.toLowerCase() === kwParam.toLowerCase());
          this.selected = match
            ? { kind: 'keyword', data: match }
            : { kind: 'keyword', data: data.keywords[0] };
        } else if (data.keywords.length) {
          this.selected = { kind: 'keyword', data: data.keywords[0] };
        }
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); },
    });
  }

  get allEntries(): KbEntry[] {
    if (!this.kb) return [];
    return [
      ...this.kb.keywords.map(d => ({ kind: 'keyword' as const, data: d })),
      ...this.kb.mechanics.map(d => ({ kind: 'mechanic' as const, data: d })),
      ...this.kb.stateBasedActions.map(d => ({ kind: 'sba' as const, data: d })),
    ];
  }

  get filteredKeywords(): KbEntry[] { return this.filtered('keyword'); }
  get filteredMechanics(): KbEntry[] { return this.filtered('mechanic'); }
  get filteredSba(): KbEntry[] { return this.filtered('sba'); }

  get totalFiltered(): number {
    return this.filteredKeywords.length + this.filteredMechanics.length + this.filteredSba.length;
  }

  private filtered(kind: KbEntry['kind']): KbEntry[] {
    const q = this.searchQuery.trim();
    const entries = this.allEntries.filter(e => e.kind === kind);
    return q ? entries.filter(e => entryMatchesQuery(e, q)) : entries;
  }

  select(entry: KbEntry): void {
    this.selected = entry;
  }

  isSelected(entry: KbEntry): boolean {
    if (!this.selected || this.selected.kind !== entry.kind) return false;
    return entryLabel(this.selected) === entryLabel(entry);
  }

  labelOf(e: KbEntry): string { return entryLabel(e); }

  clearSearch(): void {
    this.searchQuery = '';
    this.cdr.markForCheck();
  }

  back(): void {
    this.router.navigate(['/']);
  }
}
