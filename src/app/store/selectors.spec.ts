import { selectPreviewCard } from './selectors';
import { PlayerStateDto, PermanentDto, CardDto } from '../models/game.models';
import { makeCard, makePlayer, makePermanent as makePermanentBase } from '../testing/test-factories';

// Tests use the selector's .projector() — a pure function that takes the input
// selector results directly, bypassing NgRx glue entirely.

function makePermanent(permanentId: string, sourceCard: CardDto): PermanentDto {
  return makePermanentBase({
    permanentId,
    sourceCard,
    effectivePower: sourceCard.power,
    effectiveToughness: sourceCard.toughness,
  });
}

describe('selectPreviewCard', () => {
  const projector = (selectPreviewCard as any).projector as (
    player: PlayerStateDto | null,
    cardId: string | null,
    battlefield: PermanentDto[],
    permId: string | null,
  ) => CardDto | null;

  it('returns null when nothing is selected', () => {
    expect(projector(null, null, [], null)).toBeNull();
  });

  it('returns null when player is null but cardId is set', () => {
    expect(projector(null, 'card-1', [], null)).toBeNull();
  });

  it('finds a card in hand by selectedCardId', () => {
    const card = makeCard({ cardId: 'card-1', name: 'Forest' });
    const player = makePlayer([card]);

    const result = projector(player, 'card-1', [], null);

    expect(result).toBe(card);
  });

  it('returns null when selectedCardId does not match any hand card', () => {
    const card = makeCard({ cardId: 'card-1' });
    const player = makePlayer([card]);

    const result = projector(player, 'card-missing', [], null);

    expect(result).toBeNull();
  });

  it('finds a permanent source card by selectedPermId', () => {
    const card = makeCard({ cardId: 'card-2', name: 'Bear' });
    const perm = makePermanent('perm-1', card);

    const result = projector(null, null, [perm], 'perm-1');

    expect(result).toBe(card);
  });

  it('returns null when selectedPermId does not match any permanent', () => {
    const card = makeCard({ cardId: 'card-2' });
    const perm = makePermanent('perm-1', card);

    const result = projector(null, null, [perm], 'perm-missing');

    expect(result).toBeNull();
  });

  it('prefers selectedCardId over selectedPermId when both are set', () => {
    const handCard = makeCard({ cardId: 'card-hand', name: 'Hand Card' });
    const permCard = makeCard({ cardId: 'card-perm', name: 'Perm Card' });
    const player = makePlayer([handCard]);
    const perm = makePermanent('perm-1', permCard);

    const result = projector(player, 'card-hand', [perm], 'perm-1');

    expect(result).toBe(handCard);
  });

  it('finds the correct card when hand has multiple cards', () => {
    const card1 = makeCard({ cardId: 'c1', name: 'First' });
    const card2 = makeCard({ cardId: 'c2', name: 'Second' });
    const card3 = makeCard({ cardId: 'c3', name: 'Third' });
    const player = makePlayer([card1, card2, card3]);

    expect(projector(player, 'c2', [], null)).toBe(card2);
    expect(projector(player, 'c3', [], null)).toBe(card3);
  });
});
