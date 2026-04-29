import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { of, throwError } from 'rxjs';
import { ManaSuggestPanelComponent } from './mana-suggest-panel.component';
import { DeckApiService, DeckDetailDto, ManaFineTuneDto } from '../../services/deck-api.service';
import { CollectionCardDto, CardType, ManaColor } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeDeckCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'coll-1',
    oracleId: 'oracle-1',
    scryfallId: null,
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    addedAt: new Date().toISOString(),
    cardDetails: makeCard(),
    ...overrides,
  };
}

function makeDeck(overrides: Partial<DeckDetailDto> = {}): DeckDetailDto {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    coverUri: null,
    format: 'commander',
    commanderOracleId: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cards: [],
    ...overrides,
  };
}

function makeSpell(name: string, manaCost: string, manaValue: number): CollectionCardDto {
  return makeDeckCard({
    id: name,
    oracleId: name,
    cardDetails: makeCard({ name, manaCost, manaValue, cardTypes: [CardType.Creature] }),
  });
}

function makeLand(name: string): CollectionCardDto {
  return makeDeckCard({
    id: name,
    oracleId: name,
    cardDetails: makeCard({ name, manaCost: '', manaValue: 0, cardTypes: [CardType.Land] }),
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function makeApiSpy() {
  return jasmine.createSpyObj<DeckApiService>('DeckApiService', ['getManaFineTune']);
}

async function setup(deckApiSpy = makeApiSpy()) {
  await TestBed.configureTestingModule({
    imports: [ManaSuggestPanelComponent, CommonModule],
    providers: [{ provide: DeckApiService, useValue: deckApiSpy }],
  }).compileComponents();

  const fixture = TestBed.createComponent(ManaSuggestPanelComponent);
  const component = fixture.componentInstance;
  return { fixture, component, deckApiSpy };
}

// ── analysis getter: empty states ─────────────────────────────────────────────

describe('ManaSuggestPanelComponent — analysis: empty', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns isEmpty=true when deck is null', async () => {
    const { component } = await setup();
    component.deck = null;
    expect(component.analysis.isEmpty).toBeTrue();
  });

  it('returns isEmpty=true when deck has no cards', async () => {
    const { component } = await setup();
    component.deck = makeDeck({ cards: [] });
    expect(component.analysis.isEmpty).toBeTrue();
  });
});

// ── analysis getter: land count ───────────────────────────────────────────────

describe('ManaSuggestPanelComponent — analysis: land count', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('counts current lands correctly', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [
        makeSpell('Sol Ring', '{1}', 1),
        makeLand('Forest'),
        makeLand('Island'),
      ],
    });
    expect(component.analysis.currentLands).toBe(2);
  });

  it('counts foil lands in currentLands total', async () => {
    const { component } = await setup();
    const foilLand = makeDeckCard({
      id: 'foil-land',
      oracleId: 'foil-land',
      quantity: 0,
      quantityFoil: 3,
      cardDetails: makeCard({ name: 'Forest', manaCost: '', manaValue: 0, cardTypes: [CardType.Land] }),
    });
    component.deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1), foilLand] });
    expect(component.analysis.currentLands).toBe(3);
  });

  it('recommends 36 lands for commander format', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      format: 'commander',
      cards: [makeSpell('Three Drop', '{2}{G}', 3)],
    });
    expect(component.analysis.recommendedLands).toBe(36);
  });

  it('recommends 24 lands for standard format', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      format: 'standard',
      cards: [makeSpell('Three Drop', '{2}{G}', 3)],
    });
    expect(component.analysis.recommendedLands).toBe(24);
  });

  it('reduces recommendation by 2 for very low avg CMC (< 2.0)', async () => {
    const { component } = await setup();
    // One 1-mana spell → avg CMC = 1.0
    component.deck = makeDeck({
      format: 'standard',
      cards: [makeSpell('One Drop', '{G}', 1)],
    });
    expect(component.analysis.recommendedLands).toBe(22);
  });

  it('increases recommendation by 2 for high avg CMC (>= 4.0)', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      format: 'standard',
      cards: [makeSpell('Big Spell', '{3}{G}{G}', 5)],
    });
    expect(component.analysis.recommendedLands).toBe(26);
  });

  it('landDelta equals recommendedLands minus currentLands', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      format: 'commander',
      cards: [makeSpell('Three Drop', '{2}{G}', 3), makeLand('Forest'), makeLand('Island')],
    });
    const a = component.analysis;
    expect(a.landDelta).toBe(a.recommendedLands - a.currentLands);
  });
});

