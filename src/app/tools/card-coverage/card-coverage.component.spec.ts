import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { CardCoverageComponent } from './card-coverage.component';
import { CardCoverageViewService } from './card-coverage-view.service';
import {
  CardCoverage,
  CardImplementationApiService,
  CardImplementationApiStub,
} from '../../services/card-implementation-api.service';

/**
 * The dashboard, from the coverage document to what is on screen.
 *
 * The real `CardCoverageViewService` is used rather than a spy: what is worth proving is that the
 * complete row and the ranked list reach the DOM, and a spied builder would pass against a
 * template that rendered neither.
 */
describe('CardCoverageComponent', () => {
  let fixture: ComponentFixture<CardCoverageComponent>;
  let component: CardCoverageComponent;
  let api: CardImplementationApiStub;

  const ledger: CardCoverage = {
    total: 40,
    byStatus: { Untranslated: 20, Translated: 8, Disputed: 5, Verified: 6, Excluded: 1 },
    primitiveBacklog: [
      { reason: 'cannot express: replacement effects', cardsBlocked: 4 },
      { reason: 'cannot express: layered pt-setting', cardsBlocked: 21 },
      { reason: 'cannot express: hidden zones', cardsBlocked: 9 },
    ],
    lastVerification: {
      engineHash: 'abc1234',
      runId: 'run-9',
      passed: 12,
      total: 15,
      at: '2026-09-06T18:00:00Z',
    },
  };

  async function open(coverage: CardCoverage) {
    api = new CardImplementationApiStub();
    api.coverage = coverage;

    await TestBed.configureTestingModule({
      imports: [CardCoverageComponent],
      providers: [
        CardCoverageViewService,
        provideRouter([]),
        { provide: CardImplementationApiService, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CardCoverageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const textOf = (css: string) =>
    fixture.debugElement
      .queryAll(By.css(css))
      .map((el) => (el.nativeElement.textContent as string).trim());

  afterEach(() => TestBed.resetTestingModule());

  // ---- the count row ----------------------------------------------------------

  it('shows a figure for all five statuses, in pipeline order, with the total', async () => {
    await open(ledger);

    expect(textOf('.cc-figure-label')).toEqual([
      'Untranslated',
      'Translated',
      'Disputed',
      'Verified',
      'Excluded',
    ]);
    expect(textOf('.cc-figure-count')).toEqual(['20', '8', '5', '6', '1']);
    expect(textOf('.cc-total-count')).toEqual(['40']);
  });

  it('gives a status the server did not mention a zero rather than leaving a hole in the row', async () => {
    await open({ ...ledger, total: 6, byStatus: { Verified: 6 } });

    expect(fixture.debugElement.queryAll(By.css('.cc-figure')).length).toBe(5);
    expect(textOf('.cc-figure-count')).toEqual(['0', '0', '0', '6', '0']);
  });

  it('sends the disputed figure to the queue and leaves the other four as plain numbers', async () => {
    await open(ledger);
    const links = fixture.debugElement.queryAll(By.css('.cc-figures a.cc-figure-body'));

    expect(links.length).toBe(1);
    expect(links[0].nativeElement.getAttribute('href')).toBe('/tools/card-disputes');
    expect(links[0].nativeElement.textContent).toContain('Disputed');
  });

  // ---- the backlog ranking ----------------------------------------------------

  it('lists the backlog most-blocking first, with the count on each line', async () => {
    await open(ledger);

    expect(textOf('.cc-backlog-line .cc-reason')).toEqual([
      'cannot express: layered pt-setting',
      'cannot express: hidden zones',
      'cannot express: replacement effects',
    ]);
    expect(textOf('.cc-backlog-line .cc-blocked')).toEqual(['21', '9', '4']);
  });

  it('keeps every backlog line plain text — only the disputed figure is a link', async () => {
    await open(ledger);

    expect(fixture.debugElement.queryAll(By.css('.cc-backlog-line a')).length).toBe(0);
  });

  // ---- the last run -----------------------------------------------------------

  it('says what the last run verified and failed, and marks the number it cannot answer', async () => {
    await open(ledger);

    expect(textOf('.cc-run-figure .cc-run-count')).toEqual(['12', '3', '—']);
    expect(textOf('.cc-run-figure .cc-run-label')).toEqual(['verified', 'failed', 'no scenarios']);
    expect(fixture.debugElement.query(By.css('.cc-gap'))).not.toBeNull();
  });

  it('says no run has been recorded rather than drawing an empty run panel', async () => {
    await open({ ...ledger, lastVerification: null });

    expect(fixture.debugElement.query(By.css('.cc-run'))).toBeNull();
    expect(textOf('.cc-none')[0]).toContain('No verification run');
  });

  // ---- the empty and failed states --------------------------------------------

  it('says the ledger is empty rather than showing five zeroes', async () => {
    await open({ total: 0, byStatus: {}, primitiveBacklog: [], lastVerification: null });

    expect(fixture.debugElement.query(By.css('.empty-state'))).not.toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.cc-figure')).length).toBe(0);
  });

  it('says so when nothing is blocked, without claiming the ledger is empty', async () => {
    await open({ ...ledger, primitiveBacklog: [] });

    expect(fixture.debugElement.queryAll(By.css('.cc-backlog-line')).length).toBe(0);
    expect(textOf('.cc-none')[0]).toContain('Nothing is blocked');
    expect(fixture.debugElement.queryAll(By.css('.cc-figure')).length).toBe(5);
  });

  it('offers a retry and drops the stale figures when coverage fails to load', async () => {
    await open(ledger);
    spyOn(api, 'getCoverage').and.returnValue(throwError(() => new Error('502')));
    component.load();
    fixture.detectChanges();

    expect(component.loadFailed).toBe(true);
    expect(component.view).toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.cc-figure')).length).toBe(0);
    expect(fixture.debugElement.query(By.css('.cc-retry'))).not.toBeNull();
  });
});
