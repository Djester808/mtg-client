import { cardhoarderUrl, cardmarketUrl, tcgplayerUrl } from './market-links';
import { CardPricesDto } from '../models/game.models';

function prices(overrides: Partial<CardPricesDto> = {}): CardPricesDto {
  return {
    usd: null,
    usdFoil: null,
    usdEtched: null,
    eur: null,
    eurFoil: null,
    tix: null,
    tcgplayerId: null,
    cardmarketId: null,
    mtgoId: null,
    ...overrides,
  };
}

describe('market-links', () => {
  it('tcgplayerUrl links the exact product when the id is known', () => {
    expect(tcgplayerUrl(prices({ tcgplayerId: 235542 }), 'Sol Ring')).toBe(
      'https://www.tcgplayer.com/product/235542',
    );
  });

  it('tcgplayerUrl falls back to a name search without an id', () => {
    expect(tcgplayerUrl(prices(), 'Sol Ring')).toContain('q=Sol%20Ring');
    expect(tcgplayerUrl(null, 'Sol Ring')).toContain('tcgplayer.com/search');
  });

  it('cardmarketUrl searches by name', () => {
    expect(cardmarketUrl('Fury Sliver')).toBe(
      'https://www.cardmarket.com/en/Magic/Products/Search?searchString=Fury%20Sliver',
    );
  });

  it('cardhoarderUrl links the exact card when the MTGO id is known', () => {
    expect(cardhoarderUrl(prices({ mtgoId: 67330 }), 'Sol Ring')).toBe(
      'https://www.cardhoarder.com/cards/67330',
    );
  });

  it('cardhoarderUrl falls back to a name search without an MTGO id', () => {
    expect(cardhoarderUrl(prices(), 'Sol Ring')).toContain('search%5D=Sol%20Ring');
  });

  it('encodes names that contain URL-hostile characters', () => {
    expect(tcgplayerUrl(prices(), 'Borrowing 100,000 Arrows')).toContain(
      'q=Borrowing%20100%2C000%20Arrows',
    );
  });
});
