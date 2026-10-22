import { selectTableSeats } from '../store/selectors';
import { makePlayer, makePermanent } from '../testing/test-factories';
describe('Real multiplayer table projection', () => {
  for (const count of [2, 3, 4])
    it('keeps circular seats for every viewer at ' + count + ' players', () => {
      const players = Array.from({ length: count }, (_, i) =>
        makePlayer([], { playerId: 'p' + i, name: 'Seat ' + i }),
      );
      const field = players.map((p) =>
        makePermanent({ permanentId: 'o' + p.playerId, controllerId: p.playerId }),
      );
      for (let viewer = 0; viewer < count; viewer++) {
        const seats = selectTableSeats.projector(players, field, 'p' + viewer);
        expect(seats.map((s) => s.seat)).toEqual(
          Array.from({ length: count }, (_, i) => (viewer + i) % count),
        );
        expect(seats[0].isLocal).toBeTrue();
        expect(seats.slice(1).every((s) => !s.isLocal)).toBeTrue();
        expect(
          seats.every((s) => s.permanents.every((p) => p.controllerId === s.player.playerId)),
        ).toBeTrue();
      }
    });
});
