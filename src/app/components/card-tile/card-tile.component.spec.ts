import { CardTileComponent } from './card-tile.component';
import { CollectionCardDto, CardType } from '../../models/game.models';

function card(details: Record<string, unknown> | null = {}): CollectionCardDto {
  return {
    id: 'r1',
    oracleId: 'o1',
    scryfallId: 's1',
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    addedAt: '',
    cardDetails:
      details === null
        ? null
        : ({ name: 'Card', cardTypes: [], subtypes: [], supertypes: [], ...details } as never),
  } as CollectionCardDto;
}

/** No TestBed: what the tile owns beyond markup is the type line and the flip guard. */
describe('CardTileComponent', () => {
  let c: CardTileComponent;
  beforeEach(() => (c = new CardTileComponent()));

  it('builds the overlay type line from the card', () => {
    c.card = card({ cardTypes: [CardType.Creature], subtypes: ['Wolf'] });
    expect(c.typeLine).toContain('Creature');
    expect(c.typeLine).toContain('Wolf');
  });

  it('reads as empty for a card whose details have not loaded', () => {
    c.card = card(null);
    expect(c.typeLine).toBe('');
  });

  it('memoizes the type line on card identity — the overlay binds it every pass', () => {
    c.card = card({ cardTypes: [CardType.Instant] });
    const first = c.typeLine;
    expect(c.typeLine).toBe(first);

    c.card = card({ cardTypes: [CardType.Land] });
    expect(c.typeLine).not.toBe(first);
  });

  it('flipping does not reach the tile underneath, which would open the modal', () => {
    c.card = card();
    let stopped = false;
    const seen: MouseEvent[] = [];
    c.flip.subscribe((e) => seen.push(e));
    const e = {
      stopPropagation: () => {
        stopped = true;
      },
    } as unknown as MouseEvent;

    c.onFlip(e);
    expect(stopped).toBeTrue();
    expect(seen).toEqual([e]);
  });
});
