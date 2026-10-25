import { ManaColor } from '../models/game.models';
import { BoardZonesService } from './board-zones.service';
import { makePlayer, makeCard } from '../testing/test-factories';
describe('BoardZonesService', () => {
  it('shows only an authorized top card and removes it with the next redacted snapshot', () => {
    const service = new BoardZonesService();
    const card = makeCard({ cardId: 'visible-top' });
    const player = makePlayer([], { libraryCount: 92, topOfLibrary: card });
    expect(service.piles(player)[0].cards).toEqual([card]);
    expect(service.piles(player)[0].count).toBe(92);
    expect(service.piles({ ...player, topOfLibrary: null })[0].cards).toEqual([]);
  });
  it('keeps the top-first graveyard and reverses append-ordered exile without mutating either', () => {
    const newest = makeCard({ cardId: 'new', colors: [ManaColor.Green] });
    const oldest = makeCard({ cardId: 'old' });
    const player = makePlayer([], {
      graveyard: [newest, oldest],
      exile: [oldest, newest],
      libraryCount: 99,
    });
    const service = new BoardZonesService();
    const piles = service.piles(player);
    expect(piles[0].cards).toEqual([]);
    expect(piles[0].top).toBeNull();
    expect(piles[0].count).toBe(99);
    expect(piles[1].top).toBe(newest);
    expect(piles[1].color).toBe('G');
    expect(piles[2].cards).toEqual([newest, oldest]);
    expect(player.exile).toEqual([oldest, newest]);
    expect(service.piles(player)).toBe(piles);
  });
  it('updates empty zones and command cards when a new player snapshot arrives', () => {
    const service = new BoardZonesService(),
      player = makePlayer();
    expect(service.piles(player).every((p) => !p.top)).toBeTrue();
    const updated = {
      ...player,
      command: [makeCard({ colors: [ManaColor.Red, ManaColor.Green] })],
    };
    expect(service.piles(updated)[3].count).toBe(1);
    expect(service.piles(updated)[3].color).toBe('C');
    expect(service.piles(updated)).not.toBe(service.piles(player));
  });
});
