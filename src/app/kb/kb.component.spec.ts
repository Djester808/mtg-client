import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { KbComponent, KbDto, KbEntry } from './kb.component';

// ---- Minimal mock data ------------------------------------

const MOCK_KB: KbDto = {
  keywords: [
    { name: 'Flying',    status: 'implemented', description: 'Can only be blocked by flyers or reach.',  rulesRef: 'CR 702.9'  },
    { name: 'Trample',   status: 'implemented', description: 'Excess damage goes to defending player.',  rulesRef: 'CR 702.19' },
    { name: 'Hexproof',  status: 'stub',        description: 'Cannot be targeted by opponents.',         rulesRef: 'CR 702.11' },
    { name: 'Menace',    status: 'partial',     description: 'Must be blocked by two or more.',          rulesRef: 'CR 702.110'},
  ],
  mechanics: [
    {
      name: 'Turn Structure',
      description: 'Five phases, twelve steps.',
      steps: [
        { name: 'Untap',  description: 'Untap all permanents.' },
        { name: 'Upkeep', description: 'Priority window.' },
        { name: 'Draw',   description: 'Draw a card.' },
      ],
    },
    {
      name: 'Zones',
      description: 'Seven distinct zones.',
      steps: [
        { name: 'Library',   description: 'Shuffled deck.' },
        { name: 'Hand',      description: 'Cards held.' },
      ],
    },
  ],
  stateBasedActions: [
    { rulesRef: 'CR 704.5a', description: 'Player with 0 or less life loses.', status: 'implemented' },
    { rulesRef: 'CR 704.5i', description: 'Aura with no legal target.',         status: 'stub'        },
  ],
};

// ---- Helpers ----------------------------------------------

function setup() {
  TestBed.configureTestingModule({
    imports: [
      KbComponent,
      HttpClientTestingModule,
      RouterTestingModule,
    ],
    schemas: [NO_ERRORS_SCHEMA],
  });

  const fixture = TestBed.createComponent(KbComponent);
  const component = fixture.componentInstance;
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);

  return { fixture, component, http, router };
}

function flush(http: HttpTestingController, fixture: ComponentFixture<KbComponent>): void {
  http.expectOne('/api/rules').flush(MOCK_KB);
  fixture.detectChanges();
}

// ===========================================================
// Tests
// ===========================================================