// ── analysis getter: avg CMC ──────────────────────────────────────────────────

describe('ManaSuggestPanelComponent — analysis: avgCmc', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('calculates weighted average CMC across non-land cards', async () => {
    const { component } = await setup();
    // Two 2-drops and one 4-drop: (2+2+4)/3 = 2.67
    component.deck = makeDeck({
      cards: [
        makeSpell('Two Drop A', '{1}{G}', 2),
        makeSpell('Two Drop B', '{1}{G}', 2),
        makeSpell('Four Drop', '{3}{G}', 4),
      ],
    });
    expect(component.analysis.avgCmc).toBeCloseTo(2.67, 1);
  });

  it('excludes lands from avgCmc calculation', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [
        makeSpell('Two Drop', '{1}{G}', 2),
        makeLand('Forest'),
      ],
    });
    expect(component.analysis.avgCmc).toBe(2);
  });
});

// ── analysis getter: color sources ───────────────────────────────────────────

describe('ManaSuggestPanelComponent — analysis: colorSources', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('identifies active colors from mana costs', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [
        makeSpell('Lightning Bolt', '{R}', 1),
        makeSpell('Counterspell', '{U}{U}', 2),
      ],
    });
    const colors = component.analysis.colorSources.map(cs => cs.color).sort();
    expect(colors).toEqual(['R', 'U']);
  });

  it('sorts colorSources descending by pip count', async () => {
    const { component } = await setup();
    // UU > R → blue first
    component.deck = makeDeck({
      cards: [
        makeSpell('Lightning Bolt', '{R}', 1),
        makeSpell('Counterspell', '{U}{U}', 2),
      ],
    });
    const pips = component.analysis.colorSources.map(cs => cs.pips);
    for (let i = 1; i < pips.length; i++) {
      expect(pips[i]).toBeLessThanOrEqual(pips[i - 1]);
    }
  });

  it('color percentages sum to approximately 100%', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [
        makeSpell('Bolt', '{R}', 1),
        makeSpell('Growth', '{G}', 1),
        makeSpell('Spell', '{U}', 1),
      ],
    });
    const totalPct = component.analysis.colorSources.reduce((s, cs) => s + cs.pct, 0);
    expect(totalPct).toBeCloseTo(1.0, 5);
  });

  it('returns no colorSources for colorless-only deck', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [makeSpell('Sol Ring', '{1}', 1)],
    });
    expect(component.analysis.colorSources).toEqual([]);
  });
});

// ── landDeltaLabel & landDeltaClass ───────────────────────────────────────────

describe('ManaSuggestPanelComponent — landDeltaLabel & landDeltaClass', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows "Land count looks good" and delta--ok when delta is 0', async () => {
    const { component } = await setup();
    // standard format, avg CMC 3.0 → recommended 24; add exactly 24 lands
    component.deck = makeDeck({
      format: 'standard',
      cards: [
        makeSpell('Three Drop', '{2}{G}', 3),
        ...Array.from({ length: 24 }, (_, i) => makeLand(`Land${i}`)),
      ],
    });
    expect(component.landDeltaLabel).toContain('looks good');
    expect(component.landDeltaClass).toBe('delta--ok');
  });

  it('shows "+N more lands suggested" and delta--low when lands are insufficient', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      format: 'standard',
      cards: [makeSpell('Three Drop', '{2}{G}', 3)],  // 0 lands, recommended 24
    });
    expect(component.landDeltaLabel).toMatch(/^\+\d+ more lands suggested$/);
    expect(component.landDeltaClass).toBe('delta--low');
  });

  it('shows "N fewer lands suggested" and delta--high when too many lands', async () => {
    const { component } = await setup();
    // standard format + low curve → recommended 22; add 30 lands
    component.deck = makeDeck({
      format: 'standard',
      cards: [
        makeSpell('One Drop', '{G}', 1),
        ...Array.from({ length: 30 }, (_, i) => makeLand(`Land${i}`)),
      ],
    });
    expect(component.landDeltaLabel).toMatch(/^\d+ fewer lands suggested$/);
    expect(component.landDeltaClass).toBe('delta--high');
  });
});

