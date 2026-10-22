import { uiReducer } from './ui.reducer';
import { UIActions } from './ui.actions';
import { GameActions } from '../game/game.actions';

/**
 * The picks a player makes before confirming a declaration.
 *
 * These are held in the UI slice and read back out by `confirmAttackers$` / `confirmBlockers$`
 * to build the message sent to the engine. NgRx runs every reducer before any effect, so what
 * this reducer does on the confirm action decides whether the effect has anything to send —
 * which is why clearing them a moment too early was invisible and total.
 */
describe('uiReducer — combat declarations', () => {
  const initial = uiReducer(undefined, { type: '@@init' });

  describe('attackers', () => {
    const withPicks = () => {
      let state = uiReducer(initial, UIActions.enterAttackMode());
      state = uiReducer(state, UIActions.toggleAttacker({ permanentId: 'a1' }));
      return uiReducer(state, UIActions.toggleAttacker({ permanentId: 'a2' }));
    };

    it('collects the creatures tapped for the attack', () => {
      expect(withPicks().pendingAttackerIds).toEqual(['a1', 'a2']);
      expect(withPicks().mode).toBe('declaring-attackers');
    });

    it('un-picks one tapped again', () => {
      const state = uiReducer(withPicks(), UIActions.toggleAttacker({ permanentId: 'a1' }));
      expect(state.pendingAttackerIds).toEqual(['a2']);
    });

    it('keeps the picks when the attack is confirmed, so the effect can read them', () => {
      // The bug this exists for: the reducer cleared them on this action, the effect read the
      // store afterwards and found nothing, and the board declared no attackers however many
      // had been chosen. You could pick creatures, watch them light up, press Confirm, and
      // attack with nothing.
      const state = uiReducer(withPicks(), UIActions.confirmAttackers());

      expect(state.pendingAttackerIds).toEqual(['a1', 'a2']);
      expect(state.mode).toBe('idle');
    });

    it('clears them once the declaration has actually been sent', () => {
      let state = uiReducer(withPicks(), UIActions.confirmAttackers());
      state = uiReducer(state, GameActions.declareAttackers({ attackerIds: ['a1', 'a2'] }));

      expect(state.pendingAttackerIds).toEqual([]);
    });

    it('throws the picks away when the attack is cancelled instead', () => {
      const state = uiReducer(withPicks(), UIActions.cancelAttackMode());

      expect(state.pendingAttackerIds).toEqual([]);
      expect(state.mode).toBe('idle');
    });
  });

  describe('blockers', () => {
    const withAssignments = () => {
      let state = uiReducer(initial, UIActions.enterBlockMode());
      state = uiReducer(state, UIActions.assignBlocker({ blockerId: 'b1', attackerId: 'a1' }));
      return uiReducer(state, UIActions.assignBlocker({ blockerId: 'b2', attackerId: 'a1' }));
    };

    it('collects which attacker each blocker is on (CR 509.1)', () => {
      expect(withAssignments().pendingBlockerAssignments).toEqual({ b1: 'a1', b2: 'a1' });
    });

    it('keeps them when the block is confirmed, so the effect can read them', () => {
      const state = uiReducer(withAssignments(), UIActions.confirmBlockers());

      expect(state.pendingBlockerAssignments).toEqual({ b1: 'a1', b2: 'a1' });
      expect(state.mode).toBe('idle');
    });

    it('clears them once the declaration has actually been sent', () => {
      let state = uiReducer(withAssignments(), UIActions.confirmBlockers());
      state = uiReducer(state, GameActions.declareBlockers({ blockerToAttacker: { b1: 'a1' } }));

      expect(state.pendingBlockerAssignments).toEqual({});
    });

    it('throws them away when the block is cancelled instead', () => {
      const state = uiReducer(withAssignments(), UIActions.cancelBlockMode());

      expect(state.pendingBlockerAssignments).toEqual({});
      expect(state.mode).toBe('idle');
    });
  });
});

describe('four-player attack and blocker drafts', () => {
  const initial = () => uiReducer(undefined, { type: '@@init' });
  it('retains a distinct defender for each attacker through confirmation', () => {
    let state = uiReducer(initial(), UIActions.enterAttackMode());
    state = uiReducer(state, UIActions.setAttackDefender({ playerId: 'p1' }));
    state = uiReducer(state, UIActions.toggleAttacker({ permanentId: 'o1' }));
    state = uiReducer(state, UIActions.setAttackDefender({ playerId: 'p2' }));
    state = uiReducer(state, UIActions.toggleAttacker({ permanentId: 'o2' }));
    state = uiReducer(state, UIActions.confirmAttackers());
    expect(state.pendingAttackerTargets).toEqual({ o1: 'p1', o2: 'p2' });
  });
  it('clears sent targets without touching the authoritative game state', () => {
    let state = uiReducer(initial(), UIActions.setAttackDefender({ playerId: 'p1' }));
    state = uiReducer(state, UIActions.toggleAttacker({ permanentId: 'o1' }));
    state = uiReducer(
      state,
      GameActions.declareAttackers({ attackerIds: ['o1'], defenders: { o1: 'p1' } }),
    );
    expect(state.pendingAttackerTargets).toEqual({});
    expect(state.pendingAttackerIds).toEqual([]);
  });
  it('keeps a selected blocker independent from card inspection and stores its assignment', () => {
    let state = uiReducer(initial(), UIActions.enterBlockMode());
    state = uiReducer(state, UIActions.selectBlocker({ permanentId: 'o3' }));
    expect(state.selectedPermanentId).toBeNull();
    state = uiReducer(state, UIActions.assignBlocker({ blockerId: 'o3', attackerId: 'o1' }));
    expect(state.pendingBlockerAssignments).toEqual({ o3: 'o1' });
    expect(state.selectedBlockerId).toBeNull();
  });
});
