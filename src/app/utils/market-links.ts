import { CardPricesDto } from '../models/game.models';

/**
 * Listing links for the marketplaces behind Scryfall's daily prices: USD prices are
 * TCGplayer, EUR are Cardmarket, tix are Cardhoarder (MTGO). Product ids give an exact
 * listing page; when a marketplace has no id-based public URL (Cardmarket) or the id is
 * missing, fall back to a name search on that marketplace.
 */

export function tcgplayerUrl(prices: CardPricesDto | null | undefined, name: string): string {
  return prices?.tcgplayerId != null
    ? `https://www.tcgplayer.com/product/${prices.tcgplayerId}`
    : `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(name)}`;
}

export function cardmarketUrl(name: string): string {
  return `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
}

export function cardhoarderUrl(prices: CardPricesDto | null | undefined, name: string): string {
  return prices?.mtgoId != null
    ? `https://www.cardhoarder.com/cards/${prices.mtgoId}`
    : `https://www.cardhoarder.com/cards?data%5Bsearch%5D=${encodeURIComponent(name)}`;
}
