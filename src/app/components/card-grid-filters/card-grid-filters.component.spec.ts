import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { CardGridFiltersComponent } from './card-grid-filters.component';
import { CardFilters } from '../../models/card-filters';

/**
 * No TestBed: the bar's job is to mutate the caller's CardFilters and say so, which is
 * plain object behaviour. The layout it renders is verified in the browser.
 */
function make() {
  const marks = { count: 0 };
  const cdr = { markForCheck: () => marks.count++ } as unknown as ChangeDetectorRef;
  const el = document.createElement('div');
  // Runs callbacks straight through: nothing here goes near the resize observer.
  const zone = {
    run: <T>(fn: () => T) => fn(),
    runOutsideAngular: <T>(fn: () => T) => fn(),
  } as unknown as NgZone;
  const c = new CardGridFiltersComponent(cdr, new ElementRef(el), zone);
  c.filters = new CardFilters();
  const changes: number[] = [];
  c.filtersChange.subscribe(() => changes.push(1));
  return { c, marks, changes, el };
}

describe('CardGridFiltersComponent', () => {
  it('mutates the filters it was given rather than a copy of them', () => {
    const { c } = make();
    const given = c.filters;
    c.onToggleColor('G');
    c.onQuery('bolt');
    expect(given.colors.has('G')).toBeTrue();
    expect(given.query).toBe('bolt');
  });

  it('marks for check and announces every mutation — the page is OnPush', () => {
    const { c, marks, changes } = make();
    c.onToggleType('Creature');
    c.onToggleRarity('rare');
    c.onToggleCmc('3');
    c.onSort('cmc');
    c.onSortDir();
    c.onSet('dbl');
    c.onClear();
    expect(changes.length).toBe(7);
    expect(marks.count).toBe(7);
  });

  it('toggles rarity, which the grid filters on like any other facet', () => {
    const { c } = make();
    c.onToggleRarity('mythic');
    expect(c.filters.rarities.has('mythic')).toBeTrue();
    c.onToggleRarity('mythic');
    expect(c.filters.rarities.size).toBe(0);
  });

  it('reads the all-sets sentinel as "no set filter"', () => {
    const { c } = make();
    c.onSet('dbl');
    expect(c.filters.set).toBe('dbl');
    c.onSet('__all');
    expect(c.filters.set).toBeNull();
  });

  it('wraps single-select facets as one-entry sets for the chip rows', () => {
    const { c } = make();
    c.onToggleCmc('3');
    expect([...c.activeCmc]).toEqual(['3']);
    expect([...c.activeSort]).toEqual(['name']);
    expect([...c.filters.activeAsSet(null)]).toEqual([]);
  });

  it('flips the direction chip with the sort direction', () => {
    const { c } = make();
    expect(c.sortDirChips[0].label).toBe('▲');
    c.onSortDir();
    expect(c.sortDirChips[0].label).toBe('▼');
  });

  it('picking a suggestion sets the query, closes the menu and reports the name', () => {
    const { c } = make();
    const picked: string[] = [];
    c.suggestionPicked.subscribe((n) => picked.push(n));
    c.suggOpen = true;
    c.pick('Llanowar Elves');
    expect(c.filters.query).toBe('Llanowar Elves');
    expect(c.suggOpen).toBeFalse();
    expect(picked).toEqual(['Llanowar Elves']);
  });

  it('Enter takes the top suggestion, but only with a query and an open menu', () => {
    const { c } = make();
    c.suggestions = ['Ancestral Recall'];

    c.suggOpen = false;
    c.filters.query = 'anc';
    c.pickFirst();
    expect(c.filters.query).toBe('anc');

    c.suggOpen = true;
    c.filters.query = '   ';
    c.pickFirst();
    expect(c.filters.query).toBe('   ');

    c.filters.query = 'anc';
    c.pickFirst();
    expect(c.filters.query).toBe('Ancestral Recall');
  });

  it('typing reopens the suggestion menu', () => {
    const { c } = make();
    c.suggOpen = false;
    c.onQuery('bo');
    expect(c.suggOpen).toBeTrue();
  });

  // The controls menu — the layout CSS only shows it on a narrow bar, but its open state
  // and dismissal are this component's.

  it('closes the controls menu on a click outside it, but not on one inside', () => {
    const { c, el } = make();
    const inside = document.createElement('button');
    el.appendChild(inside);

    c.menuOpen = true;
    c.onDocClick({ target: inside } as unknown as MouseEvent);
    expect(c.menuOpen).toBeTrue();

    c.onDocClick({ target: document.createElement('div') } as unknown as MouseEvent);
    expect(c.menuOpen).toBeFalse();
  });

  it('closes the controls menu on Escape', () => {
    const { c } = make();
    c.menuOpen = true;
    c.onEscape();
    expect(c.menuOpen).toBeFalse();
  });

  it('clearing resets every facet, the query included', () => {
    const { c } = make();
    c.onQuery('bolt');
    c.onToggleColor('R');
    c.onToggleType('Instant');
    c.onToggleRarity('rare');
    c.onToggleCmc('1');
    c.onSet('lea');
    expect(c.filters.hasAny).toBeTrue();

    c.onClear();
    expect(c.filters.hasAny).toBeFalse();
    expect(c.filters.query).toBe('');
    expect(c.filters.rarities.size).toBe(0);
  });
});