// ── barPct ────────────────────────────────────────────────────────────────────

describe('ManaSuggestPanelComponent — barPct', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns 0–100 integer for a color source', async () => {
    const { component } = await setup();
    component.deck = makeDeck({
      cards: [makeSpell('Bolt', '{R}', 1), makeSpell('Spell', '{U}', 1)],
    });
    for (const cs of component.analysis.colorSources) {
      const pct = component.barPct(cs);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      expect(Number.isInteger(pct)).toBeTrue();
    }
  });
});

// ── AI auto-trigger ───────────────────────────────────────────────────────────

describe('ManaSuggestPanelComponent — AI auto-trigger', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('calls getManaFineTune after 1200ms debounce when deck is set', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: [], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1)] });
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    expect(spy.getManaFineTune).toHaveBeenCalledTimes(1);
  }));

  it('does not call getManaFineTune before debounce elapses', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: [], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1)] });
    component.ngOnChanges({ deck: {} as any });
    tick(800);

    expect(spy.getManaFineTune).not.toHaveBeenCalled();

    // Drain the remaining debounce timer so fakeAsync doesn't complain about pending timers
    tick(500);
  }));

  it('does not call getManaFineTune when deck is empty', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: [], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({ cards: [] });
    component.ngOnChanges({ deck: {} as any });
    tick(1500);

    expect(spy.getManaFineTune).not.toHaveBeenCalled();
  }));

  it('passes correct request fields to getManaFineTune', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: [], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({
      format: 'commander',
      cards: [makeSpell('Counterspell', '{U}{U}', 2), makeLand('Island')],
    });
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    const req = spy.getManaFineTune.calls.mostRecent().args[0];
    expect(req.format).toBe('commander');
    expect(req.currentLands).toBe(1);
    expect(req.avgCmc).toBe(2);
    expect(req.activeColors).toContain('U');
  }));

  it('sets fineTuneState to done and stores result on success', fakeAsync(async () => {
    const result: ManaFineTuneDto = {
      advice: ['Add fetch lands'],
      landSuggestions: [{ name: 'Flooded Strand', reason: 'Fixes blue' }],
    };
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of(result));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1)] });
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    expect(component.fineTuneState).toBe('done');
    expect(component.fineTuneResult).toEqual(result);
  }));

  it('sets fineTuneState to error on API failure', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(throwError(() => new Error('500')));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    component.deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1)] });
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    expect(component.fineTuneState).toBe('error');
    expect(component.fineTuneResult).toBeNull();
  }));

  it('cancels in-flight request when deck changes again within debounce', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: ['tip'], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    const deckA = makeDeck({ id: 'deck-a', cards: [makeSpell('Sol Ring', '{1}', 1)] });
    const deckB = makeDeck({ id: 'deck-b', cards: [makeSpell('Bolt', '{R}', 1)] });

    component.deck = deckA;
    component.ngOnChanges({ deck: {} as any });
    tick(600);

    component.deck = deckB;
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    // Only one call — the first was cancelled by switchMap
    expect(spy.getManaFineTune).toHaveBeenCalledTimes(1);
  }));

  it('skips duplicate deck (same card list) via distinctUntilChanged', fakeAsync(async () => {
    const spy = makeApiSpy();
    spy.getManaFineTune.and.returnValue(of({ advice: [], landSuggestions: [] }));
    const { component, fixture } = await setup(spy);
    fixture.detectChanges();

    const deck = makeDeck({ cards: [makeSpell('Sol Ring', '{1}', 1)] });

    component.deck = deck;
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    // Same deck again
    component.deck = { ...deck };
    component.ngOnChanges({ deck: {} as any });
    tick(1200);

    expect(spy.getManaFineTune).toHaveBeenCalledTimes(1);
  }));
});
