import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CardSideListComponent } from './card-side-list.component';
import { CollectionCardDto } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function makeEntry(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'entry-1',
    oracleId: 'oracle-1',
    scryfallId: 'scry-1',
    quantity: 2,
    quantityFoil: 0,
    notes: null,
    board: 'main',
    addedAt: '2026-01-01T00:00:00Z',
    cardDetails: makeCard({ oracleId: 'oracle-1', name: 'Krenko, Mob Boss' }),
    ...overrides,
  };
}

describe('CardSideListComponent', () => {
  let fixture: ComponentFixture<CardSideListComponent>;
  let component: CardSideListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardSideListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardSideListComponent);
    component = fixture.componentInstance;
  });

  it('renders one row per entry with total quantity and name', () => {
    fixture.componentRef.setInput('cards', [makeEntry({ quantity: 2, quantityFoil: 1 })]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.side-list-row');
    expect(row).toBeTruthy();
    expect(row.getAttribute('data-oracle-id')).toBe('oracle-1');
    expect(row.querySelector('.row-qty').textContent.trim()).toBe('3x');
    expect(row.querySelector('.row-name').textContent).toContain('Krenko, Mob Boss');
  });

  it('shows separate normal and foil counts in foil mode', () => {
    fixture.componentRef.setInput('foilMode', true);
    fixture.componentRef.setInput('cards', [makeEntry({ quantity: 2, quantityFoil: 1 })]);
    fixture.detectChanges();

    const pills = fixture.nativeElement.querySelectorAll('.row-qty');
    expect(pills.length).toBe(2);
    expect(pills[0].textContent.trim()).toBe('2x');
    expect(pills[1].textContent.trim()).toBe('✦1');
  });

  it('expands the card preview on a single click, not the modal', fakeAsync(() => {
    // tick() does not advance performance.now(), so drive the click clock directly.
    let clock = 1000;
    spyOn(performance, 'now').and.callFake(() => clock);
    fixture.componentRef.setInput('cards', [makeEntry()]);
    fixture.detectChanges();
    const opened: CollectionCardDto[] = [];
    component.rowOpen.subscribe((c) => opened.push(c));

    fixture.nativeElement.querySelector('.side-list-row').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.row-card-preview')).toBeTruthy();
    expect(opened.length).toBe(0);

    // A later, unhurried click plays the exit animation, then removes the preview.
    clock = 2000;
    fixture.nativeElement.querySelector('.side-list-row').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.row-card-preview.is-closing')).toBeTruthy();
    tick(300);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.row-card-preview')).toBeFalsy();
    expect(opened.length).toBe(0);
  }));

  it('emits rowOpen on a quick double click and collapses the preview', fakeAsync(() => {
    fixture.componentRef.setInput('cards', [makeEntry()]);
    fixture.detectChanges();
    const opened: CollectionCardDto[] = [];
    component.rowOpen.subscribe((c) => opened.push(c));

    const row = fixture.nativeElement.querySelector('.side-list-row');
    row.click();
    row.click();
    fixture.detectChanges();
    expect(opened.length).toBe(1);
    expect(opened[0].oracleId).toBe('oracle-1');
    tick(300);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.row-card-preview')).toBeFalsy();
  }));

  it('never expands or opens from the quantity controls', () => {
    fixture.componentRef.setInput('cards', [makeEntry()]);
    fixture.detectChanges();
    const opened: CollectionCardDto[] = [];
    component.rowOpen.subscribe((c) => opened.push(c));

    fixture.nativeElement.querySelector('.row-ctrls').click();
    fixture.detectChanges();
    expect(opened.length).toBe(0);
    expect(fixture.nativeElement.querySelector('.row-card-preview')).toBeFalsy();
  });

  it('emits inc/dec for the plain pair and the foil pair', () => {
    fixture.componentRef.setInput('foilMode', true);
    fixture.componentRef.setInput('cards', [makeEntry({ quantity: 1, quantityFoil: 1 })]);
    fixture.detectChanges();
    const events: string[] = [];
    component.rowInc.subscribe(() => events.push('inc'));
    component.rowDec.subscribe(() => events.push('dec'));
    component.rowIncFoil.subscribe(() => events.push('incFoil'));
    component.rowDecFoil.subscribe(() => events.push('decFoil'));

    const btns = fixture.nativeElement.querySelectorAll('.row-btn');
    expect(btns.length).toBe(4);
    btns.forEach((b: HTMLButtonElement) => b.click());
    expect(events).toEqual(['dec', 'inc', 'decFoil', 'incFoil']);
  });

  it('pulses a row by oracle id and clears the pulse afterwards', fakeAsync(() => {
    fixture.componentRef.setInput('cards', [makeEntry()]);
    fixture.detectChanges();

    component.pulse('oracle-1');
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-list-row.is-pulsed')).toBeTruthy();

    tick(700);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-list-row.is-pulsed')).toBeFalsy();
  }));

  it('shows the empty text when there are no cards', () => {
    fixture.componentRef.setInput('emptyText', 'Nothing here');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-list-empty').textContent).toContain(
      'Nothing here',
    );
  });
});
