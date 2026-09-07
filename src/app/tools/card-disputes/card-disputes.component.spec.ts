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
 *
 * `firstDifference` carries what the endpoint really sends — an excerpt pair, not a path — so a
 * spec cannot pass here by inventing a contract the server does not honour. That is how the
 * highlight came to be green in the suite and dead on all 105 cards of the live corpus.
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
    firstDifference: '"amount": 3     } | "amount": 2     }',
  };
  const shock: DisputedCard = {
    oracleId: 'o-shock',
    name: 'Shock',
    readings: [
      { model: 'model-a', definitionJson: JSON.stringify({ effects: [{ amount: 2 }] }) },
      { model: 'model-b', definitionJson: JSON.stringify({ effects: [{ amount: 1 }] }) },
    ],
    firstDifference: '"amount": 2     } | "amount": 1     }',
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

  const names = () =>
    fixture.debugElement
      .queryAll(By.css('.cd-pick'))
      .map((el) => (el.nativeElement.textContent as string).trim());

  afterEach(() => TestBed.resetTestingModule());

  // ---- the queue --------------------------------------------------------------

  // One card's readings on screen, not every card's. A hundred pairs of JSON documents rendered
  // at once made a page 120,772px tall at 375px, which is the defect this asserts against.
  it('lists every card but renders one card at a time', async () => {
    await open([bolt, shock]);
    expect(names()).toEqual(['Lightning Bolt', 'Shock']);
    expect(fixture.debugElement.queryAll(By.css('.cd-card')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.cd-reading')).length).toBe(2);
    expect(
      fixture.debugElement.queryAll(By.css('.cd-model')).map((el) => el.nativeElement.textContent),
    ).toEqual(['model-a', 'model-b']);
  });

  it('opens on the first card and swaps to the one picked', async () => {
    await open([bolt, shock]);
    expect(fixture.debugElement.query(By.css('.cd-card-name')).nativeElement.textContent).toContain(
      'Lightning Bolt',
    );

    fixture.debugElement.queryAll(By.css('.cd-pick'))[1].nativeElement.click();
    fixture.detectChanges();

    expect(component.selected?.card.oracleId).toBe('o-shock');
    expect(fixture.debugElement.query(By.css('.cd-card-name')).nativeElement.textContent).toContain(
      'Shock',
    );
    expect(fixture.debugElement.queryAll(By.css('.cd-pick.is-selected')).length).toBe(1);
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

  it('names the differing path in the header', async () => {
    await open([bolt]);
    expect(fixture.debugElement.query(By.css('.cd-path code')).nativeElement.textContent).toBe(
      'effects[0].amount',
    );
  });

  // Marking the line and showing it are two different things. A real definition runs 200 lines
  // inside a 420px scroller, so a highlight nobody scrolls to is a highlight nobody sees.
  it('scrolls each reading to the line it marked', async () => {
    const long = (amount: number) => ({
      filler: Array.from({ length: 200 }, (_, i) => `line ${i}`),
      effects: [{ amount }],
    });
    await open([
      {
        ...bolt,
        readings: [
          { model: 'model-a', definitionJson: JSON.stringify(long(3)) },
          { model: 'model-b', definitionJson: JSON.stringify(long(2)) },
        ],
      },
    ]);
    // The scroll runs on a timer after the row renders, so wait a real macrotask for it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const panels = fixture.debugElement
      .queryAll(By.css('.cd-json'))
      .map((el) => el.nativeElement as HTMLElement);
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      const line = panel.querySelector<HTMLElement>('.cd-line.is-diff');
      expect(line).not.toBeNull();
      expect(panel.scrollTop).toBeGreaterThan(0);
      expect(line!.offsetTop).toBeGreaterThanOrEqual(panel.scrollTop);
      expect(line!.offsetTop).toBeLessThan(panel.scrollTop + panel.clientHeight);
    }
  });

  it('says why rather than silently marking nothing when there is one reading', async () => {
    await open([{ ...bolt, readings: [bolt.readings[0]] }]);
    expect(fixture.debugElement.queryAll(By.css('.cd-line.is-diff')).length).toBe(0);
    expect(
      fixture.debugElement.query(By.css('.cd-path.is-unknown')).nativeElement.textContent,
    ).toContain('one model');
  });

  // ---- choosing ---------------------------------------------------------------

  it('posts the chosen model and advances to the next card', async () => {
    await open([bolt, shock]);
    fixture.debugElement.queryAll(By.css('.cd-choose'))[1].nativeElement.click();
    fixture.detectChanges();

    expect(api.chosen).toEqual([{ oracleId: 'o-bolt', model: 'model-b' }]);
    expect(component.rows.map((r) => r.card.oracleId)).toEqual(['o-shock']);
    expect(component.selected?.card.oracleId).toBe('o-shock');
    expect(names()).toEqual(['Shock']);
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