describe('KbComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  // ---- creation & HTTP ------------------------------------

  it('creates the component', () => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    expect(component).toBeTruthy();
    http.expectOne('/api/rules').flush(MOCK_KB);
  });

  it('calls GET /api/rules on init', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    const req = http.expectOne('/api/rules');
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_KB);
  });

  it('populates kb after successful response', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    expect(component.kb).toEqual(MOCK_KB);
  }));

  it('auto-selects the first keyword on load', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    expect(component.selected).not.toBeNull();
    expect(component.selected?.kind).toBe('keyword');
    expect((component.selected!.data as any).name).toBe('Flying');
  }));

  it('leaves kb null on HTTP error', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    http.expectOne('/api/rules').error(new ProgressEvent('error'));
    fixture.detectChanges();
    tick();
    expect(component.kb).toBeNull();
  }));

  // ---- allEntries -----------------------------------------

  it('allEntries returns empty array before data loads', () => {
    const { component } = setup();
    // detectChanges not called — ngOnInit hasn't fired, kb is still null
    expect(component.allEntries).toEqual([]);
  });

  it('allEntries combines all three categories after load', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const total = MOCK_KB.keywords.length + MOCK_KB.mechanics.length + MOCK_KB.stateBasedActions.length;
    expect(component.allEntries.length).toBe(total);
  }));

  it('allEntries contains correct kinds', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const kinds = component.allEntries.map(e => e.kind);
    expect(kinds.filter(k => k === 'keyword').length).toBe(MOCK_KB.keywords.length);
    expect(kinds.filter(k => k === 'mechanic').length).toBe(MOCK_KB.mechanics.length);
    expect(kinds.filter(k => k === 'sba').length).toBe(MOCK_KB.stateBasedActions.length);
  }));

  // ---- filteredKeywords (no query) -----------------------

  it('filteredKeywords returns all keywords when query is empty', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    expect(component.filteredKeywords.length).toBe(MOCK_KB.keywords.length);
  }));

  // ---- filteredKeywords (with query) ---------------------

  it('filteredKeywords filters by keyword name (case-insensitive)', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'fly';
    expect(component.filteredKeywords.length).toBe(1);
    expect((component.filteredKeywords[0].data as any).name).toBe('Flying');
  }));

  it('filteredKeywords filters by description text', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'excess damage';
    expect(component.filteredKeywords.length).toBe(1);
    expect((component.filteredKeywords[0].data as any).name).toBe('Trample');
  }));

  it('filteredKeywords filters by rulesRef', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = '702.19';
    expect(component.filteredKeywords.length).toBe(1);
    expect((component.filteredKeywords[0].data as any).name).toBe('Trample');
  }));

  it('filteredKeywords returns empty when no keywords match', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'zzznomatch';
    expect(component.filteredKeywords.length).toBe(0);
  }));

  // ---- filteredMechanics ---------------------------------

  it('filteredMechanics returns all mechanics when query is empty', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    expect(component.filteredMechanics.length).toBe(MOCK_KB.mechanics.length);
  }));

  it('filteredMechanics filters by mechanic name', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'turn structure';
    expect(component.filteredMechanics.length).toBe(1);
    expect((component.filteredMechanics[0].data as any).name).toBe('Turn Structure');
  }));

  it('filteredMechanics filters by step name', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'untap';
    expect(component.filteredMechanics.length).toBe(1);
    expect((component.filteredMechanics[0].data as any).name).toBe('Turn Structure');
  }));

  it('filteredMechanics filters by step description text', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'priority window';
    // Turn Structure has "Upkeep - Priority window." as a step description
    expect(component.filteredMechanics.length).toBeGreaterThanOrEqual(1);
  }));

  // ---- filteredSba ----------------------------------------

  it('filteredSba returns all SBAs when query is empty', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    expect(component.filteredSba.length).toBe(MOCK_KB.stateBasedActions.length);
  }));

  it('filteredSba filters by rulesRef', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = '704.5a';
    expect(component.filteredSba.length).toBe(1);
    expect((component.filteredSba[0].data as any).rulesRef).toBe('CR 704.5a');
  }));

  it('filteredSba filters by description', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = '0 or less life';
    expect(component.filteredSba.length).toBe(1);
  }));

  // ---- totalFiltered -------------------------------------

  it('totalFiltered is full count when query is empty', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const total = MOCK_KB.keywords.length + MOCK_KB.mechanics.length + MOCK_KB.stateBasedActions.length;
    expect(component.totalFiltered).toBe(total);
  }));

  it('totalFiltered is zero when no entries match', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'zzznomatch';
    expect(component.totalFiltered).toBe(0);
  }));

  it('totalFiltered counts across all three categories', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    // "library" appears in Zones step name — only mechanics should match
    component.searchQuery = 'library';
    expect(component.totalFiltered).toBeGreaterThanOrEqual(1);
    expect(component.filteredKeywords.length + component.filteredMechanics.length + component.filteredSba.length)
      .toBe(component.totalFiltered);
  }));

  // ---- clearSearch ---------------------------------------

  it('clearSearch resets searchQuery to empty string', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'fly';
    component.clearSearch();
    expect(component.searchQuery).toBe('');
  }));

  it('clearSearch restores all entries', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    component.searchQuery = 'fly';
    component.clearSearch();
    expect(component.filteredKeywords.length).toBe(MOCK_KB.keywords.length);
  }));

  // ---- select / isSelected --------------------------------

  it('select updates the selected entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const trample: KbEntry = { kind: 'keyword', data: MOCK_KB.keywords[1] };
    component.select(trample);
    expect(component.selected).toEqual(trample);
  }));

  it('isSelected returns true for the currently selected entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const trample: KbEntry = { kind: 'keyword', data: MOCK_KB.keywords[1] };
    component.select(trample);
    expect(component.isSelected(trample)).toBeTrue();
  }));

  it('isSelected returns false for a different entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const flying:  KbEntry = { kind: 'keyword', data: MOCK_KB.keywords[0] };
    const trample: KbEntry = { kind: 'keyword', data: MOCK_KB.keywords[1] };
    component.select(flying);
    expect(component.isSelected(trample)).toBeFalse();
  }));

  it('isSelected returns false when kinds differ', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const kwEntry:  KbEntry = { kind: 'keyword',  data: MOCK_KB.keywords[0] };
    const sbaEntry: KbEntry = { kind: 'sba',       data: MOCK_KB.stateBasedActions[0] };
    component.select(kwEntry);
    expect(component.isSelected(sbaEntry)).toBeFalse();
  }));

  // ---- labelOf --------------------------------------------

  it('labelOf returns name for keyword entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const e: KbEntry = { kind: 'keyword', data: MOCK_KB.keywords[0] };
    expect(component.labelOf(e)).toBe('Flying');
  }));

  it('labelOf returns name for mechanic entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const e: KbEntry = { kind: 'mechanic', data: MOCK_KB.mechanics[0] };
    expect(component.labelOf(e)).toBe('Turn Structure');
  }));

  it('labelOf returns rulesRef for sba entry', fakeAsync(() => {
    const { fixture, component, http } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    const e: KbEntry = { kind: 'sba', data: MOCK_KB.stateBasedActions[0] };
    expect(component.labelOf(e)).toBe('CR 704.5a');
  }));

  // ---- navigation -----------------------------------------

  it('back navigates to /', fakeAsync(() => {
    const { fixture, component, http, router } = setup();
    fixture.detectChanges();
    flush(http, fixture);
    tick();
    spyOn(router, 'navigate');
    component.back();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  }));
});
