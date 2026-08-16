import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CardHistoryPanelComponent } from './card-history-panel.component';
import { CardHistoryEntryDto, CardHistoryEventType } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';

function entry(overrides: Partial<CardHistoryEntryDto> = {}): CardHistoryEntryDto {
  return {
    id: 'evt-1',
    eventType: 'Added' as CardHistoryEventType,
    collectionId: 'col-1',
    collectionName: 'Modern Staples',
    isDeck: false,
    board: 'main',
    scryfallId: 'scry-1',
    setCode: 'lea',
    quantityDelta: 1,
    quantityFoilDelta: 0,
    quantityAfter: 1,
    quantityFoilAfter: 0,
    counterpartCollectionId: null,
    counterpartCollectionName: null,
    priceUsd: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('CardHistoryPanelComponent', () => {
  let component: CardHistoryPanelComponent;
  let fixture: ComponentFixture<CardHistoryPanelComponent>;
  let api: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<GameApiService>('GameApiService', ['getCardHistory']);
    api.getCardHistory.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CardHistoryPanelComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: GameApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(CardHistoryPanelComponent);
    component = fixture.componentInstance;
  });

  function init(oracleId: string | null = 'oracle-1'): void {
    component.oracleId = oracleId;
    fixture.detectChanges();
  }

  // ---- Loading ---------------------------------------------------------

  it('fetches history for the oracle id on init', () => {
    init();
    expect(api.getCardHistory).toHaveBeenCalledWith('oracle-1');
  });

  it('does not call the API without an oracle id', () => {
    init(null);
    expect(api.getCardHistory).not.toHaveBeenCalled();
  });

  it('refetches when the card changes', () => {
    init();
    component.oracleId = 'oracle-2';
    component.ngOnChanges({ oracleId: new SimpleChange('oracle-1', 'oracle-2', false) });
    expect(api.getCardHistory).toHaveBeenCalledWith('oracle-2');
  });

  // ---- Refetching after a change made with the tab open -----------------

  it('refetches when the card it is showing changes copies', fakeAsync(() => {
    init();
    api.getCardHistory.calls.reset();

    component.reloadKey = '3:0:';
    component.ngOnChanges({ reloadKey: new SimpleChange('2:0:', '3:0:', false) });
    // Deferred on purpose: the host updates optimistically, so an immediate refetch would
    // race the write and return the list without the event we are refetching for.
    expect(api.getCardHistory).not.toHaveBeenCalled();

    tick(500);
    expect(api.getCardHistory).toHaveBeenCalledWith('oracle-1');
  }));

  it('coalesces a burst of changes into a single refetch', fakeAsync(() => {
    init();
    api.getCardHistory.calls.reset();

    for (let i = 2; i <= 5; i++) {
      component.reloadKey = `${i}:0:`;
      component.ngOnChanges({ reloadKey: new SimpleChange(`${i - 1}:0:`, `${i}:0:`, false) });
      tick(100);
    }
    tick(500);

    expect(api.getCardHistory).toHaveBeenCalledTimes(1);
  }));

  it('ignores the reload key on first bind, since ngOnInit already fetched', fakeAsync(() => {
    init();
    api.getCardHistory.calls.reset();
    component.ngOnChanges({ reloadKey: new SimpleChange(null, '1:0:', true) });
    tick(500);
    expect(api.getCardHistory).not.toHaveBeenCalled();
  }));

  it('answers a card change immediately rather than on the reload delay', () => {
    init();
    api.getCardHistory.calls.reset();
    component.oracleId = 'oracle-2';
    component.ngOnChanges({ oracleId: new SimpleChange('oracle-1', 'oracle-2', false) });
    // No tick: a different card is a different question, not a newer answer.
    expect(api.getCardHistory).toHaveBeenCalledWith('oracle-2');
  });

  it('flags a failure instead of showing it as an empty history', () => {
    api.getCardHistory.and.returnValue(throwError(() => new Error('boom')));
    init();
    expect(component.failed).toBe(true);
    expect(component.loading).toBe(false);
  });

  it('recovers from a failure when retry is clicked', () => {
    api.getCardHistory.and.returnValue(throwError(() => new Error('boom')));
    init();
    api.getCardHistory.and.returnValue(of([entry()]));
    component.retry();

    expect(component.failed).toBe(false);
    expect(component.entries.length).toBe(1);
  });

  // ---- Rows ------------------------------------------------------------

  it('memoizes rows on the entries identity', () => {
    api.getCardHistory.and.returnValue(of([entry()]));
    init();
    const first = component.rows;
    expect(component.rows).toBe(first);
  });

  it('describes an add with its copy count', () => {
    api.getCardHistory.and.returnValue(
      of([
        entry({ quantityDelta: 2, quantityFoilDelta: 1, quantityAfter: 2, quantityFoilAfter: 1 }),
      ]),
    );
    init();
    const row = component.rows[0];
    expect(row.headline).toBe('Added 2 + 1 foil');
    expect(row.detail).toContain('Modern Staples');
    expect(row.tone).toBe('gain');
  });

  it('reads a negative quantity change as a removal, not an add', () => {
    api.getCardHistory.and.returnValue(
      of([entry({ eventType: 'QuantityChanged', quantityDelta: -2, quantityAfter: 1 })]),
    );
    init();
    expect(component.rows[0].headline).toBe('Removed 2');
    expect(component.rows[0].tone).toBe('loss');
  });

  it('names the other end of a move', () => {
    api.getCardHistory.and.returnValue(
      of([
        entry({
          eventType: 'MovedOut',
          quantityDelta: -1,
          quantityAfter: 2,
          counterpartCollectionName: 'Commander',
        }),
      ]),
    );
    init();
    expect(component.rows[0].headline).toBe('Moved 1 to Commander');
  });

  it('marks a deck as a deck so it is not mistaken for a collection', () => {
    api.getCardHistory.and.returnValue(of([entry({ collectionName: 'Atraxa', isDeck: true })]));
    init();
    expect(component.rows[0].detail).toContain('Atraxa (deck)');
  });

  it('names a non-main board', () => {
    api.getCardHistory.and.returnValue(of([entry({ board: 'side' })]));
    init();
    expect(component.rows[0].detail).toContain('side');
  });

  it('says "none left" rather than "0 after" on a removal', () => {
    api.getCardHistory.and.returnValue(
      of([entry({ eventType: 'Removed', quantityDelta: -3, quantityAfter: 0 })]),
    );
    init();
    expect(component.rows[0].detail).toContain('none left');
  });

  it('treats a printing change as neither a gain nor a loss', () => {
    api.getCardHistory.and.returnValue(
      of([entry({ eventType: 'PrintingChanged', quantityDelta: 0, quantityFoilDelta: 0 })]),
    );
    init();
    expect(component.rows[0].headline).toBe('Changed printing');
    expect(component.rows[0].tone).toBe('neutral');
  });

  it('formats copies with and without foils', () => {
    expect(CardHistoryPanelComponent.copies(2, 0)).toBe('2');
    expect(CardHistoryPanelComponent.copies(0, 1)).toBe('1 foil');
    expect(CardHistoryPanelComponent.copies(2, 1)).toBe('2 + 1 foil');
  });
});
