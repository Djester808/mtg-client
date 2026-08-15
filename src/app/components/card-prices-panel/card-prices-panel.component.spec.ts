import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { CardPricesPanelComponent } from './card-prices-panel.component';
import { CardPricesDto, PrintingDto } from '../../models/game.models';
import { GameApiService } from '../../services/game-api.service';
import { makeCard } from '../../testing/test-factories';

function makePrinting(overrides: Partial<PrintingDto> = {}): PrintingDto {
  return {
    scryfallId: 'scryfall-1',
    setCode: 'm21',
    setName: 'Core Set 2021',
    collectorNumber: '123',
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriLarge: null,
    imageUriNormalBack: null,
    oracleText: null,
    flavorText: null,
    artist: null,
    manaCost: null,
    ...overrides,
  };
}

function prices(
  usd: number | null,
  usdFoil: number | null = null,
  tcgplayerId: number | null = null,
): CardPricesDto {
  return {
    usd,
    usdFoil,
    usdEtched: null,
    eur: null,
    eurFoil: null,
    tix: null,
    tcgplayerId,
    cardmarketId: null,
    mtgoId: null,
  };
}

describe('CardPricesPanelComponent', () => {
  let component: CardPricesPanelComponent;
  let fixture: ComponentFixture<CardPricesPanelComponent>;
  let api: jasmine.SpyObj<GameApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<GameApiService>('GameApiService', ['getPriceHistory']);
    api.getPriceHistory.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CardPricesPanelComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: GameApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(CardPricesPanelComponent);
    component = fixture.componentInstance;
    component.card = makeCard({ name: 'Sol Ring' });
  });

  // ---- current prices ----------------------------------------------

  it('currentPrices returns the viewed printing prices', () => {
    component.card = makeCard({ prices: prices(9.99) });
    component.printings = [makePrinting({ scryfallId: 's1', prices: prices(1.55) })];
    component.viewedScryfallId = 's1';
    expect(component.currentPrices?.usd).toBe(1.55);
  });

  it('currentPrices falls back to the base card when no printing is viewed', () => {
    component.card = makeCard({ prices: prices(9.99) });
    component.printings = [];
    component.viewedScryfallId = null;
    expect(component.currentPrices?.usd).toBe(9.99);
  });

  it('currentPrices is null when neither printing nor card has price data', () => {
    component.card = makeCard();
    component.printings = [makePrinting({ scryfallId: 's1' })];
    component.viewedScryfallId = 's1';
    expect(component.currentPrices).toBeNull();
  });

  // ---- marketplace links -------------------------------------------

  it('tcgplayerLink targets the viewed printing product page when the id is known', () => {
    component.printings = [makePrinting({ scryfallId: 's1', prices: prices(1.55, null, 235542) })];
    component.viewedScryfallId = 's1';
    expect(component.tcgplayerLink).toBe('https://www.tcgplayer.com/product/235542');
  });

  it('tcgplayerLink falls back to a name search when no id exists', () => {
    component.printings = [];
    expect(component.tcgplayerLink).toContain('q=Sol%20Ring');
  });

  it('printingMarketLink uses that row printing id, not the viewed one', () => {
    const row = makePrinting({ scryfallId: 's2', prices: prices(2, null, 999) });
    expect(component.printingMarketLink(row)).toBe('https://www.tcgplayer.com/product/999');
  });

  // ---- all printings -----------------------------------------------

  it('pricedPrintings sorts cheapest first and drops unpriced printings', () => {
    component.printings = [
      makePrinting({ scryfallId: 'mid', prices: prices(5) }),
      makePrinting({ scryfallId: 'unpriced' }),
      makePrinting({ scryfallId: 'cheap', prices: prices(1.22) }),
      makePrinting({ scryfallId: 'foil-only', prices: prices(null, 3) }),
    ];
    expect(component.pricedPrintings.map((p) => p.scryfallId)).toEqual([
      'cheap',
      'foil-only',
      'mid',
    ]);
  });

  it('pricedPrintings is memoized on the printings array identity', () => {
    component.printings = [makePrinting({ scryfallId: 's1', prices: prices(2) })];
    const first = component.pricedPrintings;
    expect(component.pricedPrintings).toBe(first);
    component.printings = [...component.printings];
    expect(component.pricedPrintings).not.toBe(first);
  });

  it('selecting a printing row emits it for the modal to apply', () => {
    const row = makePrinting({ scryfallId: 's9' });
    spyOn(component.printingSelect, 'emit');
    component.select(row);
    expect(component.printingSelect.emit).toHaveBeenCalledWith(row);
  });

  // ---- history -----------------------------------------------------

  it('fetches history for the viewed printing when the panel is created', () => {
    component.printings = [makePrinting({ scryfallId: 's1' })];
    component.viewedScryfallId = 's1';
    component.ngOnInit();
    expect(api.getPriceHistory).toHaveBeenCalledWith('s1', 90);
  });

  it('refetches when the range changes and caches what it has already loaded', () => {
    component.printings = [makePrinting({ scryfallId: 's1' })];
    component.viewedScryfallId = 's1';
    component.ngOnInit();

    component.selectRange(30);
    expect(api.getPriceHistory).toHaveBeenCalledWith('s1', 30);
    expect(api.getPriceHistory).toHaveBeenCalledTimes(2);

    // Back to a range already fetched — served from cache, no third request.
    component.selectRange(90);
    expect(api.getPriceHistory).toHaveBeenCalledTimes(2);
    expect(component.historyLoading).toBeFalse();
  });

  it('reloads history when the viewed printing changes', () => {
    component.printings = [makePrinting({ scryfallId: 's1' }), makePrinting({ scryfallId: 's2' })];
    component.viewedScryfallId = 's1';
    component.ngOnInit();
    api.getPriceHistory.calls.reset();

    component.viewedScryfallId = 's2';
    component.ngOnChanges({
      viewedScryfallId: new SimpleChange('s1', 's2', false),
    });
    expect(api.getPriceHistory).toHaveBeenCalledWith('s2', 90);
  });

  it('falls back to the default printing when none is pinned', () => {
    component.printings = [makePrinting({ scryfallId: 'newest' })];
    component.viewedScryfallId = null;
    component.ngOnInit();
    expect(api.getPriceHistory).toHaveBeenCalledWith('newest', 90);
  });

  it('does not fetch when there is no printing to ask about', () => {
    component.printings = [];
    component.viewedScryfallId = null;
    component.ngOnInit();
    expect(api.getPriceHistory).not.toHaveBeenCalled();
    expect(component.history).toEqual([]);
  });

  it('toggles between the chart and the table view', () => {
    expect(component.view).toBe('chart');
    component.toggleView();
    expect(component.view).toBe('table');
    component.toggleView();
    expect(component.view).toBe('chart');
  });
});
