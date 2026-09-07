import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { throwError } from 'rxjs';
import { CardDisputesComponent } from './card-disputes.component';
import { CardDisputeDiffService } from './card-dispute-diff.service';
import {
  CardImplementationApiService,
  CardImplementationApiStub,
  DisputedCard,
} from '../../services/card-implementation-api.service';

/**
 * The queue, from the readings on screen to the POST that settles one.
 *
 * The real `CardDisputeDiffService` is used rather than a spy: what is worth proving is that the
 * highlighted line reaches the DOM, and a spied renderer would pass with a component that never
 * rendered a line at all.
 */
describe('CardDisputesComponent', () => {
  let fixture: ComponentFixture<CardDisputesComponent>;
  let component: CardDisputesComponent;
  let api: CardImplementationApiStub;

  const bolt: DisputedCard = {
    oracleId: 'o-bolt',
    name: 'Lightning Bolt',
    readings: [
      { model: 'model-a', definitionJson: JSON.stringify({ effects: [{ amount: 3 }] }) },
      { model: 'model-b', definitionJson: JSON.stringify({ effects: [{ amount: 2 }] }) },
    ],
    firstDifference: 'effects[0].amount',
  };
  const shock: DisputedCard = {
    oracleId: 'o-shock',
    name: 'Shock',
    readings: [
      { model: 'model-a', definitionJson: JSON.stringify({ effects: [{ amount: 2 }] }) },
      { model: 'model-b', definitionJson: JSON.stringify({ effects: [{ amount: 1 }] }) },
    ],
    firstDifference: 'effects[0].amount',
  };

  async function open(disputed: DisputedCard[]) {
    api = new CardImplementationApiStub();
    api.disputed = disputed;

    await TestBed.configureTestingModule({
      imports: [CardDisputesComponent],
      providers: [CardDisputeDiffService, { provide: CardImplementationApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(CardDisputesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ---- the queue --------------------------------------------------------------

  it('lists a card per dispute with both readings side by side', async () => {
    await open([bolt, shock]);
    expect(fixture.debugElement.queryAll(By.css('.cd-card')).length).toBe(2);
    expect(fixture.debugElement.queryAll(By.css('.cd-card .cd-reading')).length).toBe(4);
    expect(
      fixture.debugElement.queryAll(By.css('.cd-model')).map((el) => el.nativeElement.textContent),
    ).toEqual(['model-a', 'model-b', 'model-a', 'model-b']);
  });

  it('says so when nothing is disputed rather than showing an empty page', async () => {
    await open([]);
    expect(fixture.debugElement.query(By.css('.empty-state'))).not.toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.cd-card')).length).toBe(0);
  });

  it('offers a retry when the queue itself fails to load', async () => {
    await open([]);
    spyOn(api, 'listDisputed').and.returnValue(throwError(() => new Error('502')));
    component.load();
    fixture.detectChanges();
    expect(component.loadFailed).toBe(true);
    expect(fixture.debugElement.query(By.css('.cd-retry'))).not.toBeNull();
  });

  // ---- the highlight, in the DOM ---------------------------------------------

  it('marks the first differing line in each reading', async () => {
    await open([bolt]);
    const marked = fixture.debugElement
      .queryAll(By.css('.cd-line.is-diff'))
      .map((el) => (el.nativeElement.textContent as string).trim());
    expect(marked).toEqual(['"amount": 3', '"amount": 2']);
  });

  it('says the path is missing rather than silently marking nothing', async () => {
    await open([{ ...bolt, firstDifference: 'effects[0].nowhere' }]);
    expect(fixture.debugElement.queryAll(By.css('.cd-line.is-diff')).length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('.cd-not-located')).length).toBe(2);
  });

  // ---- choosing ---------------------------------------------------------------

  it('posts the chosen model and drops the card from the list', async () => {
    await open([bolt, shock]);
    const chooseB = fixture.debugElement.queryAll(By.css('.cd-card .cd-choose'))[1];
    chooseB.nativeElement.click();
    fixture.detectChanges();

    expect(api.chosen).toEqual([{ oracleId: 'o-bolt', model: 'model-b' }]);
    expect(component.rows.map((r) => r.card.oracleId)).toEqual(['o-shock']);
    expect(fixture.debugElement.queryAll(By.css('.cd-card')).length).toBe(1);
  });

  it('keeps the card and says so when the choice is refused', async () => {
    await open([bolt]);
    api.chooseFails = true;
    fixture.debugElement.query(By.css('.cd-choose')).nativeElement.click();
    fixture.detectChanges();

    expect(component.rows.length).toBe(1);
    expect(component.rows[0].error).toContain('still disputed');
    expect(fixture.debugElement.query(By.css('.cd-error'))).not.toBeNull();
    // The readings are still there — a failed request must not cost the reader the two
    // documents they had just finished comparing.
    expect(fixture.debugElement.queryAll(By.css('.cd-reading')).length).toBe(2);
  });

  it('ignores a second click while a choice is in flight', async () => {
    await open([bolt]);
    const buttons = fixture.debugElement.queryAll(By.css('.cd-choose'));
    const row = component.rows[0];
    row.choosing = 'model-a';
    component.choose(row, 'model-b');
    expect(api.chosen).toEqual([]);
    expect(buttons.length).toBe(2);
  });
});
