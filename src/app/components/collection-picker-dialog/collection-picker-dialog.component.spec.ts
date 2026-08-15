import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CollectionPickerDialogComponent } from './collection-picker-dialog.component';
import { CollectionDto } from '../../models/game.models';

function col(id: string, name = id, cardCount = 0): CollectionDto {
  return {
    id,
    name,
    description: null,
    coverUri: null,
    cardCount,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('CollectionPickerDialogComponent', () => {
  let component: CollectionPickerDialogComponent;
  let fixture: ComponentFixture<CollectionPickerDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollectionPickerDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionPickerDialogComponent);
    component = fixture.componentInstance;
    component.targets = [col('a', 'Alpha'), col('b', 'Beta')];
  });

  it('starts with nothing selected so confirm cannot fire by accident', () => {
    expect(component.selectedId).toBeNull();
    spyOn(component.confirmed, 'emit');
    component.confirm();
    expect(component.confirmed.emit).not.toHaveBeenCalled();
  });

  it('emits the chosen target and the checkbox state', () => {
    spyOn(component.confirmed, 'emit');
    component.select('b');
    component.checked = true;
    component.confirm();
    expect(component.confirmed.emit).toHaveBeenCalledWith({ targetId: 'b', checked: true });
  });

  it('defaults the checkbox to off — the destructive option is opt-in', () => {
    spyOn(component.confirmed, 'emit');
    component.select('a');
    component.confirm();
    expect(component.confirmed.emit).toHaveBeenCalledWith({ targetId: 'a', checked: false });
  });

  it('closes on Escape', () => {
    spyOn(component.closed, 'emit');
    component.onEscape();
    expect(component.closed.emit).toHaveBeenCalled();
  });

  it('renders one row per target and marks the selected one', () => {
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.picker-target');
    expect(rows.length).toBe(2);

    component.select('a');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.picker-target.is-selected').length).toBe(1);
  });

  it('shows the empty text instead of an unusable list when there is nowhere to go', () => {
    component.targets = [];
    component.emptyText = 'Nowhere to move it.';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.picker-empty').textContent).toContain(
      'Nowhere to move it.',
    );
    expect(fixture.nativeElement.querySelector('.picker-target')).toBeNull();
  });

  // ---- search & cap ------------------------------------------

  const many = (n: number): CollectionDto[] =>
    Array.from({ length: n }, (_, i) => col(`id-${i}`, `Binder ${i}`));

  it('hides the search box for a short list and shows it for a long one', () => {
    component.targets = many(4);
    expect(component.showSearch).toBeFalse();
    component.targets = many(12);
    expect(component.showSearch).toBeTrue();
  });

  it('caps the rendered rows and reports how many are hidden', () => {
    component.targets = many(20);
    expect(component.visibleTargets.length).toBe(8);
    expect(component.hiddenCount).toBe(12);
  });

  it('filters by name, case-insensitively', () => {
    component.targets = [col('a', 'Modern Staples'), col('b', 'Commander Cube'), col('c', 'Bulk')];
    component.onSearch('comm');
    expect(component.visibleTargets.map((t) => t.id)).toEqual(['b']);
    expect(component.hiddenCount).toBe(0);
  });

  it('reports no matches rather than an empty list with no explanation', () => {
    component.targets = many(10);
    component.onSearch('nothing matches this');
    expect(component.visibleTargets).toEqual([]);
    expect(component.noMatches).toBeTrue();
  });

  it('does not claim "no matches" when there were never any targets', () => {
    component.targets = [];
    expect(component.noMatches).toBeFalse();
  });

  it('memoizes the filtered list on targets identity and search text', () => {
    component.targets = many(10);
    const first = component.visibleTargets;
    expect(component.visibleTargets).toEqual(first);
    component.onSearch('Binder 1');
    expect(component.visibleTargets.length).toBeLessThan(10);
  });

  it('hides the checkbox unless a label is supplied', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.picker-check')).toBeNull();

    // setInput, not a field write: the component is OnPush, so a bare assignment after
    // the first render leaves the view clean and nothing re-renders.
    fixture.componentRef.setInput('checkboxLabel', 'Delete afterwards');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.picker-check')).not.toBeNull();
  });
});
